import type {
  AssistantMessage,
  AssistantSession,
  MediaAttachment,
} from '@client/store/appStoreTypes';
import { putAssistantSessionsRemote } from '@client/features/assistant/api/sessions';
import { isProjectAutosaveEnabled } from '@client/shared/utils/localStoragePrefs';
import { normalizeAssistantSessions } from './assistantValidation';

function sanitizeAssistantAttachment(a: MediaAttachment): MediaAttachment {
  const persistableUrl = (u?: string) => {
    if (!u || typeof u !== 'string') return undefined;
    if (u.startsWith('data:')) return undefined;
    if (u.startsWith('blob:')) return undefined;
    return u;
  };
  if (a.type === 'document') {
    const text = typeof a.extractedText === 'string' ? a.extractedText.slice(0, 80000) : undefined;
    return {
      type: 'document',
      name: a.name,
      size: a.size,
      mime: a.mime,
      extractedText: text,
      url: '',
      thumbnailUrl: undefined,
    };
  }
  const url = persistableUrl(a.url);
  const thumb = persistableUrl(a.thumbnailUrl);
  return {
    ...a,
    url: url || '',
    thumbnailUrl: thumb,
  };
}

export function sanitizeAssistantSessions(sessions: AssistantSession[]): AssistantSession[] {
  return (sessions || []).map((s) => ({
    ...s,
    messages: (s.messages || []).map((m) => ({
      ...m,
      attachments: m.attachments
        ?.map(sanitizeAssistantAttachment)
        .filter((a) =>
          (a.type === 'document' && Boolean(a.extractedText))
          || (a.type === 'video' && Boolean(a.url || a.thumbnailUrl))
          || (a.type === 'image' && Boolean(a.url))
        ),
    })),
  }));
}

let assistantPersistTimer: ReturnType<typeof setTimeout> | null = null;

export const assistantDeletedIds = new Set<string>();
const ASSISTANT_TOMBSTONE_KEY = 'ai_assistant_deleted_ids';

export function loadAssistantTombstones() {
  if (typeof window === 'undefined') return;
  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = globalThis[storageName];
      const raw = storage.getItem(ASSISTANT_TOMBSTONE_KEY);
      if (!raw) continue;
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach((id: unknown) => {
        if (typeof id === 'string' && id) assistantDeletedIds.add(id);
      });
    } catch {}
  }
}

function persistAssistantTombstones() {
  if (typeof window === 'undefined') return;
  const raw = JSON.stringify(Array.from(assistantDeletedIds).slice(-200));
  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      globalThis[storageName].setItem(ASSISTANT_TOMBSTONE_KEY, raw);
    } catch {}
  }
}

export function markAssistantSessionDeleted(id: string) {
  assistantDeletedIds.add(id);
  persistAssistantTombstones();
}

export function clearAssistantPersistTimer() {
  if (assistantPersistTimer) {
    clearTimeout(assistantPersistTimer);
    assistantPersistTimer = null;
  }
}

/** Explicit deletion still removes old cached history when automatic local saving is off. */
function removeDeletedAssistantSessionsFromLocalCache(currentId?: string) {
  try {
    const raw = localStorage.getItem('ai_assistant_sessions');
    if (!raw) return;
    const cached: unknown = JSON.parse(raw);
    if (!Array.isArray(cached)) return;
    const remaining = cached.filter((session) => !session || typeof session.id !== 'string' || !assistantDeletedIds.has(session.id));
    if (remaining.length === cached.length) return;
    localStorage.setItem('ai_assistant_sessions', JSON.stringify(remaining));
    const savedId = currentId && remaining.some((session) => session?.id === currentId)
      ? currentId : remaining.find((session) => typeof session?.id === 'string')?.id;
    if (savedId) localStorage.setItem('ai_assistant_current_session_id', savedId);
    else localStorage.removeItem('ai_assistant_current_session_id');
  } catch {}
}

export function writeAssistantLocalCache(
  sessions: AssistantSession[],
  currentId?: string,
  opts?: { force?: boolean }
) {
  if (typeof window === 'undefined') return;
  try {
    if (!isProjectAutosaveEnabled()) {
      if (opts?.force) removeDeletedAssistantSessionsFromLocalCache(currentId);
      return;
    }
  } catch {
    // Storage may be blocked by the browser; server persistence can still proceed.
    return;
  }
  const visible = sessions.filter((s) => !assistantDeletedIds.has(s.id));
  const selected = visible.find((s) => s.id === currentId);
  const lightweight = sanitizeAssistantSessions(visible);
  // An old selected thread must remain recoverable even beyond the cache's usual window.
  if (selected && !lightweight.some((s) => s.id === selected.id)) {
    lightweight.push(...sanitizeAssistantSessions([selected]));
  }
  const onlyEmpty =
    lightweight.length === 1 &&
    lightweight[0].title === '新对话' &&
    (!lightweight[0].messages || lightweight[0].messages.length === 0);
  if (onlyEmpty && !opts?.force) {
    try {
      const existing = localStorage.getItem('ai_assistant_sessions');
      if (existing) {
        const parsed = JSON.parse(existing);
        if (Array.isArray(parsed) && parsed.some((s: { messages?: unknown[] }) => Array.isArray(s.messages) && s.messages.length > 0)) {
          return;
        }
      }
    } catch {}
  }
  const prioritized = [...lightweight].sort((a, b) =>
    Number(b.id === currentId) - Number(a.id === currentId) || b.updatedAt - a.updatedAt);
  const compact = (count: number, messageCount: number) => prioritized.slice(0, count).map((s) => ({
    ...s,
    messages: s.messages.slice(-messageCount).map((m) => ({
      ...m,
      content: m.content.slice(-40000),
      thinking: undefined,
      // Preserve readable replies if a single oversized tool result exhausts the quota.
      items: m.items?.filter((item) => item.kind === 'agentMessage')
        .map((item) => ({ ...item, content: item.content.slice(-40000) })),
      toolActivity: undefined,
      productWidget: undefined,
      attachments: m.attachments?.map((a) => a.type === 'document'
        ? { ...a, extractedText: a.extractedText?.slice(0, 8000) } : a),
    })),
  }));
  for (const getCandidate of [() => lightweight, () => compact(5, 20), () => compact(1, 6)]) {
    try {
      const candidate = getCandidate();
      localStorage.setItem('ai_assistant_sessions', JSON.stringify(candidate));
      const savedId = candidate.some((s) => s.id === currentId) ? currentId : candidate[0]?.id;
      if (savedId) localStorage.setItem('ai_assistant_current_session_id', savedId);
      return;
    } catch (e: unknown) {
      const err = e as { name?: string; code?: number };
      if (err?.name !== 'QuotaExceededError' && err?.code !== 22 && err?.code !== 1014) return;
    }
  }
}

async function syncAssistantToServer(sessions: AssistantSession[], currentId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const lightweight = sanitizeAssistantSessions(sessions).filter((s) => !assistantDeletedIds.has(s.id));
    await putAssistantSessionsRemote(lightweight, currentId);
  } catch (err) {
    console.warn('[assistant] 同步服务端失败:', err);
  }
}

export function persistAssistantSessions(
  sessions: AssistantSession[],
  currentId?: string,
  opts?: { immediate?: boolean; forceLocal?: boolean }
) {
  if (typeof window === 'undefined') return;
  writeAssistantLocalCache(sessions, currentId, { force: opts?.forceLocal });

  const runSync = () => {
    assistantPersistTimer = null;
    void syncAssistantToServer(sessions, currentId);
  };

  if (opts?.immediate) {
    if (assistantPersistTimer) clearTimeout(assistantPersistTimer);
    assistantPersistTimer = null;
    runSync();
    return;
  }

  if (assistantPersistTimer) clearTimeout(assistantPersistTimer);
  assistantPersistTimer = setTimeout(runSync, 400);
}

export const getStoredAssistantState = () => {
  if (typeof window !== 'undefined') {
    loadAssistantTombstones();
    try {
      const saved = localStorage.getItem('ai_assistant_sessions');
      const savedId = localStorage.getItem('ai_assistant_current_session_id');
      if (saved) {
        const parsed = normalizeAssistantSessions(JSON.parse(saved)).filter((s) => !assistantDeletedIds.has(s.id));
        if (parsed.length > 0) {
          const currentId = savedId && parsed.some((s) => s.id === savedId) ? savedId : parsed[0].id;
          return { sessions: parsed, currentId };
        }
      }
    } catch {}
  }
  // A deleted ID is permanently tombstoned on the server, including legacy defaults.
  // A fresh local installation must not reuse that same fixed identifier.
  const defaultId = `asst-session-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  return {
    sessions: [
      {
        id: defaultId,
        title: '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [] as AssistantMessage[],
      }
    ],
    currentId: defaultId
  };
};
