"use client";

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
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
    // 使用 ref 追踪自动滚动状态（只有“贴在底部”时才跟随流式输出）
    const isAutoScrollEnabledRef = useRef(true);
    // 追踪上一次的 scrollTop，用于检测用户是否主动向上滚动
    const lastScrollTopRef = useRef(0);

    // 判断是否在底部的阈值
    const BOTTOM_THRESHOLD = 50;

    const handleViewportRef = useCallback((node: HTMLDivElement | null) => {
        setViewport(node);
    }, []);

    // 检查是否在底部
    const checkIfAtBottom = useCallback(() => {
        if (!viewport) return true;
        return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < BOTTOM_THRESHOLD;
    }, [viewport]);

    // 注册滚动事件监听器
    useEffect(() => {
        if (!viewport) return;

        const handleScroll = () => {
            const currentScrollTop = viewport.scrollTop;
            const previousScrollTop = lastScrollTopRef.current;

            // 用户主动向上滚动（scrollTop 减少）则禁用自动滚动；回到底部则恢复。
            const isScrollingUp = currentScrollTop < previousScrollTop - 5; // 5px 容差，避免抖动
            if (isScrollingUp) {
                isAutoScrollEnabledRef.current = false;
            } else if (checkIfAtBottom()) {
                isAutoScrollEnabledRef.current = true;
            }

            lastScrollTopRef.current = currentScrollTop;
        };

        viewport.addEventListener("scroll", handleScroll, { passive: true });
        // 初始化一次，避免首次渲染时状态不同步
        handleScroll();

        return () => {
            viewport.removeEventListener("scroll", handleScroll);
        };
    }, [viewport, checkIfAtBottom]);

    // 处理滚动逻辑 - 使用 useLayoutEffect 确保在 DOM 更新后、浏览器绑定前同步执行
    useLayoutEffect(() => {
        if (!viewport) return;

        // 1. 判断是否是新消息开始（长度增加了）
        const isNewMessage = transcript.length > lastTranscriptLength.current;
        lastTranscriptLength.current = transcript.length;

        // 2. 只有当自动滚动启用时才执行滚动（用户主动上滑后，不应被流式输出“拽回去”）
        if (!isAutoScrollEnabledRef.current) return;

        const behavior: ScrollBehavior = (isNewMessage && shouldSmoothScroll.current) ? "smooth" : "auto";
        // useLayoutEffect 已经在 DOM 更新后同步执行，这里直接滚动即可。
        viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    }, [transcript, shouldSmoothScroll, viewport]);

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
            viewportRef={handleViewportRef}
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
                                {/* Agent Header - 移到气泡外部 */}
                                {item.kind === "agent" && (
                                    <div className="mb-1 flex items-center gap-2 select-none flex-wrap">
                                        <span className="text-xs font-semibold text-foreground/90">{item.speaker}</span>
                                        <span className="text-[9px] text-muted-foreground px-1.5 py-0.5 bg-muted/60 rounded-full truncate max-w-[120px]">
                                            {agentsByName.get(item.speaker)?.model || "Default"}
                                        </span>
                                    </div>
                                )}

                                {/* 气泡本体 - 全圆角 */}
                                <div className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed overflow-hidden min-w-0 max-w-full ${item.kind === "user"
                                    ? "bg-primary text-primary-foreground"
                                    : item.kind === "system"
                                        ? "bg-muted/50 text-muted-foreground italic mx-auto text-[11px] border border-dashed rounded-lg"
                                        : "bg-card border"
                                    }`}>

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
