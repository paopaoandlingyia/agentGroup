# Multi-Agent Group Chat (AutoGen + Next.js)

一个极简、重交互的“多智能体协作群聊”Web 客户端：

- 后端：FastAPI + Microsoft AutoGen（负责上下文、身份隔离、群聊编排）
- 前端：Next.js App Router + shadcn/ui + Tailwind + Vercel AI SDK（`useChat` + `StreamData`）

## 目录结构

- `backend/`：FastAPI + AutoGen
- `frontend/`：Next.js（App Router）

## 后端启动

1) 进入 `backend/` 安装依赖：

`pip install -r backend/requirements.txt`

2) 配置环境变量（OpenAI 兼容）：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`（可选，默认 `https://api.openai.com/v1`）
- `OPENAI_MODEL`（可选，默认 `gpt-4o-mini`）

如果未配置 `OPENAI_API_KEY`，后端会自动进入 `mock` 模式（仍走 AutoGen 群聊流程，但回复为占位文本，便于前后端联调）。

3) 配置 Agent 列表：

- 默认读取 `backend/agents.json`（可直接修改）
- 若该文件不存在，则回退到 `backend/app/config.py` 内置默认 Agents

4) 启动：

`python -m uvicorn backend.app.main:app --reload --port 8000`

访问：

- `GET http://127.0.0.1:8000/agents`
- `POST http://127.0.0.1:8000/chat/stream`
- `POST http://127.0.0.1:8000/chat/data`（给前端 `useChat(streamProtocol: "data")` 使用）

## 前端启动

本仓库内置了 Next.js 项目文件，但需要本机已安装 Node.js（含 `npm`）。

1) 进入 `frontend/` 安装依赖：

`npm install`

2) 配置：

- 复制 `frontend/.env.local.example` 为 `frontend/.env.local`
- 默认后端地址：`BACKEND_URL=http://127.0.0.1:8000`（仅用于兼容旧后端/数据迁移；当前版本默认使用 IndexedDB）
- LLM 代理：`NEXT_PUBLIC_LLM_PROXY_URL=/api/llm`（推荐开启，用于解决浏览器直连模型的 CORS）

3) 启动：

`npm run dev`

打开 `http://localhost:3000`

## 部署（Vercel / Cloudflare）

### Vercel

- 部署 `frontend/`（Next.js）
- 保持 `NEXT_PUBLIC_LLM_PROXY_URL=/api/llm`：使用 `frontend/src/app/api/llm/route.ts` 作为最小代理（只转发，不存数据）

### Cloudflare Pages + Worker

- Pages 部署前端，并配置环境变量 `NEXT_PUBLIC_LLM_PROXY_URL=https://<your-worker-domain>/api/llm`
- Worker 代理位于 `cloudflare-llm-proxy/`，按 `cloudflare-llm-proxy/README.md` 运行 `wrangler deploy`

## 点名规则（MVP）

在输入中包含 `@AgentName`（例如 `@产品经理`）时，后端会强制下一位发言者为该 Agent；未点名则交给 AutoGen 的选择逻辑。
