"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionSummary } from "@/types";

interface SessionModalProps {
    session: SessionSummary;
    onSessionChange: (session: SessionSummary) => void;
    onSave: () => void;
    onClose: () => void;
}

export function SessionModal({
    session,
    onSessionChange,
    onSave,
    onClose
}: SessionModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold">讨论组设置</h2>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold mb-1 block">讨论组名称</label>
                        <input
                            className="w-full border rounded-md p-2 text-sm bg-background focus:ring-2 ring-primary/20 outline-none"
                            value={session.name}
                            onChange={e => onSessionChange({ ...session, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold mb-1 block flex items-center justify-between">
                            全局提示词 (Global Prompt)
                            <span className="text-[9px] text-muted-foreground font-normal">注入到所有 Agent 系统提示词后</span>
                        </label>
                        <textarea
                            className="w-full border rounded-md p-2 text-sm h-32 bg-background focus:ring-2 ring-primary/20 outline-none resize-none"
                            value={session.global_prompt}
                            onChange={e => onSessionChange({ ...session, global_prompt: e.target.value })}
                            placeholder="例如：请使用中文回复，并保持严肃的学术风格..."
                        />
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>取消</Button>
                    <Button onClick={onSave}>保存更改</Button>
                </div>
            </div>
        </div>
    );
}
