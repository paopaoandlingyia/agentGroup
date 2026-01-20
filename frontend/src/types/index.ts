// === Agent 相关 ===

export type Agent = {
    name: string;
    system_prompt: string;
    avatar_url?: string | null;
    model?: string | null;
    custom_params?: Record<string, unknown> | null;  // 自定义请求参数，会被合并到 LLM 请求体中
    base_url?: string | null;
    api_key?: string | null;
    stream?: boolean;  // 是否启用流式输出，默认 true
    order?: number;    // 排序顺序，越小越靠前
};

// === Session 相关 ===

export type SessionSummary = {
    id: string;
    name: string;
    global_prompt: string;
    created_at: number;
    message_count: number;
    order?: number;    // 排序顺序，越小越靠前
};

export type SessionDetail = SessionSummary & {
    history: TranscriptItem[];
};

// === 消息/对话记录 ===

export type TranscriptItem =
    | { id: string; kind: "user"; content: string; images?: string[] }
    | { id: string; kind: "agent"; speaker: string; content: string; images?: string[]; isStreaming?: boolean }
    | { id: string; kind: "system"; content: string };

// === 流式事件（自定义协议，格式兼容 data-stream）===

export type StreamEvent =
    | { event: "session"; data: { session_id: string } }
    | { event: "message"; data: { message_id: string; speaker: string; content: string } }
    | { event: "stream_start"; data: { message_id: string; speaker: string } }
    | { event: "stream_delta"; data: { message_id: string; speaker: string; content: string } }
    | { event: "stream_end"; data: { message_id: string; speaker: string; content: string } }
    | { event: "user_message_id"; data: { message_id: string } }
    | { event: "done"; data: Record<string, never> };

// === 工具函数 ===

/**
 * 获取名称的前两个字符（用于头像 fallback）
 */
export function shortName(name: string): string {
    return name.slice(0, 2);
}

/**
 * 解析后端发送的 data-stream 格式的行
 * 格式: "code:json_payload"，其中 code="2" 表示自定义事件数据
 */
export function parseDataStreamLine(line: string): StreamEvent | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) return null;
    const code = trimmed.slice(0, colonIndex);
    const jsonStr = trimmed.slice(colonIndex + 1);
    try {
        if (code === "2") {
            const arr = JSON.parse(jsonStr);
            if (Array.isArray(arr) && arr.length > 0) return arr[0] as StreamEvent;
        }
    } catch (e) {
        if (code === "2") console.error("JSON parse failed:", jsonStr);
    }
    return null;
}
