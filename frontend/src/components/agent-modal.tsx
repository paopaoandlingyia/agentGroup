"use client";

import { useRef, useState } from "react";
import { X, Loader2, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Agent, shortName } from "@/types";

interface AgentModalProps {
    agent: Agent;
    isCreating: boolean;
    isSaving: boolean;
    onAgentChange: (agent: Agent) => void;
    onSave: () => void;
    onClose: () => void;
}

// 压缩图片并转为 base64
async function compressImage(file: File, maxSize: number = 128): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Canvas not supported"));
                    return;
                }

                // 计算缩放比例，保持正方形
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;

                canvas.width = maxSize;
                canvas.height = maxSize;
                ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);

                // 输出为 webp（更小）或 jpeg
                const dataUrl = canvas.toDataURL("image/webp", 0.8);
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

// 验证并格式化 JSON
function validateAndFormatJson(input: string): { valid: boolean; formatted: string; error?: string } {
    const trimmed = input.trim();
    if (!trimmed) {
        return { valid: true, formatted: "" };
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return { valid: false, formatted: trimmed, error: "必须是一个 JSON 对象 {}" };
        }
        return { valid: true, formatted: JSON.stringify(parsed, null, 2) };
    } catch {
        return { valid: false, formatted: trimmed, error: "JSON 格式错误" };
    }
}

export function AgentModal({
    agent,
    isCreating,
    isSaving,
    onAgentChange,
    onSave,
    onClose
}: AgentModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [customParamsText, setCustomParamsText] = useState(() => {
        if (agent.custom_params && Object.keys(agent.custom_params).length > 0) {
            return JSON.stringify(agent.custom_params, null, 2);
        }
        return "";
    });
    const [jsonError, setJsonError] = useState<string | null>(null);

    const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            return;
        }

        try {
            const compressed = await compressImage(file, 128);
            onAgentChange({ ...agent, avatar_url: compressed });
        } catch (err) {
            console.error("Failed to process avatar:", err);
        }

        e.target.value = "";
    };

    const handleRemoveAvatar = () => {
        onAgentChange({ ...agent, avatar_url: null });
    };

    const handleCustomParamsChange = (value: string) => {
        setCustomParamsText(value);

        const { valid, error } = validateAndFormatJson(value);
        if (valid) {
            setJsonError(null);
            const trimmed = value.trim();
            if (!trimmed) {
                onAgentChange({ ...agent, custom_params: null });
            } else {
                try {
                    onAgentChange({ ...agent, custom_params: JSON.parse(trimmed) });
                } catch {
                    // 不应该发生，因为已验证
                }
            }
        } else {
            setJsonError(error || "JSON 格式错误");
        }
    };

    const handleCustomParamsBlur = () => {
        const { valid, formatted } = validateAndFormatJson(customParamsText);
        if (valid && formatted) {
            setCustomParamsText(formatted);
        }
    };

    // 检查是否有 JSON 错误
    const hasJsonError = jsonError !== null;

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
                    {/* Avatar & Name Row */}
                    <div className="flex items-start gap-4">
                        {/* Avatar Upload */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="relative group">
                                <Avatar className="h-16 w-16 border-2 border-dashed border-border cursor-pointer hover:border-primary transition-colors">
                                    <AvatarImage src={agent.avatar_url || ""} />
                                    <AvatarFallback className="bg-muted text-sm">
                                        {agent.name ? shortName(agent.name) : "?"}
                                    </AvatarFallback>
                                </Avatar>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarSelect}
                                />
                                <button
                                    type="button"
                                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Upload className="h-5 w-5 text-white" />
                                </button>
                            </div>
                            {agent.avatar_url && (
                                <button
                                    type="button"
                                    className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                                    onClick={handleRemoveAvatar}
                                >
                                    <Trash2 className="h-3 w-3" /> 移除头像
                                </button>
                            )}
                        </div>

                        {/* Name Input (for creating) or info */}
                        <div className="flex-1">
                            {isCreating ? (
                                <div>
                                    <label className="text-xs font-semibold mb-1 block">名称</label>
                                    <input
                                        className="w-full border rounded-md p-2 text-sm bg-background"
                                        placeholder="e.g. 产品经理"
                                        value={agent.name}
                                        onChange={e => onAgentChange({ ...agent, name: e.target.value })}
                                    />
                                </div>
                            ) : (
                                <div className="pt-2">
                                    <div className="text-sm font-semibold">{agent.name}</div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        点击头像上传自定义图片
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold mb-1 block">系统提示词 (System Prompt)</label>
                        <textarea
                            className="w-full border rounded-md p-2 text-sm h-24 bg-background resize-none"
                            value={agent.system_prompt}
                            onChange={e => onAgentChange({ ...agent, system_prompt: e.target.value })}
                        />
                    </div>

                    {/* Model */}
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

                    {/* Custom Params */}
                    <div>
                        <label className="text-xs font-semibold mb-1 block">
                            高级参数 (JSON)
                            <span className="font-normal text-muted-foreground ml-2">
                                如 temperature, top_p 等
                            </span>
                        </label>
                        <textarea
                            className={`w-full border rounded-md p-2 text-sm h-20 bg-background resize-none font-mono text-xs ${hasJsonError ? "border-destructive focus:ring-destructive" : ""
                                }`}
                            value={customParamsText}
                            onChange={e => handleCustomParamsChange(e.target.value)}
                            onBlur={handleCustomParamsBlur}
                            placeholder='{"temperature": 0.7, "top_p": 0.9}'
                            spellCheck={false}
                        />
                        {hasJsonError && (
                            <p className="text-[10px] text-destructive mt-1">{jsonError}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                            这些参数会被直接合并到 LLM API 请求中
                        </p>
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
                    <Button onClick={onSave} disabled={isSaving || hasJsonError}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 保存
                    </Button>
                </div>
            </div>
        </div>
    );
}
