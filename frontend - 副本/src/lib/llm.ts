import type { Agent, TranscriptItem } from "@/types";

type OpenAiMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenAiMessageContentPart[];
};

function normalizeBaseUrl(input: string | null | undefined): string {
  let baseUrl = (input ?? "https://api.openai.com/v1").trim();
  if (!baseUrl) baseUrl = "https://api.openai.com/v1";
  if (baseUrl.endsWith("#")) baseUrl = baseUrl.slice(0, -1);
  baseUrl = baseUrl.replace(/\/+$/, "");
  return baseUrl;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  // baseUrl is expected to be OpenAI-compatible base, e.g. https://api.openai.com/v1
  // Some providers might include extra path; we just append /chat/completions.
  return `${baseUrl}/chat/completions`;
}

function proxyUrl(): string | null {
  const v = (process.env.NEXT_PUBLIC_LLM_PROXY_URL ?? "").trim();
  return v ? v : null;
}

type ProxyPayload = {
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  messages: OpenAiChatMessage[];
  stream: boolean;
};

function speakerForItem(item: TranscriptItem): string {
  if (item.kind === "user") return "用户";
  if (item.kind === "agent") return item.speaker;
  return "System";
}

export function buildOpenAiMessages(params: {
  targetAgent: Agent;
  globalPrompt?: string;
  history: TranscriptItem[];
}): OpenAiChatMessage[] {
  const { targetAgent, globalPrompt, history } = params;

  let systemContent = targetAgent.system_prompt;
  if (globalPrompt && globalPrompt.trim()) {
    systemContent += `\n\n[当前讨论组的全局设定/背景]:\n${globalPrompt.trim()}`;
  }

  const result: OpenAiChatMessage[] = [{ role: "system", content: systemContent }];

  for (const item of history) {
    if (item.kind === "system") continue;

    const speaker = speakerForItem(item);
    const isTargetAgent = item.kind === "agent" && item.speaker === targetAgent.name;
    const role: OpenAiChatMessage["role"] = isTargetAgent ? "assistant" : "user";
    const prefix = isTargetAgent ? "" : `[${speaker}]: `;

    const images = item.images;
    if (images && images.length > 0) {
      const parts: OpenAiMessageContentPart[] = [];
      const text = (item.content || "").trim();
      if (text) parts.push({ type: "text", text: `${prefix}${text}` });
      for (const img of images) {
        const url = img.startsWith("data:") ? img : `data:image/png;base64,${img}`;
        parts.push({ type: "image_url", image_url: { url } });
      }
      result.push({ role, content: parts });
    } else {
      result.push({ role, content: `${prefix}${item.content || ""}` });
    }
  }

  return result;
}

async function readErrorText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text ? ` - ${text.slice(0, 2000)}` : "";
  } catch {
    return "";
  }
}

export async function openAiChatCompletion(params: {
  agent: Agent;
  messages: OpenAiChatMessage[];
  signal?: AbortSignal;
}): Promise<string> {
  const apiKey = (params.agent.api_key ?? "").trim();
  if (!apiKey) throw new Error("该 Agent 未配置 API Key");

  const baseUrl = normalizeBaseUrl(params.agent.base_url ?? null);
  const model = (params.agent.model ?? "").trim() || "gpt-4o-mini";
  const temperature = params.agent.temperature ?? 0.7;

  const pUrl = proxyUrl();
  if (pUrl) {
    let res: Response;
    try {
      const body: ProxyPayload = {
        base_url: baseUrl,
        api_key: apiKey,
        model,
        temperature,
        messages: params.messages,
        stream: false,
      };
      res = await fetch(pUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: params.signal,
      });
    } catch (e) {
      const name = (e as any)?.name;
      if (name === "AbortError") throw e;
      throw new Error("无法连接到代理服务。请检查 NEXT_PUBLIC_LLM_PROXY_URL 或代理部署状态。");
    }

    if (!res.ok) {
      const extra = await readErrorText(res);
      throw new Error(`LLM 请求失败: HTTP ${res.status}${extra}`);
    }

    const json = await res.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    return content ?? "";
  }

  let res: Response;
  try {
    res = await fetch(buildChatCompletionsUrl(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature,
        stream: false,
      }),
      signal: params.signal,
    });
  } catch (e) {
    const name = (e as any)?.name;
    if (name === "AbortError") throw e;
    throw new Error("无法连接到该 API Base URL（可能是 CORS/网络问题）。请检查 Base URL，或使用带 CORS 的代理/最小后端转发。");
  }

  if (!res.ok) {
    const extra = await readErrorText(res);
    throw new Error(`LLM 请求失败: HTTP ${res.status}${extra}`);
  }

  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  return content ?? "";
}

export async function openAiChatCompletionStream(params: {
  agent: Agent;
  messages: OpenAiChatMessage[];
  signal?: AbortSignal;
  onDelta: (delta: string) => void;
}): Promise<string> {
  const apiKey = (params.agent.api_key ?? "").trim();
  if (!apiKey) throw new Error("该 Agent 未配置 API Key");

  const baseUrl = normalizeBaseUrl(params.agent.base_url ?? null);
  const model = (params.agent.model ?? "").trim() || "gpt-4o-mini";
  const temperature = params.agent.temperature ?? 0.7;

  const pUrl = proxyUrl();
  if (pUrl) {
    let res: Response;
    try {
      const body: ProxyPayload = {
        base_url: baseUrl,
        api_key: apiKey,
        model,
        temperature,
        messages: params.messages,
        stream: true,
      };
      res = await fetch(pUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal: params.signal,
      });
    } catch (e) {
      const name = (e as any)?.name;
      if (name === "AbortError") throw e;
      throw new Error("无法连接到代理服务。请检查 NEXT_PUBLIC_LLM_PROXY_URL 或代理部署状态。");
    }

    if (!res.ok) {
      const extra = await readErrorText(res);
      throw new Error(`LLM 请求失败: HTTP ${res.status}${extra}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("代理响应不支持流式读取");

    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (!line.startsWith("data:")) continue;

        const data = line.slice("data:".length).trim();
        if (!data) continue;
        if (data === "[DONE]") return full;

        try {
          const parsed = JSON.parse(data);
          const delta: string | undefined = parsed?.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            params.onDelta(delta);
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }

    return full;
  }

  let res: Response;
  try {
    res = await fetch(buildChatCompletionsUrl(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature,
        stream: true,
      }),
      signal: params.signal,
    });
  } catch (e) {
    const name = (e as any)?.name;
    if (name === "AbortError") throw e;
    throw new Error("无法连接到该 API Base URL（可能是 CORS/网络问题）。请检查 Base URL，或使用带 CORS 的代理/最小后端转发。");
  }

  if (!res.ok) {
    const extra = await readErrorText(res);
    throw new Error(`LLM 请求失败: HTTP ${res.status}${extra}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("LLM 响应不支持流式读取");

  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (!line.startsWith("data:")) continue;

      const data = line.slice("data:".length).trim();
      if (!data) continue;
      if (data === "[DONE]") return full;

      try {
        const parsed = JSON.parse(data);
        const delta: string | undefined = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          params.onDelta(delta);
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }

  return full;
}
