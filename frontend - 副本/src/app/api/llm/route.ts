export const runtime = "edge";

type OpenAiChatMessage = {
  role: "system" | "user" | "assistant";
  // string or multimodal array; keep loose to be OpenAI-compatible
  content: any;
};

type ProxyChatRequest = {
  base_url: string;
  api_key: string;
  model: string;
  temperature?: number;
  messages: OpenAiChatMessage[];
  stream?: boolean;
};

function normalizeBaseUrl(input: string): string {
  let baseUrl = (input ?? "").trim();
  if (!baseUrl) baseUrl = "https://api.openai.com/v1";
  if (baseUrl.endsWith("#")) baseUrl = baseUrl.slice(0, -1);
  baseUrl = baseUrl.replace(/\/+$/, "");
  return baseUrl;
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl}/chat/completions`;
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  let payload: ProxyChatRequest;
  try {
    payload = (await req.json()) as ProxyChatRequest;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const baseUrl = normalizeBaseUrl(payload.base_url);
  const apiKey = (payload.api_key ?? "").trim();
  const model = (payload.model ?? "").trim();
  if (!apiKey) return jsonError(400, "Missing api_key");
  if (!model) return jsonError(400, "Missing model");
  if (!Array.isArray(payload.messages)) return jsonError(400, "Missing messages");

  const upstream = await fetch(chatCompletionsUrl(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: payload.stream ? "text/event-stream" : "application/json",
    },
    body: JSON.stringify({
      model,
      messages: payload.messages,
      temperature: payload.temperature ?? 0.7,
      stream: !!payload.stream,
    }),
  });

  // Pass through upstream errors while keeping the response readable to the client.
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return jsonError(upstream.status, text || `Upstream error: HTTP ${upstream.status}`);
  }

  if (payload.stream) {
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "text/event-stream; charset=utf-8");
    headers.set("Cache-Control", "no-cache");
    return new Response(upstream.body, { status: 200, headers });
  }

  const json = await upstream.text();
  return new Response(json, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

