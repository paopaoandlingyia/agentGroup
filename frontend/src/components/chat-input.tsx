"use client";

import { useRef, useState, useEffect } from "react";
import { Send, Loader2, ImagePlus, X, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MentionInput } from "@/components/mention-input";
import { Agent, shortName } from "@/types";
import { cn } from "@/lib/utils";

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    agents: Agent[];
    disabled?: boolean;
    isLoading?: boolean;
    pendingImages: string[];
    onImageAdd: (base64: string) => void;
    onImageRemove: (index: number) => void;
    onAgentInvoke: (agentName: string) => void;
    placeholder?: string;
}

export function ChatInput({
    value,
    onChange,
    onSubmit,
    agents,
    disabled = false,
    isLoading = false,
    pendingImages,
    onImageAdd,
    onImageRemove,
    onAgentInvoke,
    placeholder = "输入消息，@Agent 指定发言... (Ctrl+V 粘贴图片)"
}: ChatInputProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
    const agentMenuRef = useRef<HTMLDivElement>(null);

    // Close agent menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (agentMenuRef.current && !agentMenuRef.current.contains(event.target as Node)) {
                setIsAgentMenuOpen(false);
            }
        };

        if (isAgentMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isAgentMenuOpen]);

    const handleImagePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) processImageFile(file);
                break;
            }
        }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        for (const file of files) {
            if (file.type.startsWith("image/")) {
                processImageFile(file);
            }
        }
        e.target.value = "";
    };

    const processImageFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            if (base64) {
                onImageAdd(base64);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        onSubmit();
    };

    const handleAgentSelect = (agentName: string) => {
        onAgentInvoke(agentName);
        setIsAgentMenuOpen(false);
    };

    return (
        <footer className="p-3 sm:p-4 bg-card/80 backdrop-blur border-t">
            {/* Pending Images Preview */}
            {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 max-w-3xl mx-auto">
                    {pendingImages.map((img, idx) => (
                        <div key={idx} className="relative group/img">
                            <img
                                src={img}
                                alt={`pending-${idx}`}
                                className="h-16 w-16 object-cover rounded-lg border shadow-sm"
                            />
                            <button
                                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity shadow"
                                onClick={() => onImageRemove(idx)}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="max-w-3xl mx-auto relative">
                {/* Agent Selection Menu (Popover) */}
                {isAgentMenuOpen && (
                    <div
                        ref={agentMenuRef}
                        className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border bg-white p-1 shadow-xl animate-in fade-in zoom-in-95 z-50 flex flex-col gap-1 max-h-[300px] overflow-y-auto"
                    >
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b mb-1">
                            选择 Agent 直接回复
                        </div>
                        {agents.map((agent) => (
                            <button
                                key={agent.name}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-accent transition-colors text-left"
                                onClick={() => handleAgentSelect(agent.name)}
                            >
                                <Avatar className="h-6 w-6">
                                    <AvatarImage src={agent.avatar_url ?? undefined} />
                                    <AvatarFallback className="text-[10px]">{shortName(agent.name)}</AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="truncate font-medium leading-none">{agent.name}</span>
                                    {agent.model && (
                                        <span className="truncate text-[10px] text-muted-foreground mt-0.5">
                                            {agent.model}
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                <div
                    className={cn(
                        "rounded-xl border bg-background shadow-sm transition-all overflow-hidden",
                        "focus-within:ring-1 focus-within:ring-ring focus-within:border-primary/50"
                    )}
                >
                    <div className="px-1 pt-1" onPaste={handleImagePaste}>
                        <MentionInput
                            value={value}
                            onChange={onChange}
                            onSubmit={handleSubmit}
                            agents={agents}
                            disabled={isLoading || disabled}
                            className="w-full"
                            textareaClassName="border-0 focus-visible:ring-0 shadow-none min-h-[60px] resize-none py-3 bg-transparent"
                            placeholder={disabled ? "请先选择讨论组" : placeholder}
                        />
                    </div>

                    <div className="flex items-center justify-between p-2 pt-0 md:p-3 md:pt-0 bg-transparent">
                        <div className="flex items-center gap-1">
                            {/* Image Upload Button */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={handleImageSelect}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={disabled}
                                title="上传图片"
                            >
                                <ImagePlus className="h-4 w-4" />
                            </Button>

                            {/* Agent Invoke Button */}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-8 w-8 text-muted-foreground hover:text-foreground",
                                    isAgentMenuOpen && "bg-accent text-accent-foreground"
                                )}
                                onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
                                disabled={disabled || agents.length === 0}
                                title="召唤 Agent"
                            >
                                <AtSign className="h-4 w-4" />
                            </Button>
                        </div>

                        <Button
                            type="button"
                            onClick={() => handleSubmit()}
                            disabled={isLoading || (!value.trim() && pendingImages.length === 0) || disabled}
                            size="sm"
                            className="h-8 px-4 rounded-lg shadow-none"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            <span className="sr-only">发送</span>
                        </Button>
                    </div>
                </div>


            </div>
        </footer>
    );
}
