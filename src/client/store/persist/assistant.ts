import type {
  AssistantMessage,
  AssistantSession,
  MediaAttachment,
} from '@client/store/appStoreTypes';
import { putAssistantSessionsRemote } from '@client/features/assistant/api/sessions';
import { isProjectAutosaveEnabled } from '@client/shared/utils/localStoragePrefs';

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
  return (sessions || []).filter((s, index) => index < 30 || s.updatedAt > Date.now() - 7 * 86400000).map((s) => ({
    ...s,
    messages: (s.messages || []).filter((m, index, all) => index >= all.length - 80 || m.timestamp > Date.now() - 7 * 86400000).map((m) => ({
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
  try {
    const raw = sessionStorage.getItem(ASSISTANT_TOMBSTONE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) arr.forEach((id: string) => id && assistantDeletedIds.add(id));
  } catch {}
}

function persistAssistantTombstones() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(ASSISTANT_TOMBSTONE_KEY, JSON.stringify(Array.from(assistantDeletedIds).slice(-80)));
  } catch {}
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

export function writeAssistantLocalCache(
  sessions: AssistantSession[],
  currentId?: string,
  opts?: { force?: boolean }
) {
  if (typeof window === 'undefined') return;
  if (!isProjectAutosaveEnabled() && !opts?.force) return;
  const lightweight = sanitizeAssistantSessions(sessions);
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
  try {
    localStorage.setItem('ai_assistant_sessions', JSON.stringify(lightweight));
    if (currentId) localStorage.setItem('ai_assistant_current_session_id', currentId);
  } catch (e: unknown) {
    const err = e as { name?: string; code?: number };
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      try {
        const tiny = lightweight.slice(0, 5).map((s) => ({
          ...s,
          messages: (s.messages || []).slice(-20).map((m) => ({
            ...m,
            attachments: m.attachments,
          })),
        }));
        localStorage.setItem('ai_assistant_sessions', JSON.stringify(tiny));
      } catch {}
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
    try {
      const saved = localStorage.getItem('ai_assistant_sessions');
      const savedId = localStorage.getItem('ai_assistant_current_session_id');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const currentId = savedId && parsed.some((s: { id: string }) => s.id === savedId) ? savedId : parsed[0].id;
          return { sessions: parsed as AssistantSession[], currentId };
        }
      }
    } catch {}
  }
  const defaultId = 'asst-session-default';
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
