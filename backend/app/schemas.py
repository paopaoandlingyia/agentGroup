from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class AgentDefinition(BaseModel):
    name: str
    system_prompt: str
    avatar_url: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    base_url: Optional[str] = None  # 独立的 API 地址，末尾带 # 表示不补全路径
    api_key: Optional[str] = None   # 独立的 API Key
    stream: bool = True  # 是否启用流式输出，默认开启


class AgentsResponse(BaseModel):
    agents: List[AgentDefinition]


class ChatStreamRequest(BaseModel):
    session_id: Optional[str] = Field(default=None, description="Client-provided session id (optional).")
    message: str
    images: List[str] = Field(default=[], description="Base64 编码的图片列表")
