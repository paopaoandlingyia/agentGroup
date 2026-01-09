"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Agent, shortName } from "@/types";

export type MentionData = {
    name: string;
    startIndex: number;
    endIndex: number;
};

interface MentionInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    agents: Agent[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function MentionInput({
    value,
    onChange,
    onSubmit,
    agents,
    placeholder = "输入消息…（使用 @ 召唤 Agent）",
    disabled = false,
    className
}: MentionInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showMentions, setShowMentions] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [menuPosition, setMenuPosition] = useState({ bottom: 0, left: 0 });

    // 过滤匹配的 agents
    const filteredAgents = agents.filter((a) =>
        a.name.toLowerCase().includes(mentionQuery.toLowerCase())
    );

    // 重置选中索引当列表变化时
    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredAgents.length]);

    // 计算弹出菜单位置
    const updateMenuPosition = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea || mentionStartPos === null) return;

        // 创建一个隐藏的 div 来测量光标位置
        const div = document.createElement("div");
        const style = window.getComputedStyle(textarea);

        div.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      width: ${textarea.clientWidth}px;
      font: ${style.font};
      padding: ${style.padding};
      border: ${style.border};
      line-height: ${style.lineHeight};
    `;

        // 获取光标前的文本
        const textBeforeCursor = value.substring(0, mentionStartPos);
        div.textContent = textBeforeCursor;

        // 添加一个 span 来标记 @ 位置
        const marker = document.createElement("span");
        marker.textContent = "@";
        div.appendChild(marker);

        document.body.appendChild(div);

        const rect = textarea.getBoundingClientRect();
        const markerRect = marker.getBoundingClientRect();

        document.body.removeChild(div);

        // 计算相对于 textarea 的位置 (向上弹出)
        setMenuPosition({
            bottom: textarea.offsetHeight + 8,
            left: Math.min(markerRect.left - rect.left, textarea.clientWidth - 200)
        });
    }, [value, mentionStartPos]);

    useEffect(() => {
        if (showMentions) {
            updateMenuPosition();
        }
    }, [showMentions, updateMenuPosition]);

    // 处理输入变化
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const cursorPos = e.target.selectionStart;

        onChange(newValue);

        // 检查是否在输入 @
        const textBeforeCursor = newValue.substring(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf("@");

        if (atIndex !== -1) {
            // 检查 @ 前面是否是空格或开头
            const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
            if (charBefore === " " || charBefore === "\n" || atIndex === 0) {
                // 获取 @ 后面的查询文本
                const query = textBeforeCursor.substring(atIndex + 1);
                // 如果查询中没有空格，显示提及菜单
                if (!query.includes(" ") && !query.includes("\n")) {
                    setMentionQuery(query);
                    setMentionStartPos(atIndex);
                    setShowMentions(true);
                    return;
                }
            }
        }

        setShowMentions(false);
        setMentionStartPos(null);
    };

    // 选择一个 agent
    const selectAgent = useCallback((agent: Agent) => {
        if (mentionStartPos === null) return;

        const textarea = textareaRef.current;
        const cursorPos = textarea?.selectionStart ?? value.length;

        // 替换 @ 和查询文本为完整的 @AgentName
        const before = value.substring(0, mentionStartPos);
        const after = value.substring(cursorPos);
        const newValue = `${before}@${agent.name} ${after}`;

        onChange(newValue);
        setShowMentions(false);
        setMentionStartPos(null);

        // 移动光标到插入点之后
        setTimeout(() => {
            const newPos = mentionStartPos + agent.name.length + 2; // @name + space
            textarea?.setSelectionRange(newPos, newPos);
            textarea?.focus();
        }, 0);
    }, [value, onChange, mentionStartPos]);

    // 处理键盘事件
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showMentions && filteredAgents.length > 0) {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setSelectedIndex((i) => (i + 1) % filteredAgents.length);
                    return;
                case "ArrowUp":
                    e.preventDefault();
                    setSelectedIndex((i) => (i - 1 + filteredAgents.length) % filteredAgents.length);
                    return;
                case "Enter":
                    e.preventDefault();
                    selectAgent(filteredAgents[selectedIndex]);
                    return;
                case "Escape":
                    e.preventDefault();
                    setShowMentions(false);
                    return;
                case "Tab":
                    e.preventDefault();
                    selectAgent(filteredAgents[selectedIndex]);
                    return;
            }
        }

        // 正常的 Enter 提交（无 Shift）
        if (e.key === "Enter" && !e.shiftKey && !showMentions) {
            e.preventDefault();
            onSubmit();
        }
    };

    return (
        <div className={cn("relative", className)}>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className="min-h-[56px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                onBlur={() => {
                    // 延迟关闭，以便点击菜单项有时间触发
                    setTimeout(() => setShowMentions(false), 150);
                }}
            />

            {/* @ Mention 下拉菜单 */}
            {showMentions && filteredAgents.length > 0 && (
                <div
                    className="absolute z-50 min-w-[200px] max-w-[280px] rounded-lg border bg-white dark:bg-slate-900 p-1 shadow-xl"
                    style={{
                        bottom: menuPosition.bottom,
                        left: Math.max(0, menuPosition.left)
                    }}
                >
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        选择要召唤的 Agent
                    </div>
                    {filteredAgents.map((agent, index) => (
                        <button
                            key={agent.name}
                            type="button"
                            className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                                index === selectedIndex
                                    ? "bg-accent text-accent-foreground"
                                    : "hover:bg-accent/50"
                            )}
                            onMouseDown={(e) => {
                                e.preventDefault(); // 防止 blur 事件触发
                                selectAgent(agent);
                            }}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            <Avatar className="h-6 w-6">
                                <AvatarImage src={agent.avatar_url ?? undefined} alt={agent.name} />
                                <AvatarFallback className="text-xs">{shortName(agent.name)}</AvatarFallback>
                            </Avatar>
                            <span className="truncate font-medium">@{agent.name}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* 无匹配时的提示 */}
            {showMentions && filteredAgents.length === 0 && mentionQuery && (
                <div
                    className="absolute z-50 min-w-[200px] rounded-lg border bg-white dark:bg-slate-900 p-3 text-sm text-muted-foreground shadow-xl"
                    style={{
                        bottom: menuPosition.bottom,
                        left: Math.max(0, menuPosition.left)
                    }}
                >
                    未找到匹配的 Agent: @{mentionQuery}
                </div>
            )}
        </div>
    );
}
