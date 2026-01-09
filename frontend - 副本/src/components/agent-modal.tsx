"use client";

import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Agent } from "@/types";

interface AgentModalProps {
    agent: Agent;
    isCreating: boolean;
    isSaving: boolean;
    onAgentChange: (agent: Agent) => void;
    onSave: () => void;
    onClose: () => void;
}

export function AgentModal({
    agent,
    isCreating,
    isSaving,
    onAgentChange,
    onSave,
    onClose
}: AgentModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        {isCreating ? "添加新智能体" : `配置 ${agent.name}`}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
                    {/* Name Input */}
                    {isCreating && (
                        <div>
                            <label className="text-xs font-semibold mb-1 block">名称</label>
                            <input
                                className="w-full border rounded-md p-2 text-sm bg-background"
                                placeholder="e.g. 产品经理"
                                value={agent.name}
                                onChange={e => onAgentChange({ ...agent, name: e.target.value })}
                            />
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-semibold mb-1 block">系统提示词 (System Prompt)</label>
                        <textarea
                            className="w-full border rounded-md p-2 text-sm h-24 bg-background resize-none"
                            value={agent.system_prompt}
                            onChange={e => onAgentChange({ ...agent, system_prompt: e.target.value })}
                        />
                    </div>

                    {/* Configs */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold mb-1 block">模型 (Model)</label>
                            <input
                                className="w-full border rounded-md p-2 text-sm bg-background"
                                value={agent.model || ""}
                                onChange={e => onAgentChange({ ...agent, model: e.target.value })}
                                placeholder="gpt-4o"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold mb-1 block">温度 (Temperature)</label>
                            <input
                                type="number"
                                step="0.1"
                                className="w-full border rounded-md p-2 text-sm bg-background"
                                value={agent.temperature ?? 0.7}
                                onChange={e => onAgentChange({ ...agent, temperature: parseFloat(e.target.value) })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold mb-1 block">API Base URL</label>
                        <input
                            className="w-full border rounded-md p-2 text-sm bg-background"
                            value={agent.base_url || ""}
                            onChange={e => onAgentChange({ ...agent, base_url: e.target.value })}
                            placeholder="Default"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-semibold mb-1 block">API Key</label>
                        <input
                            type="password"
                            className="w-full border rounded-md p-2 text-sm bg-background"
                            value={agent.api_key || ""}
                            onChange={e => onAgentChange({ ...agent, api_key: e.target.value })}
                            placeholder="Default"
                        />
                    </div>

                    {/* 流式输出开关 */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                        <div>
                            <label className="text-xs font-semibold block">流式输出 (Streaming)</label>
                            <span className="text-[10px] text-muted-foreground">启用后会逐字输出，体验更流畅</span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={agent.stream !== false}
                            onClick={() => onAgentChange({ ...agent, stream: agent.stream === false })}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${agent.stream !== false ? 'bg-primary' : 'bg-gray-200'
                                }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${agent.stream !== false ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                            />
                        </button>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>取消</Button>
                    <Button onClick={onSave} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 保存
                    </Button>
                </div>
            </div>
        </div>
    );
}
