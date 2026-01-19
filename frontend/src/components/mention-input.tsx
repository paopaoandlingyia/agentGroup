"use client";

import * as React from "react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Agent } from "@/types";

interface MentionInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    agents: Agent[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    textareaClassName?: string;
}

export function MentionInput({
    value,
    onChange,
    onSubmit,
    placeholder = "输入消息…",
    disabled = false,
    className,
    textareaClassName
}: MentionInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // 处理键盘事件
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
        }
    };

    return (
        <div className={cn("relative", className)}>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className={cn(
                    "min-h-[56px] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    textareaClassName
                )}
            />
        </div>
    );
}

