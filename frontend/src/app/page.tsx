"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings2, X, Menu } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

// 自定义组件
import { SessionSidebar, MemberSidebar } from "@/components/sidebar";
import { ChatArea } from "@/components/chat-area";
import { ChatInput } from "@/components/chat-input";
import { AgentModal } from "@/components/agent-modal";
import { SessionModal } from "@/components/session-modal";
import { MessageEditModal } from "@/components/message-edit-modal";
import { DataModal } from "@/components/data-modal";

// Hooks
import { useChat } from "@/hooks/use-chat";
import { useAgents } from "@/hooks/use-agents";
import { useSessions } from "@/hooks/use-sessions";

// Types
import { Agent, TranscriptItem } from "@/types";


export default function Home() {
  // --- Hooks ---

  const {
    agents,
    setAgents,
    loadAgents,
    saveAgent,
    deleteAgent,
    isSaving: isSavingAgent
  } = useAgents({
    onSuccess: (msg) => toast.success(msg),
    onError: (msg) => toast.error(msg)
  });

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    activeSessionData,
    setActiveSessionData,
    loadSessions,
    createSession,
    updateSession,
    deleteSession,
    forkSession,
    loadSessionHistory
  } = useSessions({
    onSuccess: (msg) => toast.success(msg),
    onError: (msg) => toast.error(msg)
  });

  const [useProxy, setUseProxy] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  const {
    transcript,
    setTranscript,
    isLoading,
    sendMessage,
    invokeAgent,
    addMessageOnly,
    shouldSmoothScroll
  } = useChat({
    activeSessionId,
    agents,
    globalPrompt: activeSessionData?.global_prompt,
    useProxy: useProxy,
    onError: (msg) => toast.error(msg)
  });

  // --- UI State ---

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileMemberOpen, setIsMobileMemberOpen] = useState(false);
  const [isMemberSidebarOpen, setIsMemberSidebarOpen] = useState(false); // 默认关闭，开启沉浸模式

  // Modals
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [editingSession, setEditingSession] = useState<typeof sessions[0] | null>(null);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);

  // Message Editing
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  const [editingMessageSpeaker, setEditingMessageSpeaker] = useState<string>("");

  // Input State
  const [inputValue, setInputValue] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);

  // --- Computed Values ---

  const agentsByName = useMemo(() => new Map(agents.map((a) => [a.name, a])), [agents]);

  const agentNamesSet = useMemo(() => new Set(agents.map(a => `@${a.name}`)), [agents]);
  const hasMention = useCallback((text: string) => {
    const matches = text.match(/@([\w\-\u4e00-\u9fff]+)/g);
    return matches?.some(m => agentNamesSet.has(m)) ?? false;
  }, [agentNamesSet]);

  // --- Initialization ---

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { dbGetUseProxy, dbGetTheme } = await import("@/lib/local-db");
      const [, loadedSessions, loadedUseProxy, loadedTheme] = await Promise.all([
        loadAgents(),
        loadSessions(),
        dbGetUseProxy(),
        dbGetTheme()
      ]);

      if (!mounted) return;
      setUseProxy(loadedUseProxy);
      setTheme(loadedTheme);
      applyTheme(loadedTheme);

      const savedId = window.localStorage.getItem("agent_group_session_id");
      if (savedId && loadedSessions.some(s => s.id === savedId)) {
        setActiveSessionId(savedId);
      } else if (loadedSessions.length > 0) {
        setActiveSessionId(loadedSessions[0].id);
      }
    };

    init();

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeSessionId) {
      setTranscript([]);
      setActiveSessionData(null);
      return;
    }

    let mounted = true;

    const load = async () => {
      shouldSmoothScroll.current = false;
      const history = await loadSessionHistory(activeSessionId);
      if (mounted) {
        setTranscript(history);
      }
    };
    load();

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // --- Handlers ---

  const handleSubmit = () => {
    if ((!inputValue.trim() && pendingImages.length === 0) || isLoading || !activeSessionId) return;

    const text = inputValue.trim();
    const images = [...pendingImages];
    const hasMentionInText = hasMention(text);

    setInputValue("");
    setPendingImages([]);

    if (hasMentionInText) {
      void sendMessage(text, images);
    } else {
      void addMessageOnly(text, images);
    }
  };

  const handleSaveAgent = async () => {
    if (!editingAgent) return;
    const success = await saveAgent(editingAgent, isCreatingAgent, agents);
    if (success) {
      setEditingAgent(null);
      setIsCreatingAgent(false);
    }
  };

  const handleDeleteAgent = async (name: string) => {
    if (!confirm(`确认删除 ${name}?`)) return;
    await deleteAgent(name);
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("确定要删除这个讨论组吗？历史记录将无法恢复。")) return;
    await deleteSession(id);
  };

  const handleUpdateSession = async () => {
    if (!editingSession) return;
    const success = await updateSession(editingSession);
    if (success) {
      setEditingSession(null);
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeSessionId) return;
    try {
      const { dbUpdateMessageContent } = await import("@/lib/local-db");
      const ok = await dbUpdateMessageContent(activeSessionId, messageId, newContent);
      if (!ok) throw new Error("Message not found");
      setTranscript((prev) => prev.map((item) => (item.id === messageId ? { ...item, content: newContent } : item)));
      closeEditModal();
      toast.success("消息已更新");
    } catch (e) {
      console.error("Failed to edit message:", e);
      toast.error("编辑失败");
    }
  };

  const handleUseProxyChange = async (val: boolean) => {
    setUseProxy(val);
    const { dbSetUseProxy } = await import("@/lib/local-db");
    await dbSetUseProxy(val);
  };

  const applyTheme = (mode: "light" | "dark" | "system") => {
    const root = document.documentElement;
    if (mode === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.toggle("dark", mode === "dark");
    }
  };

  const handleThemeChange = async (mode: "light" | "dark" | "system") => {
    setTheme(mode);
    applyTheme(mode);
    const { dbSetTheme } = await import("@/lib/local-db");
    await dbSetTheme(mode);
  };

  const handleCopyAgent = async (agent: Agent) => {
    let copyName = `${agent.name}-副本`;
    let counter = 1;
    while (agents.some(a => a.name === copyName)) {
      counter++;
      copyName = `${agent.name}-副本${counter}`;
    }
    const newAgent: Agent = {
      ...agent,
      name: copyName
    };
    setIsCreatingAgent(true);
    setEditingAgent(newAgent);
  };

  const handleAgentsReorder = async (orderedNames: string[]) => {
    const reordered = orderedNames
      .map(name => agents.find(a => a.name === name))
      .filter((a): a is Agent => !!a);
    setAgents(reordered);
    const { dbUpdateAgentsOrder } = await import("@/lib/local-db");
    await dbUpdateAgentsOrder(orderedNames);
  };

  const handleSessionsReorder = async (orderedIds: string[]) => {
    const { dbUpdateSessionsOrder } = await import("@/lib/local-db");
    await dbUpdateSessionsOrder(orderedIds);
    await loadSessions();
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeSessionId) return;
    if (!confirm("确定要删除这条消息吗？")) return;
    try {
      const { dbDeleteMessage } = await import("@/lib/local-db");
      const ok = await dbDeleteMessage(activeSessionId, messageId);
      if (!ok) throw new Error("Message not found");
      setTranscript((prev) => prev.filter((item) => item.id !== messageId));
      toast.success("消息已删除");
    } catch (e) {
      console.error("Failed to delete message:", e);
      toast.error("删除失败");
    }
  };

  const handleForkMessage = async (messageId: string) => {
    const forkedId = await forkSession(messageId);
    if (forkedId) {
      toast.success("分支已创建，已切换到新会话");
    }
  };

  const openEditModal = (item: TranscriptItem) => {
    setEditingMessageId(item.id);
    setEditingMessageContent(item.content);
    setEditingMessageSpeaker(item.kind === "agent" ? item.speaker : "用户");
  };

  const closeEditModal = () => {
    setEditingMessageId(null);
    setEditingMessageContent("");
    setEditingMessageSpeaker("");
  };

  const openCreateAgentModal = () => {
    setIsCreatingAgent(true);
    setEditingAgent({
      name: "",
      system_prompt: "你是一个有帮助的助手。",
      model: null,
      custom_params: null,
      base_url: null,
      api_key: null,
      stream: true
    });
  };

  const handleImportedData = useCallback(async (preferredSessionId: string | null) => {
    await loadAgents();
    const loadedSessions = await loadSessions();

    let nextSessionId: string | null = null;
    if (preferredSessionId && loadedSessions.some(s => s.id === preferredSessionId)) {
      nextSessionId = preferredSessionId;
    } else if (loadedSessions.length > 0) {
      nextSessionId = loadedSessions[0].id;
    }

    setActiveSessionId(nextSessionId);
    if (nextSessionId) {
      const history = await loadSessionHistory(nextSessionId);
      setTranscript(history);
    } else {
      setTranscript([]);
      setActiveSessionData(null);
    }
  }, [loadAgents, loadSessions, loadSessionHistory, setActiveSessionData, setActiveSessionId, setTranscript]);

  // --- Render ---

  return (
    <div className="min-h-dvh gradient-mesh-bg p-3 md:p-5 font-sans selection:bg-primary/10">
      <Toaster position="top-center" richColors />

      <div className="mx-auto flex h-[calc(100dvh-1.5rem)] md:h-[calc(100dvh-2.5rem)] w-full max-w-7xl gap-4 relative overflow-hidden">

        {/* --- Session Sidebar (Left) - 悬浮卡片 --- */}
        <aside className="hidden w-72 flex-col md:flex flex-shrink-0 floating-card rounded-2xl overflow-hidden">
          <SessionSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSessionSelect={setActiveSessionId}
            onSessionCreate={createSession}
            onSessionDelete={handleDeleteSession}
            onSessionsReorder={handleSessionsReorder}
            onSystemSettingsClick={() => setIsDataModalOpen(true)}
          />
        </aside>

        {/* --- Mobile Sidebar (Drawer) --- */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden animate-in fade-in"
            onClick={() => setIsMobileSidebarOpen(false)}
          >
            <div
              className="absolute left-0 top-0 h-full w-[80%] max-w-sm overlay-drawer shadow-xl animate-in slide-in-from-left duration-300 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <span className="font-bold text-lg">讨论组</span>
                <Button variant="ghost" size="icon" onClick={() => setIsMobileSidebarOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <SessionSidebar
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  onSessionSelect={(id) => { setActiveSessionId(id); setIsMobileSidebarOpen(false); }}
                  onSessionCreate={createSession}
                  onSessionDelete={handleDeleteSession}
                  onSessionsReorder={handleSessionsReorder}
                  onSystemSettingsClick={() => { setIsDataModalOpen(true); setIsMobileSidebarOpen(false); }}
                />
              </div>
            </div>
          </div>
        )}

        {/* --- Mobile Member Drawer (Right) --- */}
        {isMobileMemberOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden animate-in fade-in"
            onClick={() => setIsMobileMemberOpen(false)}
          >
            <div
              className="absolute right-0 top-0 h-full w-[80%] max-w-sm overlay-drawer shadow-xl animate-in slide-in-from-right duration-300 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <span className="font-bold text-lg">群成员</span>
                <Button variant="ghost" size="icon" onClick={() => setIsMobileMemberOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <MemberSidebar
                  agents={agents}
                  onAgentEdit={(agent) => { setEditingAgent(agent); setIsMobileMemberOpen(false); }}
                  onAgentCreate={() => { openCreateAgentModal(); setIsMobileMemberOpen(false); }}
                  onAgentDelete={handleDeleteAgent}
                  onAgentCopy={handleCopyAgent}
                  onAgentsReorder={handleAgentsReorder}
                  isLoading={isLoading}
                  hasActiveSession={!!activeSessionId}
                />
              </div>
            </div>
          </div>
        )}

        {/* --- Main Chat Area - 悬浮卡片 --- */}
        <main className="flex flex-1 flex-col overflow-hidden floating-card rounded-2xl relative">
          {/* Header */}
          <header className="flex items-center justify-between border-b border-border/50 px-5 py-3.5 bg-gradient-to-r from-transparent via-muted/5 to-transparent">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-9 w-9 flex-shrink-0"
                onClick={() => setIsMobileSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="flex flex-col min-w-0">
                <h1 className="text-sm font-bold truncate">
                  {activeSessionData?.name || "未选择讨论组"}
                </h1>
                <div
                  className="mt-0.5 flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border border-transparent text-[10px] text-muted-foreground/70 transition-all cursor-pointer group hover:bg-muted/50 hover:border-border/50 hover:text-muted-foreground max-w-fit"
                  onClick={() => {
                    if (activeSessionId) {
                      setEditingSession(sessions.find(s => s.id === activeSessionId) || null);
                    }
                  }}
                  title="点击配置讨论组"
                >
                  <Settings2 className="h-3 w-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                  <span className="truncate max-w-[200px]">
                    {activeSessionData?.global_prompt ? `全局 Prompt: ${activeSessionData.global_prompt}` : "无全局 Prompt"}
                  </span>
                  {isLoading && <span className="inline-block h-1 w-1 rounded-full bg-green-500/50 animate-pulse ml-1" />}
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {/* Member Toggle (Now for all screen sizes) */}
              <Button
                variant={isMemberSidebarOpen ? "secondary" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs px-2 md:px-3 rounded-full transition-all duration-200"
                onClick={() => setIsMemberSidebarOpen(!isMemberSidebarOpen)}
              >
                <Avatar className="h-3.5 w-3.5">
                  <AvatarFallback className="text-[6px] bg-primary text-primary-foreground font-bold">AG</AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline">{isMemberSidebarOpen ? "收起成员" : `群成员(${agents.length})`}</span>
              </Button>
            </div>
          </header>

          {/* Chat Area */}
          <ChatArea
            transcript={transcript}
            agentsByName={agentsByName}
            globalPrompt={activeSessionData?.global_prompt}
            isEmpty={!activeSessionId}
            onEditMessage={openEditModal}
            onDeleteMessage={handleDeleteMessage}
            onForkMessage={handleForkMessage}
            shouldSmoothScroll={shouldSmoothScroll}
          />

          {/* Input Area */}
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            agents={agents}
            disabled={!activeSessionId}
            isLoading={isLoading}
            pendingImages={pendingImages}
            onImageAdd={(base64) => setPendingImages(prev => [...prev, base64])}
            onImageRemove={(idx) => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
            onAgentInvoke={invokeAgent}
          />
        </main>

        {/* --- Member Sidebar (Overlay Drawer) --- */}
        {isMemberSidebarOpen && (
          <div
            className="absolute inset-0 z-30 flex justify-end"
            onClick={() => setIsMemberSidebarOpen(false)}
          >
            {/* Background transparent layer to capture clicks to close */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

            <aside
              className="relative w-72 h-full flex flex-col overlay-drawer rounded-l-2xl border-l-0 animate-in slide-in-from-right duration-300"
              onClick={e => e.stopPropagation()}
            >
              <MemberSidebar
                agents={agents}
                onAgentEdit={(agent) => { setEditingAgent(agent); setIsMemberSidebarOpen(false); }}
                onAgentCreate={() => { openCreateAgentModal(); setIsMemberSidebarOpen(false); }}
                onAgentDelete={handleDeleteAgent}
                onAgentCopy={handleCopyAgent}
                onAgentsReorder={handleAgentsReorder}
                isLoading={isLoading}
                hasActiveSession={!!activeSessionId}
              />
            </aside>
          </div>
        )}
      </div>

      {/* --- Modals --- */}

      {editingAgent && (
        <AgentModal
          agent={editingAgent}
          isCreating={isCreatingAgent}
          isSaving={isSavingAgent}
          onAgentChange={setEditingAgent}
          onSave={handleSaveAgent}
          onClose={() => { setEditingAgent(null); setIsCreatingAgent(false); }}
        />
      )}

      {editingSession && (
        <SessionModal
          session={editingSession}
          onSessionChange={setEditingSession}
          onSave={handleUpdateSession}
          onClose={() => setEditingSession(null)}
        />
      )}

      <MessageEditModal
        isOpen={editingMessageId !== null}
        initialContent={editingMessageContent}
        speaker={editingMessageSpeaker}
        onSave={(newContent) => {
          if (editingMessageId) {
            handleEditMessage(editingMessageId, newContent);
          }
        }}
        onCancel={closeEditModal}
      />

      <DataModal
        isOpen={isDataModalOpen}
        activeSessionId={activeSessionId}
        onClose={() => setIsDataModalOpen(false)}
        onImported={handleImportedData}
        useProxy={useProxy}
        onUseProxyChange={handleUseProxyChange}
        theme={theme}
        onThemeChange={handleThemeChange}
      />
    </div>
  );
}
