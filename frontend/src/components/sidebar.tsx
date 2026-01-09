"use client";

import { useRef, useEffect } from "react";
import { Plus, Trash2, MessageSquare, AtSign, MoreVertical, Settings2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Agent, SessionSummary, shortName } from "@/types";

interface SidebarProps {
    // Session 相关
    sessions: SessionSummary[];
    activeSessionId: string | null;
    onSessionSelect: (id: string) => void;
    onSessionCreate: () => void;
    onSessionDelete: (id: string) => void;

    // Agent 相关
    agents: Agent[];
    onAgentEdit: (agent: Agent) => void;
    onAgentCreate: () => void;
    onAgentDelete: (name: string) => void;
    onAgentInvoke: (name: string) => void;
    isLoading?: boolean;

    // 移动端关闭
    onMobileClose?: () => void;
}

export function Sidebar({
    sessions,
    activeSessionId,
    onSessionSelect,
    onSessionCreate,
    onSessionDelete,
    agents,
    onAgentEdit,
    onAgentCreate,
    onAgentDelete,
    onAgentInvoke,
    isLoading = false,
    onMobileClose
}: SidebarProps) {
    const [activeMenuAgent, setActiveMenuAgent] = React.useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    // 点击外部关闭菜单
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenuAgent(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSessionClick = (id: string) => {
        onSessionSelect(id);
        onMobileClose?.();
    };

    const handleAgentInvoke = (name: string) => {
        onMobileClose?.();
        onAgentInvoke(name);
    };

    return (
        <div className="flex h-full flex-col gap-4">
            {/* Top: Sessions */}
            <div className="flex-[0.8] rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 pb-2 border-b bg-muted/20">
                    <span className="font-medium text-sm flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" /> 讨论组
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSessionCreate} title="新建讨论组">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <ScrollArea className="flex-1 p-2">
                    <div className="space-y-1">
                        {sessions.map(s => (
                            <div
                                key={s.id}
                                className={`group relative flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all cursor-pointer overflow-hidden ${activeSessionId === s.id
                                        ? "bg-primary/10 text-primary font-medium"
                                        : "hover:bg-accent text-foreground/80"
                                    }`}
                                onClick={() => handleSessionClick(s.id)}
                                title={s.name}
                            >
                                <div className="flex flex-col min-w-0 flex-1 mr-2">
                                    <span className="truncate">{s.name}</span>
                                    <span className="text-[10px] text-muted-foreground truncate">
                                        {new Date(s.created_at * 1000).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSessionDelete(s.id);
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {sessions.length === 0 && (
                            <div className="text-center py-8 text-xs text-muted-foreground">
                                暂无讨论组<br />点击右上角 +号 新建
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Bottom: Agents */}
            <div className="flex-1 rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col min-h-0">
                <div className="flex items-center justify-between p-4 pb-2 border-b bg-muted/20">
                    <span className="font-medium text-sm flex items-center gap-2">
                        <Avatar className="h-4 w-4">
                            <AvatarImage src="" />
                            <AvatarFallback className="text-[8px] bg-primary text-primary-foreground">AG</AvatarFallback>
                        </Avatar>
                        群成员 ({agents.length})
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAgentCreate} title="添加 Agent">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <ScrollArea className="flex-1 p-2 overflow-hidden">
                    <div className="space-y-2 max-w-full">
                        {agents.map(a => (
                            <div
                                key={a.name}
                                className="group relative rounded-lg border border-transparent p-2 hover:bg-accent/50 hover:border-border transition-all"
                            >
                                <div
                                    className="grid items-center gap-2"
                                    style={{ gridTemplateColumns: '32px 1fr 68px' }}
                                >
                                    <Avatar className="h-8 w-8 shadow-sm">
                                        <AvatarImage src={a.avatar_url || ""} />
                                        <AvatarFallback className="bg-muted text-[10px]">{shortName(a.name)}</AvatarFallback>
                                    </Avatar>

                                    <div className="overflow-hidden">
                                        <div className="text-xs font-semibold truncate text-foreground/90" title={a.name}>
                                            {a.name}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground truncate" title={a.model || "Default"}>
                                            {a.model || "Default"}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-1">
                                        <Button
                                            variant="secondary"
                                            size="icon"
                                            className="h-7 w-7 rounded-full shadow-sm bg-background border hover:bg-primary/10 hover:text-primary transition-colors text-muted-foreground"
                                            title={`直接召唤 ${a.name} 回复`}
                                            disabled={isLoading || !activeSessionId}
                                            onClick={() => handleAgentInvoke(a.name)}
                                        >
                                            <AtSign className="h-3.5 w-3.5" />
                                        </Button>
                                        <div className="relative">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 rounded-full text-muted-foreground hover:bg-accent"
                                                onClick={() => setActiveMenuAgent(activeMenuAgent === a.name ? null : a.name)}
                                            >
                                                <MoreVertical className="h-3.5 w-3.5" />
                                            </Button>

                                            {activeMenuAgent === a.name && (
                                                <div
                                                    ref={menuRef}
                                                    className="absolute right-0 top-full z-50 mt-1 w-32 rounded-md border bg-white p-1 shadow-lg animate-in fade-in zoom-in-95"
                                                >
                                                    <button
                                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                                                        onClick={() => { onAgentEdit({ ...a }); setActiveMenuAgent(null); }}
                                                    >
                                                        <Settings2 className="h-3.5 w-3.5" /> 编辑配置
                                                    </button>
                                                    <button
                                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                                                        onClick={() => { onAgentDelete(a.name); setActiveMenuAgent(null); }}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" /> 删除智能体
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}

// 需要导入 React
import React from "react";
