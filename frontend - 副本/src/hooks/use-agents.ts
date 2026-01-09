/**
 * useAgents Hook - 管理 Agent 列表的 CRUD 操作
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Agent } from "@/types";
import { dbDeleteAgent, dbGetAgents, dbSetAgents } from "@/lib/local-db";

const DEFAULT_AGENTS: Agent[] = [
    {
        name: "产品经理",
        system_prompt: "你是一个经验丰富的产品经理，擅长拆解需求、定义MVP、提出可落地的产品方案。发言要条理清晰、关注用户价值与范围控制。",
        avatar_url: "https://api.dicebear.com/9.x/notionists-neutral/svg?seed=pm",
        model: null,
        temperature: 0.6,
        base_url: null,
        api_key: null,
        stream: true
    },
    {
        name: "程序员",
        system_prompt: "你是一个偏工程实现的全栈程序员，强调可维护性、边界与可测试性。发言要具体、给出实现路径与注意事项。",
        avatar_url: "https://api.dicebear.com/9.x/notionists-neutral/svg?seed=dev",
        model: null,
        temperature: 0.4,
        base_url: null,
        api_key: null,
        stream: true
    },
    {
        name: "杠精路人",
        system_prompt: "你是一个喜欢挑刺的路人杠精，专门寻找逻辑漏洞、边界条件与风险。发言要犀利但有建设性。",
        avatar_url: "https://api.dicebear.com/9.x/notionists-neutral/svg?seed=critic",
        model: null,
        temperature: 0.8,
        base_url: null,
        api_key: null,
        stream: true
    }
];

interface UseAgentsOptions {
    onSuccess?: (message: string) => void;
    onError?: (message: string) => void;
}

interface UseAgentsReturn {
    agents: Agent[];
    setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
    loadAgents: () => Promise<void>;
    saveAgent: (agent: Agent, isCreating: boolean, allAgents: Agent[]) => Promise<boolean>;
    deleteAgent: (agentName: string) => Promise<boolean>;
    isSaving: boolean;
}

export function useAgents({ onSuccess, onError }: UseAgentsOptions = {}): UseAgentsReturn {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    // 使用 ref 存储回调，避免依赖变化导致函数重新创建
    const onErrorRef = useRef(onError);
    const onSuccessRef = useRef(onSuccess);
    useEffect(() => {
        onErrorRef.current = onError;
        onSuccessRef.current = onSuccess;
    }, [onError, onSuccess]);

    const loadAgents = useCallback(async () => {
        try {
            let localAgents = await dbGetAgents();
            if (localAgents.length === 0) {
                try {
                    const res = await fetch(`/api/agents`, { cache: "no-store" });
                    if (res.ok) {
                        const json = await res.json();
                        const remoteAgents: Agent[] = json.agents ?? [];
                        if (remoteAgents.length > 0) {
                            await dbSetAgents(remoteAgents);
                            localAgents = remoteAgents;
                        }
                    }
                } catch {
                    // ignore legacy backend fetch failures
                }

                if (localAgents.length === 0) {
                    await dbSetAgents(DEFAULT_AGENTS);
                    localAgents = DEFAULT_AGENTS;
                }
            }
            setAgents(localAgents);
        } catch (e) {
            console.error("Failed to load agents:", e);
            onErrorRef.current?.("加载 Agent 列表失败");
        }
    }, []); // 无依赖，函数引用稳定

    const saveAgent = useCallback(async (
        agent: Agent,
        isCreating: boolean,
        allAgents: Agent[]
    ): Promise<boolean> => {
        if (isCreating && !agent.name.trim()) {
            onErrorRef.current?.("Agent 名称不能为空");
            return false;
        }

        setIsSaving(true);
        try {
            const name = agent.name.trim();
            if (isCreating && allAgents.some(a => a.name === name)) {
                onErrorRef.current?.("已存在同名 Agent");
                return false;
            }

            const normalizedAgent: Agent = { ...agent, name };
            const newAgents = isCreating
                ? [...allAgents, normalizedAgent]
                : allAgents.map(a => a.name === normalizedAgent.name ? normalizedAgent : a);

            await dbSetAgents(newAgents);
            setAgents(newAgents);
            onSuccessRef.current?.(isCreating ? "Agent 创建成功" : "Agent 更新成功");
            return true;
        } catch (e) {
            console.error("Failed to save agent:", e);
            onErrorRef.current?.("保存失败");
            return false;
        } finally {
            setIsSaving(false);
        }
    }, []); // 无依赖，函数引用稳定

    const deleteAgent = useCallback(async (agentName: string): Promise<boolean> => {
        try {
            await dbDeleteAgent(agentName);
            const remaining = await dbGetAgents();
            setAgents(remaining);
            onSuccessRef.current?.("Agent 已删除");
            return true;
        } catch (e) {
            console.error("Failed to delete agent:", e);
            onErrorRef.current?.("删除失败");
        }
        return false;
    }, []); // 无依赖，函数引用稳定

    return {
        agents,
        setAgents,
        loadAgents,
        saveAgent,
        deleteAgent,
        isSaving
    };
}
