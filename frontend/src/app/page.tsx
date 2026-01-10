"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings2, X, Menu, Database } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

// 自定义组件
import { Sidebar } from "@/components/sidebar";
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
import { Agent, TranscriptItem, shortName } from "@/types";


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

  // 只在组件挂载时执行一次
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // 并行加载 agents, sessions 和 settings
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

      // 恢复上次的 session
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
  }, []); // 空依赖，只在挂载时执行一次

  // 加载当前 session 的历史记录
  useEffect(() => {
    if (!activeSessionId) {
      setTranscript([]);
      setActiveSessionData(null);
      return;
    }

    let mounted = true;

    const load = async () => {
      shouldSmoothScroll.current = false; // 加载历史时直接跳转
      const history = await loadSessionHistory(activeSessionId);
      if (mounted) {
        setTranscript(history);
      }
    };
    load();

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]); // 只依赖 activeSessionId

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
    // 生成一个不重复的名称
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
    // 直接打开编辑模态框，让用户可以修改名称后保存
    setIsCreatingAgent(true);
    setEditingAgent(newAgent);
  };

  const handleAgentsReorder = async (orderedNames: string[]) => {
    // 立即更新 UI
    const reordered = orderedNames
      .map(name => agents.find(a => a.name === name))
      .filter((a): a is Agent => !!a);
    setAgents(reordered);
    // 持久化到 IndexedDB
    const { dbUpdateAgentsOrder } = await import("@/lib/local-db");
    await dbUpdateAgentsOrder(orderedNames);
  };

  const handleSessionsReorder = async (orderedIds: string[]) => {
    // 在 useSessions hook 中没有暴露 setSessions，所以我们需要重新加载
    // 先持久化，然后重新加载
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
      // forkSession 内部已经设置了 activeSessionId，
      // 并且 useEffect 会自动加载新会话的历史
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
      temperature: 0.7,
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
    <div className="min-h-dvh bg-gradient-to-b from-background to-muted/30 p-2 md:p-4 font-sans selection:bg-primary/10">
      <Toaster position="top-center" richColors />

      <div className="mx-auto flex h-[calc(100dvh-2rem)] w-full max-w-7xl gap-4 relative overflow-hidden">

        {/* --- Sidebar (Desktop) --- */}
        <aside className="hidden w-72 flex-col gap-4 md:flex flex-shrink-0">
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSessionSelect={setActiveSessionId}
            onSessionCreate={createSession}
            onSessionDelete={handleDeleteSession}
            onSessionsReorder={handleSessionsReorder}
            agents={agents}
            onAgentEdit={setEditingAgent}
            onAgentCreate={openCreateAgentModal}
            onAgentDelete={handleDeleteAgent}
            onAgentCopy={handleCopyAgent}
            onAgentInvoke={invokeAgent}
            onAgentsReorder={handleAgentsReorder}
            isLoading={isLoading}
          />
        </aside>

        {/* --- Sidebar (Mobile Drawer) --- */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden animate-in fade-in"
            onClick={() => setIsMobileSidebarOpen(false)}
          >
            <div
              className="absolute left-0 top-0 h-full w-[80%] max-w-sm bg-background p-4 shadow-xl animate-in slide-in-from-left duration-300 flex flex-col gap-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-lg">讨论组 & 成员</span>
                <Button variant="ghost" size="icon" onClick={() => setIsMobileSidebarOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <Sidebar
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  onSessionSelect={setActiveSessionId}
                  onSessionCreate={createSession}
                  onSessionDelete={handleDeleteSession}
                  onSessionsReorder={handleSessionsReorder}
                  agents={agents}
                  onAgentEdit={setEditingAgent}
                  onAgentCreate={openCreateAgentModal}
                  onAgentDelete={handleDeleteAgent}
                  onAgentCopy={handleCopyAgent}
                  onAgentInvoke={invokeAgent}
                  onAgentsReorder={handleAgentsReorder}
                  isLoading={isLoading}
                  onMobileClose={() => setIsMobileSidebarOpen(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* --- Main Chat --- */}
        <main className="flex flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm relative">
          {/* Header */}
          <header className="flex items-center justify-between border-b px-4 py-3 bg-card/80 backdrop-blur">
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
                <h1 className="text-sm font-bold flex items-center gap-2 truncate">
                  {activeSessionData?.name || "未选择讨论组"}
                </h1>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 min-h-[1.5em] max-w-md truncate">
                  {activeSessionData?.global_prompt ? (
                    <span className="truncate flex-1 text-blue-600/80 bg-blue-50 px-1 rounded">
                      全局 Prompt: {activeSessionData.global_prompt}
                    </span>
                  ) : (
                    <span>无全局 Prompt</span>
                  )}
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ml-2 ${isLoading ? 'animate-pulse bg-green-500' : 'bg-transparent'}`} />
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs px-2 md:px-3"
                disabled={!activeSessionId}
                onClick={() => {
                  if (activeSessionId) {
                    setEditingSession(sessions.find(s => s.id === activeSessionId) || null);
                  }
                }}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">讨论组设置</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs px-2 md:px-3"
                onClick={() => setIsDataModalOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">系统设置</span>
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
