from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List


MENTION_RE = re.compile(r"@([\w\-\u4e00-\u9fff]+)")


@dataclass
class MentionParseResult:
    """@ 解析结果"""
    mentioned_agents: List[str]  # 被 @ 的 agent 列表
    original_message: str  # 原始消息


def parse_mentions(message: str, agent_names: Iterable[str]) -> MentionParseResult:
    """
    解析消息中的 @ 提及。
    
    返回被 @ 的有效 agent 列表（按出现顺序，去重）。
    """
    names = set(agent_names)
    mentioned = []
    
    for match in MENTION_RE.finditer(message or ""):
        candidate = match.group(1)
        if candidate in names and candidate not in mentioned:
            mentioned.append(candidate)
    
    return MentionParseResult(
        mentioned_agents=mentioned,
        original_message=message or "",
    )
