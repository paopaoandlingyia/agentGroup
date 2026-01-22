"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Pencil, Trash2, MessageSquare, GitBranch } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Agent, TranscriptItem, shortName } from "@/types";

interface ChatAreaProps {
    transcript: TranscriptItem[];
    agentsByName: Map<string, Agent>;
    globalPrompt?: string;
    isEmpty?: boolean;
    onEditMessage: (item: TranscriptItem) => void;
    onDeleteMessage: (id: string) => void;
    onForkMessage: (id: string) => void;
    shouldSmoothScroll: React.MutableRefObject<boolean>;
}

export function ChatArea({
    transcript,
    agentsByName,
    globalPrompt,
    isEmpty = false,
    onEditMessage,
    onDeleteMessage,
    onForkMessage,
    shouldSmoothScroll
}: ChatAreaProps) {
    // 使用 state 存储 viewport 元素，确保在元素可用时触发重新渲染
    const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
    const lastTranscriptLength = useRef(transcript.length);
    // 改用 state，确保用户交互后能正确阻止自动滚动
    const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
    // 用于防止 scroll 事件在我们程序化滚动时误判
    const isProgrammaticScroll = useRef(false);

    // 判断是否在底部的阈值
    const BOTTOM_THRESHOLD = 50;

    // 使用 ref 获取 ScrollArea 根元素
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    // 回调 ref：当 viewport 挂载时，保存其引用
    // 修改为使用 useEffect 从 scrollAreaRef 中查找 viewport，适配标准 shadcn 组件
    useEffect(() => {
        if (scrollAreaRef.current) {
            const viewportNode = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
            setViewport(viewportNode);
        }
    }, []);

    // 检查是否在底部
    const checkIfAtBottom = useCallback(() => {
        if (!viewport) return true;
        return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < BOTTOM_THRESHOLD;
    }, [viewport]);

    // 注册滚动相关的事件监听器
    useEffect(() => {
        if (!viewport) return;

        // 监听用户主动交互：滚轮、触摸、鼠标按下滚动条
        const handleUserInteraction = () => {
            // 用户主动交互，立即禁用自动滚动
            setIsAutoScrollEnabled(false);
        };

        // 监听滚动结束，检测用户是否回到了底部
        const handleScroll = () => {
            // 如果是程序化滚动，忽略
            if (isProgrammaticScroll.current) return;

            // 用户滚动后，检查是否回到底部
            if (checkIfAtBottom()) {
                setIsAutoScrollEnabled(true);
            }
        };

        // wheel 事件：用户滚轮滚动
        viewport.addEventListener("wheel", handleUserInteraction, { passive: true });
        // touchmove 事件：触摸滑动
        viewport.addEventListener("touchmove", handleUserInteraction, { passive: true });
        // pointerdown 事件：用户点击/拖动滚动条
        viewport.addEventListener("pointerdown", handleUserInteraction, { passive: true });
        // scroll 事件：检测是否回到底部
        viewport.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            viewport.removeEventListener("wheel", handleUserInteraction);
            viewport.removeEventListener("touchmove", handleUserInteraction);
            viewport.removeEventListener("pointerdown", handleUserInteraction);
            viewport.removeEventListener("scroll", handleScroll);
        };
    }, [viewport, checkIfAtBottom]);

    // 处理滚动逻辑
    useEffect(() => {
        if (!viewport) return;

        // 1. 判断是否是新消息开始（长度增加了）
        const isNewMessage = transcript.length > lastTranscriptLength.current;
        lastTranscriptLength.current = transcript.length;

        // 2. 如果是用户发了新消息，强制开启自动滚动
        if (isNewMessage) {
            setIsAutoScrollEnabled(true);
        }

        // 3. 执行滚动（只有当自动滚动启用时）
        if (isAutoScrollEnabled || isNewMessage) {
            const behavior = (isNewMessage && shouldSmoothScroll.current) ? "smooth" : "instant";

            isProgrammaticScroll.current = true;
            requestAnimationFrame(() => {
                viewport.scrollTo({
                    top: viewport.scrollHeight,
                    behavior: behavior
                });
                // 延迟重置标志，确保 scroll 事件处理完毕
                setTimeout(() => {
                    isProgrammaticScroll.current = false;
                }, 100);
            });
        }
    }, [transcript, shouldSmoothScroll, viewport, isAutoScrollEnabled]);

    if (isEmpty) {
        return (
            <ScrollArea className="flex-1 p-4 bg-background">
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    请先选择或创建一个讨论组
                </div>
            </ScrollArea>
        );
    }

    return (
        <ScrollArea
            ref={scrollAreaRef}
            className="flex-1 bg-background"
        >
            <div className="flex flex-col gap-4 max-w-3xl mx-auto px-1 pb-4 p-4">
                {globalPrompt && (
                    <div className="mx-auto text-[10px] text-muted-foreground bg-muted/40 px-3 py-1 rounded-full mb-2 text-center">
                        💡 全局 Prompt 已启用: {globalPrompt}
                    </div>
                )}

                {transcript.map((item) => (
                    <div key={item.id} className={`group flex flex-col ${item.kind === "user" ? "items-end" : "items-start"}`}>
                        {/* Message Row */}
                        {/* Message Row - min-w-0 is CRITICAL for flex item shrinking */}
                        <div className={`flex ${item.kind === "user" ? "flex-row-reverse" : "flex-row"} items-start gap-2 w-full min-w-0`}>
                            {/* Agent Avatar */}
                            {item.kind === "agent" && (
                                <Avatar className="h-8 w-8 shadow-sm ring-1 ring-border/50 flex-shrink-0">
                                    <AvatarImage src={agentsByName.get(item.speaker)?.avatar_url || ""} />
                                    <AvatarFallback>{shortName(item.speaker)}</AvatarFallback>
                                </Avatar>
                            )}

                            {/* Message Bubble */}
                            <div className={`flex flex-col min-w-0 ${item.kind === "user" ? "items-end" : "items-start"} ${item.kind === "system" ? "w-full" : "max-w-[calc(100%-48px)] sm:max-w-[85%]"
                                }`}>
                                <div className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed overflow-hidden min-w-0 max-w-full ${item.kind === "user"
                                    ? "bg-primary text-primary-foreground rounded-tr-none"
                                    : item.kind === "system"
                                        ? "bg-muted/50 text-muted-foreground italic mx-auto text-[11px] border border-dashed rounded-lg"
                                        : "bg-card border rounded-tl-none"
                                    }`}>

                                    {/* Agent Header */}
                                    {item.kind === "agent" && (
                                        <div className="mb-1 flex items-center gap-2 select-none flex-wrap">
                                            <span className="text-xs font-bold text-primary">{item.speaker}</span>
                                            <span className="text-[9px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded-full border truncate max-w-[120px]">
                                                {agentsByName.get(item.speaker)?.model || "Default"}
                                            </span>
                                        </div>
                                    )}

                                    {/* Content with proper overflow handling */}
                                    <div className="overflow-hidden min-w-0">
                                        {item.kind === "agent" ? (
                                            <MarkdownRenderer content={item.content || "..."} />
                                        ) : (
                                            <div className="whitespace-pre-wrap break-words" style={{ overflowWrap: "anywhere" }}>{item.content || "..."}</div>
                                        )}
                                    </div>

                                    {/* Images if any */}
                                    {item.kind !== "system" && item.images && item.images.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {item.images.map((img, idx) => (
                                                <img
                                                    key={idx}
                                                    src={img.startsWith("data:") ? img : `data:image/png;base64,${img}`}
                                                    alt={`image-${idx}`}
                                                    className="max-w-[150px] sm:max-w-[200px] max-h-[150px] sm:max-h-[200px] rounded-lg border shadow-sm cursor-pointer hover:opacity-90 transition-opacity object-cover"
                                                    onClick={() => window.open(img.startsWith("data:") ? img : `data:image/png;base64,${img}`, "_blank")}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Action Buttons - Below Message */}
                                {item.kind !== "system" && (
                                    <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors text-[10px] flex items-center gap-1"
                                            title="编辑"
                                            onClick={() => onEditMessage(item)}
                                        >
                                            <Pencil className="h-3 w-3" />
                                            <span className="hidden sm:inline">编辑</span>
                                        </button>
                                        <button
                                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors text-[10px] flex items-center gap-1"
                                            title="从此处创建分支"
                                            onClick={() => onForkMessage(item.id)}
                                        >
                                            <GitBranch className="h-3 w-3" />
                                            <span className="hidden sm:inline">分支</span>
                                        </button>
                                        <button
                                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors text-[10px] flex items-center gap-1"
                                            title="删除"
                                            onClick={() => onDeleteMessage(item.id)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                            <span className="hidden sm:inline">删除</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {transcript.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 opacity-50">
                        <MessageSquare className="h-8 w-8" />
                        <p className="text-xs">这个讨论组还没有消息，@Agent 开始聊天吧</p>
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}
