import type { Agent, SessionDetail, SessionSummary, TranscriptItem } from "@/types";

const DB_NAME = "agent-group";
const DB_VERSION = 1;

type DbStoreName = "meta" | "agents" | "sessions";

export type StoredMessage =
  | {
      id: string;
      kind: "user";
      content: string;
      images?: string[];
      created_at: number;
    }
  | {
      id: string;
      kind: "agent";
      speaker: string;
      content: string;
      images?: string[];
      created_at: number;
    }
  | {
      id: string;
      kind: "system";
      content: string;
      created_at: number;
    };

export type StoredSession = {
  id: string;
  name: string;
  global_prompt: string;
  created_at: number;
  updated_at: number;
  messages: StoredMessage[];
};

export type ExportBundleV1 = {
  app: "agent-group";
  version: 1;
  exported_at: number;
  agents: Agent[];
  sessions: StoredSession[];
  active_session_id: string | null;
};

let _dbPromise: Promise<IDBDatabase> | null = null;

function _req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function _txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function _openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment");
  }

  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("agents")) db.createObjectStore("agents", { keyPath: "name" });
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });

  return _dbPromise;
}

function _newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function _toSessionSummary(session: StoredSession): SessionSummary {
  return {
    id: session.id,
    name: session.name,
    global_prompt: session.global_prompt,
    created_at: session.created_at,
    message_count: session.messages.length,
  };
}

function _toTranscript(items: StoredMessage[]): TranscriptItem[] {
  return items.map((m) => {
    if (m.kind === "user") return { id: m.id, kind: "user", content: m.content, images: m.images };
    if (m.kind === "system") return { id: m.id, kind: "system", content: m.content };
    return { id: m.id, kind: "agent", speaker: m.speaker, content: m.content, images: m.images };
  });
}

function _toStoredMessage(item: TranscriptItem, created_at: number): StoredMessage {
  if (item.kind === "user") {
    return { id: item.id, kind: "user", content: item.content, images: item.images, created_at };
  }
  if (item.kind === "system") {
    return { id: item.id, kind: "system", content: item.content, created_at };
  }
  return {
    id: item.id,
    kind: "agent",
    speaker: item.speaker,
    content: item.content,
    images: item.images,
    created_at,
  };
}

async function _getAll<T>(store: IDBObjectStore): Promise<T[]> {
  // Older Safari doesn't support getAll in some modes, but Next.js targets modern browsers.
  return _req(store.getAll() as IDBRequest<T[]>);
}

export async function dbGetAgents(): Promise<Agent[]> {
  const db = await _openDb();
  const tx = db.transaction("agents", "readonly");
  const store = tx.objectStore("agents");
  const agents = await _getAll<Agent>(store);
  await _txDone(tx);
  return agents;
}

export async function dbSetAgents(agents: Agent[]): Promise<void> {
  const db = await _openDb();
  const tx = db.transaction("agents", "readwrite");
  const store = tx.objectStore("agents");
  store.clear();
  for (const agent of agents) store.put(agent);
  await _txDone(tx);
}

export async function dbUpsertAgent(agent: Agent): Promise<void> {
  const db = await _openDb();
  const tx = db.transaction("agents", "readwrite");
  tx.objectStore("agents").put(agent);
  await _txDone(tx);
}

export async function dbDeleteAgent(name: string): Promise<void> {
  const db = await _openDb();
  const tx = db.transaction("agents", "readwrite");
  tx.objectStore("agents").delete(name);
  await _txDone(tx);
}

export async function dbListSessions(): Promise<SessionSummary[]> {
  const db = await _openDb();
  const tx = db.transaction("sessions", "readonly");
  const store = tx.objectStore("sessions");
  const sessions = await _getAll<StoredSession>(store);
  await _txDone(tx);
  return sessions
    .sort((a, b) => b.created_at - a.created_at)
    .map(_toSessionSummary);
}

export async function dbSetSessions(sessions: StoredSession[]): Promise<void> {
  const db = await _openDb();
  const tx = db.transaction("sessions", "readwrite");
  const store = tx.objectStore("sessions");
  store.clear();
  for (const session of sessions) store.put(session);
  await _txDone(tx);
}

export async function dbGetSession(sessionId: string): Promise<StoredSession | null> {
  const db = await _openDb();
  const tx = db.transaction("sessions", "readonly");
  const store = tx.objectStore("sessions");
  const session = await _req(store.get(sessionId) as IDBRequest<StoredSession | undefined>);
  await _txDone(tx);
  return session ?? null;
}

export async function dbGetSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const session = await dbGetSession(sessionId);
  if (!session) return null;
  return {
    ..._toSessionSummary(session),
    history: _toTranscript(session.messages),
  };
}

export async function dbCreateSession(
  name: string = "新讨论组",
  global_prompt: string = "",
): Promise<SessionSummary> {
  const now = Date.now() / 1000;
  const session: StoredSession = {
    id: _newId(),
    name,
    global_prompt,
    created_at: now,
    updated_at: now,
    messages: [],
  };
  const db = await _openDb();
  const tx = db.transaction("sessions", "readwrite");
  tx.objectStore("sessions").put(session);
  await _txDone(tx);
  return _toSessionSummary(session);
}

export async function dbUpdateSession(sessionId: string, updates: { name?: string; global_prompt?: string }): Promise<void> {
  const session = await dbGetSession(sessionId);
  if (!session) return;
  const next: StoredSession = {
    ...session,
    name: updates.name ?? session.name,
    global_prompt: updates.global_prompt ?? session.global_prompt,
    updated_at: Date.now() / 1000,
  };
  const db = await _openDb();
  const tx = db.transaction("sessions", "readwrite");
  tx.objectStore("sessions").put(next);
  await _txDone(tx);
}

export async function dbDeleteSession(sessionId: string): Promise<void> {
  const db = await _openDb();
  const tx = db.transaction("sessions", "readwrite");
  tx.objectStore("sessions").delete(sessionId);
  await _txDone(tx);
}

export async function dbAppendMessage(sessionId: string, item: TranscriptItem): Promise<string> {
  const session = await dbGetSession(sessionId);
  if (!session) throw new Error("Session not found");
  const created_at = Date.now() / 1000;
  const messageId = item.id || _newId();
  const storedItem = _toStoredMessage({ ...item, id: messageId } as TranscriptItem, created_at);
  const next: StoredSession = {
    ...session,
    updated_at: created_at,
    messages: [...session.messages, storedItem],
  };
  const db = await _openDb();
  const tx = db.transaction("sessions", "readwrite");
  tx.objectStore("sessions").put(next);
  await _txDone(tx);
  return messageId;
}

export async function dbUpsertMessage(sessionId: string, item: TranscriptItem): Promise<void> {
  const session = await dbGetSession(sessionId);
  if (!session) throw new Error("Session not found");
  const idx = session.messages.findIndex((m) => m.id === item.id);
  const created_at = idx >= 0 ? session.messages[idx].created_at : Date.now() / 1000;
  const stored = _toStoredMessage(item, created_at);
  const nextMessages = [...session.messages];
  if (idx >= 0) nextMessages[idx] = stored;
  else nextMessages.push(stored);
  const next: StoredSession = { ...session, updated_at: Date.now() / 1000, messages: nextMessages };
  const db = await _openDb();
  const tx = db.transaction("sessions", "readwrite");
  tx.objectStore("sessions").put(next);
  await _txDone(tx);
}

export async function dbUpdateMessageContent(sessionId: string, messageId: string, content: string): Promise<boolean> {
  const session = await dbGetSession(sessionId);
  if (!session) return false;
  const idx = session.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return false;
  const msg = session.messages[idx];
  const nextMessages = [...session.messages];
  nextMessages[idx] = { ...msg, content };
  const next: StoredSession = { ...session, updated_at: Date.now() / 1000, messages: nextMessages };
  const db = await _openDb();
  const tx = db.transaction("sessions", "readwrite");
  tx.objectStore("sessions").put(next);
  await _txDone(tx);
  return true;
}

export async function dbDeleteMessage(sessionId: string, messageId: string): Promise<boolean> {
  const session = await dbGetSession(sessionId);
  if (!session) return false;
  const nextMessages = session.messages.filter((m) => m.id !== messageId);
  if (nextMessages.length === session.messages.length) return false;
  const next: StoredSession = { ...session, updated_at: Date.now() / 1000, messages: nextMessages };
  const db = await _openDb();
  const tx = db.transaction("sessions", "readwrite");
  tx.objectStore("sessions").put(next);
  await _txDone(tx);
  return true;
}

export async function dbForkSessionFromMessage(
  sourceSessionId: string,
  messageId: string,
  newName?: string,
): Promise<SessionSummary | null> {
  const source = await dbGetSession(sourceSessionId);
  if (!source) return null;

  const idx = source.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return null;

  const now = Date.now() / 1000;
  const forked: StoredSession = {
    id: _newId(),
    name: newName || `${source.name} (分支)`,
    global_prompt: source.global_prompt,
    created_at: now,
    updated_at: now,
    messages: source.messages.slice(0, idx + 1).map((m) => ({ ...m, id: _newId() })),
  };

  const db = await _openDb();
  const tx = db.transaction("sessions", "readwrite");
  tx.objectStore("sessions").put(forked);
  await _txDone(tx);
  return _toSessionSummary(forked);
}

export async function dbExportBundle(activeSessionId: string | null): Promise<ExportBundleV1> {
  const db = await _openDb();
  const tx = db.transaction(["agents", "sessions"] satisfies DbStoreName[], "readonly");
  const agents = await _getAll<Agent>(tx.objectStore("agents"));
  const sessions = await _getAll<StoredSession>(tx.objectStore("sessions"));
  await _txDone(tx);
  return {
    app: "agent-group",
    version: 1,
    exported_at: Date.now() / 1000,
    agents,
    sessions,
    active_session_id: activeSessionId,
  };
}

export async function dbImportBundle(bundle: ExportBundleV1): Promise<void> {
  if (bundle.app !== "agent-group" || bundle.version !== 1) {
    throw new Error("Unsupported import file");
  }
  const db = await _openDb();
  const tx = db.transaction(["agents", "sessions"] satisfies DbStoreName[], "readwrite");
  tx.objectStore("agents").clear();
  tx.objectStore("sessions").clear();
  for (const agent of bundle.agents) tx.objectStore("agents").put(agent);
  for (const session of bundle.sessions) tx.objectStore("sessions").put(session);
  await _txDone(tx);
}
