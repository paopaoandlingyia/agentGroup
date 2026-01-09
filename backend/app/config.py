from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

from .schemas import AgentDefinition


load_dotenv()
# Prefer `backend/.env` when running from repo root (common during local dev).
_backend_env = Path(__file__).resolve().parent.parent / ".env"
if _backend_env.exists():
    load_dotenv(dotenv_path=_backend_env, override=False)


@dataclass(frozen=True)
class LlmDefaults:
    api_key: str
    base_url: str
    model: str
    temperature: float


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    return value if value not in (None, "") else default


def load_llm_defaults() -> LlmDefaults:
    api_key = _env("OPENAI_API_KEY")
    if not api_key:
        api_key = ""

    base_url = _env("OPENAI_BASE_URL", _env("OPENAI_API_BASE", "https://api.openai.com/v1"))  # compat
    model = _env("OPENAI_MODEL", "gpt-4o-mini")
    temperature = float(_env("OPENAI_TEMPERATURE", "0.7"))
    return LlmDefaults(api_key=api_key, base_url=base_url, model=model, temperature=temperature)


def _default_agents() -> List[AgentDefinition]:
    return [
        AgentDefinition(
            name="产品经理",
            system_prompt="你是一个经验丰富的产品经理，擅长拆解需求、定义MVP、提出可落地的产品方案。发言要条理清晰、关注用户价值与范围控制。",
            avatar_url="https://api.dicebear.com/9.x/notionists-neutral/svg?seed=pm",
            model=None,
            temperature=0.6,
        ),
        AgentDefinition(
            name="程序员",
            system_prompt="你是一个偏工程实现的全栈程序员，强调可维护性、边界与可测试性。发言要具体、给出实现路径与注意事项。",
            avatar_url="https://api.dicebear.com/9.x/notionists-neutral/svg?seed=dev",
            model=None,
            temperature=0.4,
        ),
        AgentDefinition(
            name="杠精路人",
            system_prompt="你是一个喜欢挑刺的路人杠精，专门寻找逻辑漏洞、边界条件与风险。发言要犀利但有建设性。",
            avatar_url="https://api.dicebear.com/9.x/notionists-neutral/svg?seed=critic",
            model=None,
            temperature=0.8,
        ),
    ]


def load_agents() -> List[AgentDefinition]:
    # Force loading from the same directory as config.py's parent (backend/agents.json)
    save_path = Path(__file__).resolve().parent.parent / "agents.json"
    if save_path.exists():
        try:
            data = json.loads(save_path.read_text(encoding="utf-8"))
            return [AgentDefinition.model_validate(item) for item in data.get("agents", data)]
        except Exception as e:
            print(f"Error loading agents.json: {e}")
    return _default_agents()
