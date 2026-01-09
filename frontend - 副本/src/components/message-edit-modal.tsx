"use client";

import { X, Save } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface MessageEditModalProps {
    isOpen: boolean;
    initialContent: string;
    onSave: (content: string) => void;
    onCancel: () => void;
    speaker?: string;
}

export function MessageEditModal({
    isOpen,
    initialContent,
    onSave,
    onCancel,
    speaker
}: MessageEditModalProps) {
    const [content, setContent] = useState(initialContent);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        setContent(initialContent);
    }, [initialContent]);

    useEffect(() => {
        if (isOpen && textareaRef.current) {
            textareaRef.current.focus();
            // Move cursor to end
            textareaRef.current.selectionStart = textareaRef.current.value.length;
        }
    }, [isOpen]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 400) + "px";
        }
    }, [content]);

    if (!isOpen) return null;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            onCancel();
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            onSave(content);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) onCancel();
            }}
        >
            <div className="w-full max-w-2xl rounded-2xl border bg-card shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        编辑消息
                        {speaker && (
                            <span className="text-xs text-muted-foreground font-normal px-2 py-0.5 bg-muted rounded-full">
                                {speaker}
                            </span>
                        )}
                    </h3>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-4">
                    <textarea
                        ref={textareaRef}
                        className="w-full min-h-[120px] max-h-[400px] p-3 text-sm border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono leading-relaxed"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="输入消息内容..."
                    />
                    <p className="text-[10px] text-muted-foreground mt-2">
                        提示：Ctrl + Enter 快速保存，Esc 取消
                    </p>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-5 py-3 border-t bg-muted/20">
                    <Button variant="outline" size="sm" onClick={onCancel}>
                        取消
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={() => onSave(content)}>
                        <Save className="h-3.5 w-3.5" />
                        保存修改
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default MessageEditModal;
