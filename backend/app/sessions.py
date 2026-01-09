"""
轻量级多 Agent 聊天会话管理 (持久化版 v2)

核心设计：
- 消息以中立格式存储（speaker + content + images）
- Session 拆分存储：每个 Session 一个独立 JSON 文件
- 支持 Session 级别的 global_prompt
"""
from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional

from openai import OpenAI

from .config import LlmDefaults
from .schemas import AgentDefinition

# 配置日志
logger = logging.getLogger(__name__)

# --- 数据模型 ---

@dataclass
class ChatMessage:
    speaker: str
    content: str
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    timestamp: float = field(default_factory=time.time)
    images: List[str] = field(default_factory=list)  # base64 编码的图片列表
    
    def to_dict(self) -> dict:
        result = {
            "id": self.id,
            "speaker": self.speaker,
            "content": self.content,
            "timestamp": self.timestamp,
        }
        if self.images:
            result["images"] = self.images
        return result

    @staticmethod
    def from_dict(data: dict) -> "ChatMessage":
        return ChatMessage(
            id=data.get("id", uuid.uuid4().hex[:12]),
            speaker=data["speaker"],
            content=data["content"],
            timestamp=data.get("timestamp", time.time()),
            images=data.get("images", [])
        )

@dataclass
class SessionData:
    """持久化的会话数据结构"""
    id: str
    name: str
    created_at: float
    global_prompt: str = ""
    messages: List[ChatMessage] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at,
            "global_prompt": self.global_prompt,
            "messages": [m.to_dict() for m in self.messages]
        }
    
    @staticmethod
    def from_dict(data: dict) -> "SessionData":
        inst = SessionData(
            id=data["id"],
            name=data.get("name", "未命名会话"),
            created_at=data.get("created_at", time.time()),
            global_prompt=data.get("global_prompt", "")
        )
        if "messages" in data:
            inst.messages = [ChatMessage.from_dict(m) for m in data["messages"]]
        return inst

@dataclass
class SessionIndex:
    """轻量级索引条目（不含消息）"""
    id: str
    name: str
    created_at: float
    global_prompt: str = ""
    message_count: int = 0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at,
            "global_prompt": self.global_prompt,
            "message_count": self.message_count
        }
    
    @staticmethod
    def from_dict(data: dict) -> "SessionIndex":
        return SessionIndex(
            id=data["id"],
            name=data.get("name", "未命名会话"),
            created_at=data.get("created_at", time.time()),
            global_prompt=data.get("global_prompt", ""),
            message_count=data.get("message_count", 0)
        )

# --- 运行时逻辑 ---

# 事件类型常量
EVENT_MESSAGE = "message"          # 完整消息（非流式）
EVENT_STREAM_START = "stream_start"   # 流式开始
EVENT_STREAM_DELTA = "stream_delta"   # 流式增量
EVENT_STREAM_END = "stream_end"       # 流式结束

# 新的监听器类型：接收 (event_type, speaker, content)
AgentStreamListener = Callable[[str, str, str], None]
# 保留旧类型兼容
AgentEventListener = Callable[[str, str], None]
AgentGetter = Callable[[], List[AgentDefinition]]

class ChatSession:
    """
    单个会话的运行时包装类。
    负责业务逻辑：消息流转、LLM 调用、Prompt 组装。
    """
    def __init__(
        self, 
        data: SessionData, 
        llm_defaults: LlmDefaults,
        agent_getter: AgentGetter,
        persistence_callback: Callable[[SessionData], None]
    ):
        self.data = data
        self.llm_defaults = llm_defaults
        self._agent_getter = agent_getter
        self._save = persistence_callback
        self._stream_listeners: List[AgentStreamListener] = []
        self._listener_lock = threading.Lock()
    
    @property
    def session_id(self) -> str:
        return self.data.id

    @property
    def agents(self) -> List[AgentDefinition]:
        return self._agent_getter()
    
    @property
    def messages(self) -> List[ChatMessage]:
        return self.data.messages

    def add_listener(self, listener: AgentStreamListener) -> None:
        with self._listener_lock:
            self._stream_listeners.append(listener)
    
    def remove_listener(self, listener: AgentStreamListener) -> None:
        with self._listener_lock:
            self._stream_listeners = [l for l in self._stream_listeners if l is not listener]
    
    def _emit(self, event_type: str, speaker: str, content: str) -> None:
        """发送流式事件"""
        with self._listener_lock:
            listeners_copy = list(self._stream_listeners)
        for listener in listeners_copy:
            listener(event_type, speaker, content)
    
    def update_config(self, name: Optional[str] = None, global_prompt: Optional[str] = None):
        """更新会话配置"""
        changed = False
        if name is not None and name != self.data.name:
            self.data.name = name
            changed = True
        if global_prompt is not None and global_prompt != self.data.global_prompt:
            self.data.global_prompt = global_prompt
            changed = True
        
        if changed:
            self._save(self.data)

    def _build_llm_messages(self, target_agent: AgentDefinition) -> List[Dict]:
        """
        构建 Prompt。
        核心逻辑：System Prompt = Agent定义Prompt + Session全局Prompt
        支持多模态消息（文本+图片）
        """
        # 1. 组合 System Prompt
        system_content = target_agent.system_prompt
        if self.data.global_prompt:
            system_content += f"\n\n[当前讨论组的全局设定/背景]:\n{self.data.global_prompt}"

        result = [{"role": "system", "content": system_content}]
        
        # 2. 组合历史消息
        for msg in self.messages:
            role = "assistant" if msg.speaker == target_agent.name else "user"
            prefix = "" if msg.speaker == target_agent.name else f"[{msg.speaker}]: "
            
            # 检查是否有图片
            if msg.images:
                # 多模态消息格式（OpenAI Vision API 格式）
                content_parts = []
                
                # 添加文本部分
                if msg.content:
                    content_parts.append({
                        "type": "text",
                        "text": f"{prefix}{msg.content}"
                    })
                
                # 添加图片部分
                for img in msg.images:
                    # 确保有正确的 data URI 前缀
                    if not img.startswith("data:"):
                        img = f"data:image/png;base64,{img}"
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {"url": img}
                    })
                
                result.append({"role": role, "content": content_parts})
            else:
                # 纯文本消息
                result.append({"role": role, "content": f"{prefix}{msg.content}"})
        
        return result
    
    def _get_llm_client(self, agent: AgentDefinition) -> OpenAI:
        api_key = agent.api_key or self.llm_defaults.api_key
        base_url = agent.base_url or self.llm_defaults.base_url
        if base_url and base_url.endswith("#"):
            base_url = base_url[:-1]
        return OpenAI(api_key=api_key, base_url=base_url)
    
    def invoke_agent(self, agent_name: str) -> Optional[str]:
        """
        调用指定 Agent，根据 agent.stream 配置选择流式或非流式模式。
        流式模式：依次发送 stream_start -> stream_delta(s) -> stream_end
        非流式模式：发送单个 message 事件
        """
        # 查找 Agent
        agent_map = {a.name: a for a in self.agents}
        agent = agent_map.get(agent_name)
        if not agent:
            self._emit(EVENT_MESSAGE, "System", f"未找到 Agent：{agent_name}")
            return None
        
        # 准备调用参数
        llm_messages = self._build_llm_messages(agent)
        client = self._get_llm_client(agent)
        model = agent.model or self.llm_defaults.model
        temperature = agent.temperature if agent.temperature is not None else self.llm_defaults.temperature
        use_stream = agent.stream  # 从 agent 配置读取是否流式
        
        content = ""
        
        try:
            if use_stream:
                # 流式模式
                self._emit(EVENT_STREAM_START, agent_name, "")
                
                response_stream = client.chat.completions.create(
                    model=model,
                    messages=llm_messages,
                    temperature=temperature,
                    stream=True,
                )
                
                for chunk in response_stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        delta = chunk.choices[0].delta.content
                        content += delta
                        self._emit(EVENT_STREAM_DELTA, agent_name, delta)
                
                self._emit(EVENT_STREAM_END, agent_name, content)
            else:
                # 非流式模式
                response_obj = client.chat.completions.create(
                    model=model,
                    messages=llm_messages,
                    temperature=temperature,
                )
                content = response_obj.choices[0].message.content or ""
                self._emit(EVENT_MESSAGE, agent_name, content)
                
        except Exception as e:
            content = f"[调用失败] {type(e).__name__}: {str(e)}"
            logger.error(f"LLM Call Failed: {e}")
            # 出错时也需要结束流式（如果已经开始）
            if use_stream:
                self._emit(EVENT_STREAM_END, agent_name, content)
            else:
                self._emit(EVENT_MESSAGE, agent_name, content)

        # 保存消息
        self.messages.append(ChatMessage(speaker=agent_name, content=content))
        self._save(self.data)
        
        return content

    def add_user_message(self, content: str, images: Optional[List[str]] = None) -> str:
        """添加用户消息，可选包含图片。返回消息 ID"""
        msg = ChatMessage(speaker="用户", content=content, images=images or [])
        self.messages.append(msg)
        self._save(self.data)
        return msg.id
        
    def chat(self, message: str, *, mentioned_agents: List[str], images: Optional[List[str]] = None) -> str:
        """发送用户消息并调用被 @ 的 Agent。返回用户消息的 ID"""
        msg_id = self.add_user_message(message, images)
        for agent_name in mentioned_agents:
            self.invoke_agent(agent_name)
        return msg_id

    # --- 消息编辑/删除 ---
    
    def get_message_by_id(self, message_id: str) -> Optional[ChatMessage]:
        """根据 ID 获取消息"""
        for msg in self.messages:
            if msg.id == message_id:
                return msg
        return None
    
    def update_message(self, message_id: str, content: str) -> bool:
        """编辑消息内容"""
        for i, msg in enumerate(self.messages):
            if msg.id == message_id:
                self.messages[i] = ChatMessage(
                    id=msg.id,
                    speaker=msg.speaker,
                    content=content,
                    timestamp=msg.timestamp,
                    images=msg.images
                )
                self._save(self.data)
                return True
        return False
    
    def delete_message(self, message_id: str) -> bool:
        """删除消息"""
        for i, msg in enumerate(self.messages):
            if msg.id == message_id:
                del self.messages[i]
                self._save(self.data)
                return True
        return False


class SessionStore:
    """
    负责管理所有 Session 的生命周期和持久化。
    每个 Session 单独一个文件，支持索引文件。
    """
    def __init__(self, agents: List[AgentDefinition], llm_defaults: LlmDefaults):
        self._agents = agents
        self._llm_defaults = llm_defaults
        self._sessions: Dict[str, ChatSession] = {}
        self._index: Dict[str, SessionIndex] = {}  # 轻量级索引
        self._lock = threading.Lock()
        
        # 持久化目录
        self._store_dir = Path(__file__).resolve().parent.parent / "sessions"
        self._store_dir.mkdir(exist_ok=True)
        self._index_path = self._store_dir / "_index.json"
        
        self._load_index()

    def _get_agents(self) -> List[AgentDefinition]:
        return self._agents
    
    def update_agents(self, agents: List[AgentDefinition]):
        with self._lock:
            self._agents = agents

    # --- 持久化 ---

    def _load_index(self):
        """启动时只加载索引"""
        if not self._index_path.exists():
            return
        
        try:
            with open(self._index_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
            
            for entry in raw_data.get("sessions", []):
                idx = SessionIndex.from_dict(entry)
                self._index[idx.id] = idx
            
            logger.info(f"已加载 {len(self._index)} 个会话索引")
        except Exception as e:
            logger.error(f"加载索引失败: {e}")

    def _load_session_data(self, session_id: str) -> Optional[SessionData]:
        """按需加载单个 Session 的完整数据"""
        session_file = self._store_dir / f"{session_id}.json"
        if not session_file.exists():
            return None
        
        try:
            with open(session_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return SessionData.from_dict(data)
        except Exception as e:
            logger.error(f"加载会话 {session_id} 失败: {e}")
            return None

    def _save_session_data(self, data: SessionData):
        """保存单个 Session（只写一个文件）"""
        session_file = self._store_dir / f"{data.id}.json"
        try:
            with open(session_file, "w", encoding="utf-8") as f:
                json.dump(data.to_dict(), f, indent=2, ensure_ascii=False)
            
            # 更新索引
            self._index[data.id] = SessionIndex(
                id=data.id,
                name=data.name,
                created_at=data.created_at,
                global_prompt=data.global_prompt,
                message_count=len(data.messages)
            )
            self._save_index()
        except Exception as e:
            logger.error(f"保存会话 {data.id} 失败: {e}")

    def _save_index(self):
        """保存索引文件"""
        try:
            entries = [idx.to_dict() for idx in self._index.values()]
            with open(self._index_path, "w", encoding="utf-8") as f:
                json.dump({"sessions": entries}, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"保存索引失败: {e}")

    def _delete_session_file(self, session_id: str):
        """删除 Session 文件"""
        session_file = self._store_dir / f"{session_id}.json"
        try:
            if session_file.exists():
                session_file.unlink()
        except Exception as e:
            logger.error(f"删除会话文件 {session_id} 失败: {e}")

    # --- CRUD API ---

    def list_sessions(self) -> List[Dict]:
        with self._lock:
            sorted_sessions = sorted(
                self._index.values(), 
                key=lambda s: s.created_at, 
                reverse=True
            )
            return [s.to_dict() for s in sorted_sessions]

    def create_session(self, name: str = "新讨论组", global_prompt: str = "") -> ChatSession:
        with self._lock:
            new_id = uuid.uuid4().hex
            data = SessionData(
                id=new_id,
                name=name,
                global_prompt=global_prompt,
                created_at=time.time()
            )
            session = ChatSession(
                data=data,
                llm_defaults=self._llm_defaults,
                agent_getter=self._get_agents,
                persistence_callback=self._save_session_data
            )
            self._sessions[new_id] = session
            self._save_session_data(data)
            return session

    def get_session(self, session_id: str) -> Optional[ChatSession]:
        with self._lock:
            # 已加载则直接返回
            if session_id in self._sessions:
                return self._sessions[session_id]
            
            # 按需加载
            if session_id not in self._index:
                return None
            
            data = self._load_session_data(session_id)
            if not data:
                return None
            
            session = ChatSession(
                data=data,
                llm_defaults=self._llm_defaults,
                agent_getter=self._get_agents,
                persistence_callback=self._save_session_data
            )
            self._sessions[session_id] = session
            return session
            
    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            if session_id not in self._index:
                return False
            
            # 从内存移除
            if session_id in self._sessions:
                del self._sessions[session_id]
            del self._index[session_id]
            
            # 删除文件
            self._delete_session_file(session_id)
            self._save_index()
            return True

    def fork_session_from_message(
        self, 
        source_session_id: str, 
        message_id: str, 
        new_name: Optional[str] = None
    ) -> Optional[ChatSession]:
        """
        从指定消息处创建分支会话。
        新会话将包含该消息及之前的所有消息。
        """
        source = self.get_session(source_session_id)
        if not source:
            logger.warning(f"Fork failed: source session {source_session_id} not found")
            return None
        
        # 找到消息索引
        msg_index = next(
            (i for i, m in enumerate(source.messages) if m.id == message_id), 
            None
        )
        if msg_index is None:
            logger.warning(f"Fork failed: message {message_id} not found in session {source_session_id}")
            return None
        
        # 生成分支名称
        if not new_name:
            new_name = f"{source.data.name} (分支)"
        
        # 创建新会话
        with self._lock:
            new_id = uuid.uuid4().hex
            data = SessionData(
                id=new_id,
                name=new_name,
                global_prompt=source.data.global_prompt,
                created_at=time.time()
            )
            
            # 复制消息到该点为止
            for msg in source.messages[:msg_index + 1]:
                data.messages.append(ChatMessage(
                    speaker=msg.speaker,
                    content=msg.content,
                    images=msg.images.copy() if msg.images else []
                ))
            
            session = ChatSession(
                data=data,
                llm_defaults=self._llm_defaults,
                agent_getter=self._get_agents,
                persistence_callback=self._save_session_data
            )
            self._sessions[new_id] = session
            self._save_session_data(data)
            
            logger.info(f"Forked session {source_session_id} at message {msg_index} -> new session {new_id}")
            return session

    def get_or_create(self, session_id: Optional[str]) -> ChatSession:
        """兼容旧接口"""
        if session_id:
            s = self.get_session(session_id)
            if s: return s
        
        return self.create_session()
