"use client";

import React, { useRef, useEffect } from "react";
import { Plus, Trash2, MessageSquare, AtSign, MoreVertical, Settings2, Copy, GripVertical } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Agent, SessionSummary, shortName } from "@/types";

// dnd-kit imports
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SidebarProps {
    // Session 相关
    sessions: SessionSummary[];
    activeSessionId: string | null;
    onSessionSelect: (id: string) => void;
    onSessionCreate: () => void;
    onSessionDelete: (id: string) => void;
    onSessionsReorder: (orderedIds: string[]) => void;

    // Agent 相关
    agents: Agent[];
    onAgentEdit: (agent: Agent) => void;
    onAgentCreate: () => void;
    onAgentDelete: (name: string) => void;
    onAgentCopy: (agent: Agent) => void;
    onAgentInvoke: (name: string) => void;
    onAgentsReorder: (orderedNames: string[]) => void;
    isLoading?: boolean;

    // 移动端关闭
    onMobileClose?: () => void;
}

// --- Sortable Session Item ---
function SortableSessionItem({
    session,
    isActive,
    onClick,
    onDelete,
}: {
    session: SessionSummary;
    isActive: boolean;
    onClick: () => void;
    onDelete: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: session.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={{ ...style, touchAction: "none" }}
            className={`group relative flex items-center rounded-lg px-4 py-2 text-sm transition-all cursor-pointer overflow-hidden ${isActive
                ? "bg-primary/10 text-primary font-medium"
                : "hover:bg-accent text-foreground/80"
                } ${isDragging ? "z-50 shadow-lg" : ""}`}
            onClick={onClick}
            title={session.name}
        >
            <div className="flex flex-col min-w-0 flex-1 mr-2">
                <span className="truncate">{session.name}</span>
                <span className="text-[10px] text-muted-foreground truncate">
                    {new Date(session.created_at * 1000).toLocaleDateString()}
                </span>
            </div>
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
}

// --- Sortable Agent Item ---
function SortableAgentItem({
    agent,
    isLoading,
    hasActiveSession,
    onInvoke,
    onEdit,
    onCopy,
    onDelete,
    isMenuOpen,
    onMenuToggle,
    menuRef,
}: {
    agent: Agent;
    isLoading: boolean;
    hasActiveSession: boolean;
    onInvoke: () => void;
    onEdit: () => void;
    onCopy: () => void;
    onDelete: () => void;
    isMenuOpen: boolean;
    onMenuToggle: () => void;
    menuRef: React.RefObject<HTMLDivElement>;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: agent.name });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={{ ...style, touchAction: "none" }}
            {...attributes}
            {...listeners}
            className={`group relative rounded-lg border border-transparent px-4 py-2.5 hover:bg-accent/50 hover:border-border transition-all cursor-pointer ${isDragging ? "z-50 shadow-lg bg-card" : ""
                }`}
        >
            <div
                className="grid items-center gap-3"
                style={{ gridTemplateColumns: "32px 1fr auto" }}
            >
                <Avatar className="h-8 w-8 shadow-sm">
                    <AvatarImage src={agent.avatar_url || ""} />
                    <AvatarFallback className="bg-muted text-[10px]">
                        {shortName(agent.name)}
                    </AvatarFallback>
                </Avatar>

                <div className="overflow-hidden">
                    <div
                        className="text-xs font-semibold truncate text-foreground/90"
                        title={agent.name}
                    >
                        {agent.name}
                    </div>
                    <div
                        className="text-[10px] text-muted-foreground truncate"
                        title={agent.model || "Default"}
                    >
                        {agent.model || "Default"}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-1">
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 rounded-full shadow-sm bg-background border hover:bg-primary/10 hover:text-primary transition-colors text-muted-foreground"
                        title={`直接召唤 ${agent.name} 回复`}
                        disabled={isLoading || !hasActiveSession}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={onInvoke}
                    >
                        <AtSign className="h-3.5 w-3.5" />
                    </Button>
                    <div className="relative">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-muted-foreground hover:bg-accent"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={onMenuToggle}
                        >
                            <MoreVertical className="h-3.5 w-3.5" />
                        </Button>

                        {isMenuOpen && (
                            <div
                                ref={menuRef}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full z-50 mt-1 w-32 rounded-md border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95"
                            >
                                <button
                                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                                    onClick={onEdit}
                                >
                                    <Settings2 className="h-3.5 w-3.5" /> 编辑配置
                                </button>
                                <button
                                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                                    onClick={onCopy}
                                >
                                    <Copy className="h-3.5 w-3.5" /> 复制智能体
                                </button>
                                <button
                                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                                    onClick={onDelete}
                                >
                                    <Trash2 className="h-3.5 w-3.5" /> 删除智能体
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function Sidebar({
    sessions,
    activeSessionId,
    onSessionSelect,
    onSessionCreate,
    onSessionDelete,
    onSessionsReorder,
    agents,
    onAgentEdit,
    onAgentCreate,
    onAgentDelete,
    onAgentCopy,
    onAgentInvoke,
    onAgentsReorder,
    isLoading = false,
    onMobileClose,
}: SidebarProps) {
    const [activeMenuAgent, setActiveMenuAgent] = React.useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

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

    // dnd-kit sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // 稍微增大移动阈值，确保点击按钮时不会误触发拖拽
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 300, // 移动端长按 300ms 开启拖拽
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleSessionDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = sessions.findIndex((s) => s.id === active.id);
            const newIndex = sessions.findIndex((s) => s.id === over.id);
            const newOrder = arrayMove(sessions, oldIndex, newIndex);
            onSessionsReorder(newOrder.map((s) => s.id));
        }
    };

    const handleAgentDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = agents.findIndex((a) => a.name === active.id);
            const newIndex = agents.findIndex((a) => a.name === over.id);
            const newOrder = arrayMove(agents, oldIndex, newIndex);
            onAgentsReorder(newOrder.map((a) => a.name));
        }
    };

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
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={onSessionCreate}
                        title="新建讨论组"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <ScrollArea className="flex-1 p-2">
                    {sessions.length === 0 ? (
                        <div className="text-center py-8 text-xs text-muted-foreground">
                            暂无讨论组<br />点击右上角 +号 新建
                        </div>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleSessionDragEnd}
                        >
                            <SortableContext
                                items={sessions.map((s) => s.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="space-y-1">
                                    {sessions.map((s) => (
                                        <SortableSessionItem
                                            key={s.id}
                                            session={s}
                                            isActive={activeSessionId === s.id}
                                            onClick={() => handleSessionClick(s.id)}
                                            onDelete={() => onSessionDelete(s.id)}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}
                </ScrollArea>
            </div>

            {/* Bottom: Agents */}
            <div className="flex-1 rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col min-h-0">
                <div className="flex items-center justify-between p-4 pb-2 border-b bg-muted/20">
                    <span className="font-medium text-sm flex items-center gap-2">
                        <Avatar className="h-4 w-4">
                            <AvatarImage src="" />
                            <AvatarFallback className="text-[8px] bg-primary text-primary-foreground">
                                AG
                            </AvatarFallback>
                        </Avatar>
                        群成员 ({agents.length})
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={onAgentCreate}
                        title="添加 Agent"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <ScrollArea className="flex-1 p-2 overflow-hidden">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleAgentDragEnd}
                    >
                        <SortableContext
                            items={agents.map((a) => a.name)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2 max-w-full">
                                {agents.map((a) => (
                                    <SortableAgentItem
                                        key={a.name}
                                        agent={a}
                                        isLoading={isLoading}
                                        hasActiveSession={!!activeSessionId}
                                        onInvoke={() => handleAgentInvoke(a.name)}
                                        onEdit={() => {
                                            onAgentEdit({ ...a });
                                            setActiveMenuAgent(null);
                                        }}
                                        onCopy={() => {
                                            onAgentCopy(a);
                                            setActiveMenuAgent(null);
                                        }}
                                        onDelete={() => {
                                            onAgentDelete(a.name);
                                            setActiveMenuAgent(null);
                                        }}
                                        isMenuOpen={activeMenuAgent === a.name}
                                        onMenuToggle={() =>
                                            setActiveMenuAgent(
                                                activeMenuAgent === a.name ? null : a.name
                                            )
                                        }
                                        menuRef={menuRef}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </ScrollArea>
            </div>
        </div>
    );
}
