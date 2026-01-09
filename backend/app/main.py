from __future__ import annotations

import asyncio
import functools
import json
from pathlib import Path
from typing import AsyncGenerator, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .config import load_agents, load_llm_defaults
from .schemas import AgentDefinition, AgentsResponse, ChatStreamRequest
from .sessions import SessionStore
from .utils import parse_mentions


agents = load_agents()
llm_defaults = load_llm_defaults()
store = SessionStore(agents=agents, llm_defaults=llm_defaults)

app = FastAPI(title="Multi-Agent Group Chat Backend", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== 请求模型 ==========

class InvokeAgentRequest(BaseModel):
    """直接调用 Agent 的请求（不发送消息，仅调用）"""
    session_id: Optional[str] = Field(default=None, description="会话 ID")
    agent_name: str = Field(..., description="要调用的 Agent 名称")


class AddMessageRequest(BaseModel):
    """仅添加消息到上下文（不调用任何 Agent）"""
    session_id: Optional[str] = Field(default=None, description="会话 ID")
    message: str = Field(..., description="要添加的消息内容")
    images: List[str] = Field(default=[], description="Base64 编码的图片列表")

class CreateSessionRequest(BaseModel):
    name: str = "新讨论组"
    global_prompt: str = ""

class UpdateSessionRequest(BaseModel):
    name: Optional[str] = None
    global_prompt: Optional[str] = None

class ForkSessionRequest(BaseModel):
    """从某条消息处创建分支会话"""
    message_id: str = Field(..., description="要分支的消息 ID")
    new_name: Optional[str] = Field(default=None, description="新会话名称（可选）")

class UpdateMessageRequest(BaseModel):
    """编辑消息内容"""
    content: str = Field(..., description="新的消息内容")


# ========== 工具函数 ==========

def _ds(code: str, value) -> str:
    """Vercel AI SDK data-stream 格式"""
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return f"{code}:{payload}\n"


async def _create_stream_response(
    session,
    task: asyncio.Task,
    listener,
    queue: asyncio.Queue,
    extra_final_events: Optional[List[dict]] = None
) -> AsyncGenerator[str, None]:
    """
    通用的流式响应生成器。
    
    Args:
        session: ChatSession 实例
        task: 后台任务（chat 或 invoke）
        listener: 事件监听器
        queue: 事件队列
        extra_final_events: 任务完成后需要发送的额外事件（如 user_message_id）
    """
    stream_message_ids: dict = {}  # speaker -> message_id
    
    try:
        yield _ds("0", "")
        yield _ds("2", [{"event": "session", "data": {"session_id": session.session_id}}])

        while True:
            if task.done() and queue.empty():
                break
            try:
                event_type, speaker, content = await asyncio.wait_for(queue.get(), timeout=0.05)
            except asyncio.TimeoutError:
                continue

            if event_type == "stream_start":
                message_id = f"{session.session_id}:{speaker}:{asyncio.get_running_loop().time()}"
                stream_message_ids[speaker] = message_id
                yield _ds("2", [{"event": "stream_start", "data": {"message_id": message_id, "speaker": speaker}}])
            
            elif event_type == "stream_delta":
                message_id = stream_message_ids.get(speaker, "")
                yield _ds("2", [{"event": "stream_delta", "data": {"message_id": message_id, "speaker": speaker, "content": content}}])
            
            elif event_type == "stream_end":
                message_id = stream_message_ids.pop(speaker, "")
                yield _ds("2", [{"event": "stream_end", "data": {"message_id": message_id, "speaker": speaker, "content": content}}])
            
            elif event_type == "message":
                message_id = f"{session.session_id}:{speaker}:{asyncio.get_running_loop().time()}"
                yield _ds("2", [{"event": "message", "data": {"message_id": message_id, "speaker": speaker, "content": content}}])

        # 发送额外的结束事件
        if extra_final_events:
            for event in extra_final_events:
                yield _ds("2", [event])
        
        yield _ds("2", [{"event": "done", "data": {}}])
    finally:
        session.remove_listener(listener)


# ========== API 端点 ==========

@app.get("/agents", response_model=AgentsResponse)
def get_agents():
    from fastapi.responses import JSONResponse
    return JSONResponse(
        content={"agents": [a.model_dump() for a in agents]},
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}
    )


@app.post("/agents")
async def save_agents(payload: AgentsResponse):
    """热更新 Agent 配置：保存并刷新内存"""
    new_agents = payload.agents
    
    # 强制更新全局变量
    global agents
    agents[:] = new_agents
    
    # 同步更新 SessionStore
    store.update_agents(new_agents)
    
    # 写入文件
    save_path = Path(__file__).resolve().parent.parent / "agents.json"
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump({"agents": [a.model_dump() for a in new_agents]}, f, indent=2, ensure_ascii=False)
    
    return {"status": "success", "count": len(new_agents)}

# --- Session Management ---

@app.get("/sessions")
def list_sessions():
    return {"sessions": store.list_sessions()}

@app.post("/sessions")
def create_session(req: CreateSessionRequest):
    session = store.create_session(req.name, req.global_prompt)
    return {
        "id": session.session_id,
        "name": session.data.name,
        "global_prompt": session.data.global_prompt,
        "created_at": session.data.created_at
    }

@app.get("/sessions/{session_id}")
def get_session(session_id: str):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # 返回完整历史
    return {
        "id": session.session_id,
        "name": session.data.name,
        "global_prompt": session.data.global_prompt,
        "created_at": session.data.created_at,
        "history": [m.to_dict() for m in session.messages]
    }

@app.patch("/sessions/{session_id}")
def update_session(session_id: str, req: UpdateSessionRequest):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.update_config(name=req.name, global_prompt=req.global_prompt)
    return {"status": "success", "id": session.session_id}

@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    success = store.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "success"}

@app.post("/sessions/{session_id}/fork")
def fork_session(session_id: str, req: ForkSessionRequest):
    """从指定消息处创建分支会话"""
    new_session = store.fork_session_from_message(
        source_session_id=session_id,
        message_id=req.message_id,
        new_name=req.new_name
    )
    if not new_session:
        raise HTTPException(status_code=404, detail="Session or message not found")
    
    return {
        "id": new_session.session_id,
        "name": new_session.data.name,
        "global_prompt": new_session.data.global_prompt,
        "created_at": new_session.data.created_at,
        "message_count": len(new_session.messages)
    }


# --- Chat ---

@app.post("/chat/data")
async def chat_data(req: ChatStreamRequest):
    """处理用户消息（Vercel AI SDK data-stream 格式，支持流式输出）"""
    session = store.get_or_create(req.session_id)
    mention_result = parse_mentions(req.message, [a.name for a in agents])

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    user_msg_id_holder = [None]  # 用于存储用户消息 ID

    def listener(event_type: str, speaker: str, content: str) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, (event_type, speaker, content))

    session.add_listener(listener)

    async def run_chat_in_thread():
        fn = functools.partial(
            session.chat, 
            req.message, 
            mentioned_agents=mention_result.mentioned_agents,
            images=req.images
        )
        user_msg_id = await loop.run_in_executor(None, fn)
        user_msg_id_holder[0] = user_msg_id

    chat_task = asyncio.create_task(run_chat_in_thread())

    # 使用通用流式响应生成器，额外发送 user_message_id 事件
    async def stream_with_user_id():
        async for chunk in _create_stream_response(session, chat_task, listener, queue):
            # 在 done 事件前插入 user_message_id
            if '"event":"done"' in chunk:
                yield _ds("2", [{"event": "user_message_id", "data": {"message_id": user_msg_id_holder[0]}}])
            yield chunk

    return StreamingResponse(stream_with_user_id(), media_type="text/plain; charset=utf-8")


@app.post("/invoke")
async def invoke_agent(req: InvokeAgentRequest):
    """直接调用指定 Agent（支持流式输出，Vercel AI SDK data-stream 格式）"""
    session = store.get_or_create(req.session_id)
    
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def listener(event_type: str, speaker: str, content: str) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, (event_type, speaker, content))

    session.add_listener(listener)

    async def run_invoke_in_thread():
        fn = functools.partial(session.invoke_agent, req.agent_name)
        await loop.run_in_executor(None, fn)

    invoke_task = asyncio.create_task(run_invoke_in_thread())

    # 使用通用流式响应生成器
    return StreamingResponse(
        _create_stream_response(session, invoke_task, listener, queue),
        media_type="text/plain; charset=utf-8"
    )


@app.post("/message")
async def add_message(req: AddMessageRequest):
    """仅添加消息到上下文，返回消息 ID"""
    session = store.get_or_create(req.session_id)
    msg_id = session.add_user_message(req.message, req.images)
    
    return {
        "status": "success",
        "session_id": session.session_id,
        "message_id": msg_id,
        "message_count": len(session.messages)
    }


# --- Message Edit/Delete ---

@app.patch("/sessions/{session_id}/messages/{message_id}")
async def update_message(session_id: str, message_id: str, req: UpdateMessageRequest):
    """编辑指定消息的内容"""
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    success = session.update_message(message_id, req.content)
    if not success:
        raise HTTPException(status_code=404, detail="Message not found")
    
    return {"status": "success", "message_id": message_id}


@app.delete("/sessions/{session_id}/messages/{message_id}")
async def delete_message(session_id: str, message_id: str):
    """删除指定消息"""
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    success = session.delete_message(message_id)
    if not success:
        raise HTTPException(status_code=404, detail="Message not found")
    
    return {"status": "success", "message_id": message_id}


@app.get("/sessions/{session_id}/messages/{message_id}")
async def get_message(session_id: str, message_id: str):
    """获取指定消息"""
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    message = session.get_message_by_id(message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    return message.to_dict()
