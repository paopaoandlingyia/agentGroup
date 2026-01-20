"use client";

import React, { useRef, useEffect } from "react";
import { Plus, Trash2, MessageSquare, MoreVertical, Settings2, Copy, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Agent, SessionSummary, shortName } from "@/types";

// dnd-kit imports
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
    } = useSortable({
        id: session.id,
        transition: {
            duration: 150,
            easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={{ ...style, touchAction: "none" }}
            {...attributes}
            {...listeners}
            className={`session-item group relative flex items-center rounded-xl px-4 py-2.5 text-sm cursor-pointer overflow-hidden ${isDragging
                ? "shadow-lg bg-card cursor-grabbing"
                : isActive
                    ? "active"
                    : "text-foreground/80"
                }`}
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
    } = useSortable({
        id: agent.name,
        transition: {
            duration: 150,
            easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={{ ...style, touchAction: "none" }}
            {...attributes}
            {...listeners}
            className={`group relative rounded-lg border px-4 py-2.5 transition-all cursor-pointer ${isDragging
                ? "shadow-lg bg-card border-border cursor-grabbing"
                : "border-transparent hover:bg-accent/50 hover:border-border"
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

                <div className="flex items-center justify-end">
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

// --- SessionSidebar Component ---
export function SessionSidebar({
    sessions,
    activeSessionId,
    onSessionSelect,
    onSessionCreate,
    onSessionDelete,
    onSessionsReorder,
    onSystemSettingsClick,
}: {
    sessions: SessionSummary[];
    activeSessionId: string | null;
    onSessionSelect: (id: string) => void;
    onSessionCreate: () => void;
    onSessionDelete: (id: string) => void;
    onSessionsReorder: (orderedIds: string[]) => void;
    onSystemSettingsClick: () => void;
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const [activeId, setActiveId] = React.useState<string | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        if (over && active.id !== over.id) {
            const oldIndex = sessions.findIndex((s) => s.id === active.id);
            const newIndex = sessions.findIndex((s) => s.id === over.id);
            const newOrder = arrayMove(sessions, oldIndex, newIndex);
            onSessionsReorder(newOrder.map((s) => s.id));
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-3 border-b border-border/40">
                <span className="font-bold text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary/80" /> 讨论组
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-primary/10 hover:text-primary transition-colors"
                    onClick={onSessionCreate}
                    title="新建讨论组"
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1 p-2">
                {sessions.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground italic">
                        暂无讨论组，点击 + 号开启对话
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragCancel={() => setActiveId(null)}
                    >
                        <SortableContext items={sessions.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                            <div className={`space-y-1 ${activeId ? "[&_*]:transition-none" : ""}`}>
                                {sessions.map((s) => (
                                    <SortableSessionItem
                                        key={s.id}
                                        session={s}
                                        isActive={activeSessionId === s.id}
                                        onClick={() => onSessionSelect(s.id)}
                                        onDelete={() => onSessionDelete(s.id)}
                                    />
                                ))}
                            </div>
                        </SortableContext>

                    </DndContext>
                )}
            </ScrollArea>

            <div className="p-3 border-t border-border/40 mt-auto">
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-2.5 px-3 h-10 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all duration-200"
                    onClick={onSystemSettingsClick}
                >
                    <Settings className="h-4 w-4" />
                    <span className="text-sm font-medium">系统设置</span>
                </Button>
            </div>
        </div>
    );
}

// --- MemberSidebar Component ---
export function MemberSidebar({
    agents,
    onAgentEdit,
    onAgentCreate,
    onAgentDelete,
    onAgentCopy,
    onAgentsReorder,
    isLoading = false,
    hasActiveSession,
}: {
    agents: Agent[];
    onAgentEdit: (agent: Agent) => void;
    onAgentCreate: () => void;
    onAgentDelete: (name: string) => void;
    onAgentCopy: (agent: Agent) => void;
    onAgentsReorder: (orderedNames: string[]) => void;
    isLoading?: boolean;
    hasActiveSession: boolean;
}) {
    const [activeMenuAgent, setActiveMenuAgent] = React.useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenuAgent(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const [activeId, setActiveId] = React.useState<string | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        if (over && active.id !== over.id) {
            const oldIndex = agents.findIndex((a) => a.name === active.id);
            const newIndex = agents.findIndex((a) => a.name === over.id);
            const newOrder = arrayMove(agents, oldIndex, newIndex);
            onAgentsReorder(newOrder.map((a) => a.name));
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-3 border-b border-border/40">
                <span className="font-bold text-sm flex items-center gap-2">
                    <Avatar className="h-4 w-4">
                        <AvatarFallback className="text-[8px] bg-primary text-primary-foreground font-sans">
                            AG
                        </AvatarFallback>
                    </Avatar>
                    群成员 ({agents.length})
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-primary/10 hover:text-primary transition-colors"
                    onClick={onAgentCreate}
                    title="添加 Agent"
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
            <ScrollArea className="flex-1 p-2">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setActiveId(null)}
                >
                    <SortableContext items={agents.map((a) => a.name)} strategy={verticalListSortingStrategy}>
                        <div className={`space-y-2 ${activeId ? "[&_*]:transition-none" : ""}`}>
                            {agents.map((a) => (
                                <SortableAgentItem
                                    key={a.name}
                                    agent={a}
                                    isLoading={isLoading}
                                    hasActiveSession={hasActiveSession}
                                    onEdit={() => { onAgentEdit(a); setActiveMenuAgent(null); }}
                                    onCopy={() => { onAgentCopy(a); setActiveMenuAgent(null); }}
                                    onDelete={() => { onAgentDelete(a.name); setActiveMenuAgent(null); }}
                                    isMenuOpen={activeMenuAgent === a.name}
                                    onMenuToggle={() => setActiveMenuAgent(activeMenuAgent === a.name ? null : a.name)}
                                    menuRef={menuRef}
                                />
                            ))}
                        </div>
                    </SortableContext>

                </DndContext>
            </ScrollArea>
        </div>
    );
}
