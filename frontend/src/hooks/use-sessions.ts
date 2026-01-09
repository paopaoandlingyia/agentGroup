/**
 * useSessions Hook - 管理 Session 列表和当前会话
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SessionSummary, SessionDetail, TranscriptItem } from "@/types";
import { dbCreateSession, dbDeleteSession, dbForkSessionFromMessage, dbGetSessionDetail, dbListSessions, dbSetSessions, dbUpdateSession, type StoredSession } from "@/lib/local-db";

interface UseSessionsOptions {
    onError?: (message: string) => void;
    onSuccess?: (message: string) => void;
}

interface UseSessionsReturn {
    sessions: SessionSummary[];
    setSessions: React.Dispatch<React.SetStateAction<SessionSummary[]>>;
    activeSessionId: string | null;
    setActiveSessionId: (id: string | null) => void;
    activeSessionData: SessionDetail | null;
    setActiveSessionData: React.Dispatch<React.SetStateAction<SessionDetail | null>>;
    loadSessions: () => Promise<SessionSummary[]>;
    createSession: () => Promise<void>;
    updateSession: (session: SessionSummary) => Promise<boolean>;
    deleteSession: (id: string) => Promise<boolean>;
    loadSessionHistory: (sessionId: string) => Promise<TranscriptItem[]>;
    forkSession: (messageId: string, newName?: string) => Promise<string | null>;
}

const LOCAL_STORAGE_KEY = "agent_group_session_id";

export function useSessions({ onError, onSuccess }: UseSessionsOptions = {}): UseSessionsReturn {
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
    const [activeSessionData, setActiveSessionData] = useState<SessionDetail | null>(null);

    // 使用 ref 存储回调，避免依赖变化导致函数重新创建
    const onErrorRef = useRef(onError);
    const onSuccessRef = useRef(onSuccess);
    useEffect(() => {
        onErrorRef.current = onError;
        onSuccessRef.current = onSuccess;
    }, [onError, onSuccess]);

    // 设置 activeSessionId 并保存到 localStorage
    const setActiveSessionId = useCallback((id: string | null) => {
        setActiveSessionIdState(id);
        if (id) {
            window.localStorage.setItem(LOCAL_STORAGE_KEY, id);
        } else {
            window.localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
    }, []);

    const loadSessions = useCallback(async (): Promise<SessionSummary[]> => {
        try {
            let loadedSessions = await dbListSessions();
            if (loadedSessions.length === 0) {
                try {
                    const res = await fetch(`/api/sessions`, { cache: "no-store" });
                    if (res.ok) {
                        const json = await res.json();
                        const remoteSessions: Array<{ id: string }> = json.sessions ?? [];
                        if (remoteSessions.length > 0) {
                            const imported: StoredSession[] = [];
                            for (const s of remoteSessions) {
                                const detailRes = await fetch(`/api/sessions/${s.id}`, { cache: "no-store" });
                                if (!detailRes.ok) continue;
                                const detail = await detailRes.json();
                                const history = Array.isArray(detail.history) ? detail.history : [];
                                const messages = history.map((m: any) => {
                                    const created_at = typeof m.timestamp === "number" ? m.timestamp : (detail.created_at ?? Date.now() / 1000);
                                    if (m.speaker === "System") {
                                        return { id: m.id || crypto.randomUUID?.() || Math.random().toString(), kind: "system" as const, content: m.content ?? "", created_at };
                                    }
                                    if (m.speaker === "用户") {
                                        return { id: m.id || crypto.randomUUID?.() || Math.random().toString(), kind: "user" as const, content: m.content ?? "", images: m.images || [], created_at };
                                    }
                                    return { id: m.id || crypto.randomUUID?.() || Math.random().toString(), kind: "agent" as const, speaker: m.speaker ?? "Agent", content: m.content ?? "", images: m.images || [], created_at };
                                });

                                const updated_at = messages.reduce((max: number, msg: any) => Math.max(max, typeof msg.created_at === "number" ? msg.created_at : 0), detail.created_at ?? Date.now() / 1000);

                                imported.push({
                                    id: detail.id,
                                    name: detail.name ?? "未命名会话",
                                    global_prompt: detail.global_prompt ?? "",
                                    created_at: detail.created_at ?? Date.now() / 1000,
                                    updated_at,
                                    messages
                                });
                            }

                            if (imported.length > 0) {
                                await dbSetSessions(imported);
                                loadedSessions = await dbListSessions();
                            }
                        }
                    }
                } catch {
                    // ignore legacy backend fetch failures
                }
            }
            setSessions(loadedSessions);
            return loadedSessions;
        } catch (e) {
            console.error("Failed to load sessions:", e);
            onErrorRef.current?.("加载讨论组失败");
        }
        return [];
    }, []); // 无依赖，函数引用稳定

    const createSession = useCallback(async () => {
        try {
            const newSession = await dbCreateSession("新讨论组", "");
            setSessions(prev => [newSession, ...prev]);
            setActiveSessionId(newSession.id);
            onSuccessRef.current?.("讨论组已创建");
        } catch (e) {
            console.error("Failed to create session:", e);
            onErrorRef.current?.("创建失败");
        }
    }, [setActiveSessionId]);

    const updateSession = useCallback(async (session: SessionSummary): Promise<boolean> => {
        try {
            await dbUpdateSession(session.id, { name: session.name, global_prompt: session.global_prompt });
            setSessions(prev => prev.map(s =>
                s.id === session.id
                    ? { ...s, name: session.name, global_prompt: session.global_prompt }
                    : s
            ));
            setActiveSessionData(prev =>
                prev && prev.id === session.id
                    ? { ...prev, name: session.name, global_prompt: session.global_prompt }
                    : prev
            );
            onSuccessRef.current?.("讨论组已更新");
            return true;
        } catch (e) {
            console.error("Failed to update session:", e);
            onErrorRef.current?.("更新失败");
        }
        return false;
    }, []);

    const deleteSession = useCallback(async (id: string): Promise<boolean> => {
        try {
            await dbDeleteSession(id);
            setSessions(prev => prev.filter(s => s.id !== id));
            setActiveSessionIdState(currentId => (currentId === id ? null : currentId));
            onSuccessRef.current?.("讨论组已删除");
            return true;
        } catch (e) {
            console.error("Failed to delete session:", e);
            onErrorRef.current?.("删除失败");
        }
        return false;
    }, []);

    const loadSessionHistory = useCallback(async (sessionId: string): Promise<TranscriptItem[]> => {
        try {
            const data = await dbGetSessionDetail(sessionId);
            if (data) {
                setActiveSessionData(data);
                return data.history ?? [];
            }
        } catch (e) {
            console.error("Load history failed:", e);
        }
        return [];
    }, []);

    const forkSession = useCallback(async (messageId: string, newName?: string): Promise<string | null> => {
        const sessionId = activeSessionId;
        if (!sessionId) return null;

        try {
            const forkedSession = await dbForkSessionFromMessage(sessionId, messageId, newName);
            if (forkedSession) {
                setSessions(prev => [forkedSession, ...prev]);
                setActiveSessionId(forkedSession.id);
                onSuccessRef.current?.("分支会话已创建");
                return forkedSession.id;
            }
        } catch (e) {
            console.error("Failed to fork session:", e);
            onErrorRef.current?.("创建分支失败");
        }
        return null;
    }, [activeSessionId, setActiveSessionId]);

    // 初始化时从 localStorage 恢复 session
    useEffect(() => {
        const savedId = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedId) {
            setActiveSessionIdState(savedId);
        }
    }, []);

    return {
        sessions,
        setSessions,
        activeSessionId,
        setActiveSessionId,
        activeSessionData,
        setActiveSessionData,
        loadSessions,
        createSession,
        updateSession,
        deleteSession,
        forkSession,
        loadSessionHistory
    };
}
