/**
 * useChat Hook - 管理聊天相关的状态和操作
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, TranscriptItem } from "@/types";
import { buildOpenAiMessages, openAiChatCompletion, openAiChatCompletionStream } from "@/lib/llm";
import { dbAppendMessage, dbUpsertMessage } from "@/lib/local-db";

interface UseChatOptions {
    activeSessionId: string | null;
    agents: Agent[];
    globalPrompt?: string;
    onError?: (message: string) => void;
}

interface UseChatReturn {
    transcript: TranscriptItem[];
    setTranscript: React.Dispatch<React.SetStateAction<TranscriptItem[]>>;
    isLoading: boolean;
    sendMessage: (message: string, images: string[]) => Promise<void>;
    invokeAgent: (agentName: string) => Promise<void>;
    addMessageOnly: (message: string, images: string[]) => Promise<string | null>;
    abortCurrentRequest: () => void;
    shouldSmoothScroll: React.MutableRefObject<boolean>;
}

function newId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseMentionedAgents(message: string, agents: Agent[]): string[] {
    const matches = message.match(/@([\w\-\u4e00-\u9fff]+)/g) ?? [];
    if (matches.length === 0) return [];
    const agentSet = new Set(agents.map(a => a.name));
    const orderedUnique: string[] = [];
    const seen = new Set<string>();

    for (const raw of matches) {
        const name = raw.slice(1);
        if (!agentSet.has(name)) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        orderedUnique.push(name);
    }
    return orderedUnique;
}

function toAbortErrorName(err: unknown): string | null {
    if (!err || typeof err !== "object") return null;
    // DOMException in browsers, Error in some runtimes
    const name = (err as any).name;
    return typeof name === "string" ? name : null;
}

export function useChat({ activeSessionId, agents, globalPrompt, onError }: UseChatOptions): UseChatReturn {
    const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const shouldSmoothScroll = useRef(false);

    const activeSessionIdRef = useRef(activeSessionId);
    const onErrorRef = useRef(onError);
    const agentsRef = useRef(agents);
    const globalPromptRef = useRef(globalPrompt);
    const transcriptRef = useRef(transcript);

    useEffect(() => {
        activeSessionIdRef.current = activeSessionId;
    }, [activeSessionId]);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
        agentsRef.current = agents;
    }, [agents]);

    useEffect(() => {
        globalPromptRef.current = globalPrompt;
    }, [globalPrompt]);

    useEffect(() => {
        transcriptRef.current = transcript;
    }, [transcript]);

    const abortCurrentRequest = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    const sendMessage = useCallback(async (message: string, images: string[]) => {
        const sessionId = activeSessionIdRef.current;
        if (!sessionId) return;
        abortCurrentRequest();

        const controller = new AbortController();
        abortControllerRef.current = controller;

        shouldSmoothScroll.current = true;

        const userItem: TranscriptItem = {
            id: newId(),
            kind: "user",
            content: message || (images.length > 0 ? "[图片]" : ""),
            images
        };

        setTranscript((prev) => [...prev, userItem]);
        try {
            await dbAppendMessage(sessionId, userItem);
        } catch (e) {
            console.error("Failed to persist user message:", e);
        }

        setIsLoading(true);

        try {
            const currentAgents = agentsRef.current;
            const mentioned = parseMentionedAgents(message, currentAgents);
            if (mentioned.length === 0) return;

            let workingHistory: TranscriptItem[] = [...transcriptRef.current, userItem].filter((i) => i.kind !== "system");

            for (const agentName of mentioned) {
                const agent = currentAgents.find((a) => a.name === agentName);
                if (!agent) continue;

                const agentMessageId = newId();
                setTranscript((prev) => [
                    ...prev,
                    { id: agentMessageId, kind: "agent", speaker: agentName, content: "", isStreaming: true }
                ]);

                const openAiMessages = buildOpenAiMessages({
                    targetAgent: agent,
                    globalPrompt: globalPromptRef.current,
                    history: workingHistory
                });

                let full = "";
                try {
                    if (agent.stream === false) {
                        full = await openAiChatCompletion({ agent, messages: openAiMessages, signal: controller.signal });
                    } else {
                        full = await openAiChatCompletionStream({
                            agent,
                            messages: openAiMessages,
                            signal: controller.signal,
                            onDelta: (delta) => {
                                setTranscript((prev) =>
                                    prev.map((item) =>
                                        item.id === agentMessageId && item.kind === "agent"
                                            ? { ...item, content: item.content + delta }
                                            : item
                                    )
                                );
                            }
                        });
                    }
                } catch (e) {
                    const name = toAbortErrorName(e);
                    if (name === "AbortError") throw e;
                    const msg = e instanceof Error ? e.message : String(e);
                    full = `[调用失败] ${msg}`;
                }

                setTranscript((prev) =>
                    prev.map((item) =>
                        item.id === agentMessageId && item.kind === "agent"
                            ? { ...item, content: full, isStreaming: false }
                            : item
                    )
                );

                try {
                    await dbUpsertMessage(sessionId, { id: agentMessageId, kind: "agent", speaker: agentName, content: full });
                } catch (e) {
                    console.error("Failed to persist agent message:", e);
                }

                workingHistory = [...workingHistory, { id: agentMessageId, kind: "agent", speaker: agentName, content: full }];
            }
        } catch (error) {
            if (toAbortErrorName(error) === "AbortError") return;
            const errMsg = error instanceof Error ? error.message : String(error);
            setTranscript((prev) => [...prev, { id: newId(), kind: "system", content: `❌ Error: ${errMsg}` }]);
            onErrorRef.current?.(`发送失败: ${errMsg}`);
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [abortCurrentRequest]);

    const invokeAgent = useCallback(async (agentName: string) => {
        const sessionId = activeSessionIdRef.current;
        if (!sessionId) return;
        abortCurrentRequest();

        const controller = new AbortController();
        abortControllerRef.current = controller;

        shouldSmoothScroll.current = true;
        setIsLoading(true);

        const agent = agentsRef.current.find((a) => a.name === agentName);
        if (!agent) {
            setTranscript((prev) => [...prev, { id: newId(), kind: "system", content: `❌ 未找到 Agent: ${agentName}` }]);
            setIsLoading(false);
            abortControllerRef.current = null;
            return;
        }

        const agentMessageId = newId();
        setTranscript((prev) => [
            ...prev,
            { id: agentMessageId, kind: "agent", speaker: agentName, content: "", isStreaming: true }
        ]);

        try {
            const history = transcriptRef.current.filter((i) => i.kind !== "system");
            const openAiMessages = buildOpenAiMessages({
                targetAgent: agent,
                globalPrompt: globalPromptRef.current,
                history
            });

            let full = "";
            if (agent.stream === false) {
                full = await openAiChatCompletion({ agent, messages: openAiMessages, signal: controller.signal });
            } else {
                full = await openAiChatCompletionStream({
                    agent,
                    messages: openAiMessages,
                    signal: controller.signal,
                    onDelta: (delta) => {
                        setTranscript((prev) =>
                            prev.map((item) =>
                                item.id === agentMessageId && item.kind === "agent"
                                    ? { ...item, content: item.content + delta }
                                    : item
                            )
                        );
                    }
                });
            }

            setTranscript((prev) =>
                prev.map((item) =>
                    item.id === agentMessageId && item.kind === "agent"
                        ? { ...item, content: full, isStreaming: false }
                        : item
                )
            );

            try {
                await dbUpsertMessage(sessionId, { id: agentMessageId, kind: "agent", speaker: agentName, content: full });
            } catch (e) {
                console.error("Failed to persist agent message:", e);
            }
        } catch (error) {
            if (toAbortErrorName(error) === "AbortError") return;
            const errMsg = error instanceof Error ? error.message : String(error);
            setTranscript((prev) =>
                prev.map((item) =>
                    item.id === agentMessageId && item.kind === "agent"
                        ? { ...item, content: `[调用失败] ${errMsg}`, isStreaming: false }
                        : item
                )
            );
            onErrorRef.current?.(`调用失败: ${errMsg}`);
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [abortCurrentRequest]);

    const addMessageOnly = useCallback(async (message: string, images: string[]): Promise<string | null> => {
        const sessionId = activeSessionIdRef.current;
        if (!sessionId) return null;

        shouldSmoothScroll.current = true;

        const item: TranscriptItem = {
            id: newId(),
            kind: "user",
            content: message || (images.length > 0 ? "[图片]" : ""),
            images
        };

        setTranscript((prev) => [...prev, item]);
        try {
            await dbAppendMessage(sessionId, item);
            return item.id;
        } catch (e) {
            console.error("Failed to add message:", e);
            return null;
        }
    }, []);

    return {
        transcript,
        setTranscript,
        isLoading,
        sendMessage,
        invokeAgent,
        addMessageOnly,
        abortCurrentRequest,
        shouldSmoothScroll
    };
}

