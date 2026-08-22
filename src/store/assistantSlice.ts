import type { StateCreator } from 'zustand';
import type { AssistantSession } from '@/types/app-store';
import { setStoredMultimodalModelId } from '@/lib/workflowModels';
import { formatUserError } from '@/lib/upstreamErrors';
import {
  assistantDeletedIds,
  clearAssistantPersistTimer,
  getStoredAssistantState,
  loadAssistantTombstones,
  markAssistantSessionDeleted,
  persistAssistantSessions,
  writeAssistantLocalCache,
} from './persist';
import type { AppState, AssistantSlice } from './types';

const initialAsst = getStoredAssistantState();

let lastStreamPersistAt = 0;
let lastStreamPersistLen = 0;

export const createAssistantSlice: StateCreator<AppState, [], [], AssistantSlice> = (set, get) => ({
  // AI 助手初始状态与 Actions（勿在模块初始化时读 localStorage，避免 SSR/CSR 水合不一致）
  isAssistantOpen: false,
  assistantSessions: initialAsst.sessions,
  currentAssistantSessionId: initialAsst.currentId,
  assistantModel: 'gemini-3.7-flash',
  assistantHistoryLimit: 20,
  assistantAttachments: [],
  assistantInputDraft: '',

  setIsAssistantOpen: (isAssistantOpen) => set({ isAssistantOpen }),
  setAssistantInputDraft: (assistantInputDraft) => set({ assistantInputDraft }),
  setAssistantModel: (assistantModel) => {
    setStoredMultimodalModelId(assistantModel);
    set({ assistantModel });
  },
  setAssistantHistoryLimit: (assistantHistoryLimit) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ai_assistant_history_limit', String(assistantHistoryLimit));
      } catch {}
    }
    set({ assistantHistoryLimit });
  },

  createAssistantSession: () => set((state) => {
    const newId = `asst-session-${Date.now()}`;
    const newSession: AssistantSession = {
      id: newId,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    const updatedSessions = [newSession, ...state.assistantSessions];
    persistAssistantSessions(updatedSessions, newId);
    return {
      assistantSessions: updatedSessions,
      currentAssistantSessionId: newId,
      assistantAttachments: []
    };
  }),

  switchAssistantSession: (id) => {
    const state = get();
    persistAssistantSessions(state.assistantSessions, id);
    set({ currentAssistantSessionId: id, assistantAttachments: [] });
  },

  deleteAssistantSession: async (id) => {
    clearAssistantPersistTimer();

    markAssistantSessionDeleted(id);

    let serverOk = true;
    let serverError: string | undefined;
    if (typeof window !== 'undefined') {
      try {
        const { apiFetch } = await import('@/lib/apiClient');
        const res = await apiFetch(`/api/assistant/sessions?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          serverOk = false;
          serverError = data.error || `删除失败 (HTTP ${res.status})`;
        }
      } catch (e: any) {
        serverOk = false;
        serverError = formatUserError(e, '删除请求失败');
      }
    }

    const state = get();
    const filtered = state.assistantSessions.filter(s => s.id !== id && !assistantDeletedIds.has(s.id));
    const nextSession = filtered[0] || {
      id: `asst-session-${Date.now()}`,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    const finalSessions = filtered.length > 0 ? filtered : [nextSession];
    // 删除后强制写本地，避免「空新对话不覆盖」把旧会话留在 localStorage
    persistAssistantSessions(finalSessions, nextSession.id, { immediate: true, forceLocal: true });
    set({
      assistantSessions: finalSessions,
      currentAssistantSessionId: nextSession.id
    });

    return { success: serverOk, error: serverError };
  },

  renameAssistantSession: (id, title) => set((state) => {
    const updated = state.assistantSessions.map(s =>
      s.id === id ? { ...s, title: title.trim() || '未命名对话', updatedAt: Date.now() } : s
    );
    persistAssistantSessions(updated, state.currentAssistantSessionId);
    return { assistantSessions: updated };
  }),

  addAssistantMessage: (sessionId, message) => set((state) => {
    const updated = state.assistantSessions.map(s => {
      if (s.id === sessionId) {
        const msgs = [...s.messages, message].slice(-100);
        let title = s.title;
        if (title === '新对话' && message.role === 'user' && message.content) {
          title = message.content.slice(0, 16);
        }
        return {
          ...s,
          title,
          updatedAt: Date.now(),
          messages: msgs
        };
      }
      return s;
    });
    persistAssistantSessions(updated, state.currentAssistantSessionId);
    return { assistantSessions: updated };
  }),

  updateAssistantMessage: (sessionId, messageId, updates) => set((state) => {
    const updated = state.assistantSessions.map(s => {
      if (s.id === sessionId) {
        const msgs = s.messages.map(m =>
          m.id === messageId ? { ...m, ...updates } : m
        );
        return { ...s, updatedAt: Date.now(), messages: msgs };
      }
      return s;
    });

    // 流式节流落盘：每 2s 或内容增长约 800 字
    const msg = updated
      .find(s => s.id === sessionId)
      ?.messages.find(m => m.id === messageId);
    const contentLen = msg?.content?.length || 0;
    const now = Date.now();
    const dueByTime = now - lastStreamPersistAt >= 2000;
    const dueByLen = contentLen - lastStreamPersistLen >= 800;
    if (dueByTime || dueByLen) {
      lastStreamPersistAt = now;
      lastStreamPersistLen = contentLen;
      persistAssistantSessions(updated, state.currentAssistantSessionId);
    }

    return { assistantSessions: updated };
  }),

  persistAssistantNow: () => {
    const state = get();
    lastStreamPersistAt = Date.now();
    persistAssistantSessions(state.assistantSessions, state.currentAssistantSessionId, { immediate: true });
  },

  hydrateAssistantSessions: async () => {
    if (typeof window === 'undefined') return;
    loadAssistantTombstones();
    let remoteSessions: AssistantSession[] | null = null;
    try {
      const { apiFetch } = await import('@/lib/apiClient');
      const res = await apiFetch('/api/assistant/sessions');
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success && Array.isArray(data.sessions) && data.sessions.length > 0) {
          remoteSessions = data.sessions
            .filter((s: any) => s?.id && !assistantDeletedIds.has(s.id))
            .map((s: any) => ({
              id: s.id,
              title: s.title || '新对话',
              createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
              updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
              messages: Array.isArray(s.messages) ? s.messages : [],
            }));
        }
      }
    } catch {}

    const local = getStoredAssistantState();
    const localSessions = local.sessions.filter(s => !assistantDeletedIds.has(s.id));
    const localHasMsgs = localSessions.some(s => (s.messages || []).length > 0);
    const remoteHasMsgs = remoteSessions?.some(s => (s.messages || []).length > 0);

    let nextSessions = localSessions.length > 0 ? localSessions : local.sessions.filter(s => !assistantDeletedIds.has(s.id));
    let nextId = local.currentId;
    if (assistantDeletedIds.has(nextId) || !nextSessions.some(s => s.id === nextId)) {
      nextId = nextSessions[0]?.id || local.currentId;
    }

    if (remoteSessions && remoteHasMsgs) {
      const byId = new Map<string, AssistantSession>();
      for (const s of localSessions) {
        if (!assistantDeletedIds.has(s.id)) byId.set(s.id, s);
      }
      for (const r of remoteSessions) {
        if (assistantDeletedIds.has(r.id)) continue;
        const localS = byId.get(r.id);
        if (!localS) {
          byId.set(r.id, r);
          continue;
        }
        const localTs = Number(localS.updatedAt) || 0;
        const remoteTs = Number(r.updatedAt) || 0;
        const localMsgN = (localS.messages || []).length;
        const remoteMsgN = (r.messages || []).length;
        if (remoteTs > localTs || (remoteTs === localTs && remoteMsgN > localMsgN)) {
          byId.set(r.id, r);
        }
      }
      nextSessions = Array.from(byId.values()).sort(
        (a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0)
      );
      const savedId = localStorage.getItem('ai_assistant_current_session_id');
      nextId = (savedId && nextSessions.some(s => s.id === savedId) && !assistantDeletedIds.has(savedId))
        ? savedId
        : (nextSessions[0]?.id || local.currentId);
      persistAssistantSessions(nextSessions, nextId, { immediate: true, forceLocal: true });
    } else if (localHasMsgs) {
      nextSessions = localSessions;
      nextId = nextSessions.some(s => s.id === local.currentId)
        ? local.currentId
        : (nextSessions[0]?.id || local.currentId);
      persistAssistantSessions(nextSessions, nextId, { immediate: true, forceLocal: true });
    }

    if (nextSessions.length === 0) {
      const emptyId = `asst-session-${Date.now()}`;
      nextSessions = [{
        id: emptyId,
        title: '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      }];
      nextId = emptyId;
      persistAssistantSessions(nextSessions, nextId, { immediate: true, forceLocal: true });
    }

    set({
      assistantSessions: nextSessions,
      currentAssistantSessionId: nextId,
    });
    writeAssistantLocalCache(nextSessions, nextId, { force: true });
  },

  setAssistantAttachments: (attachments) => set({ assistantAttachments: attachments }),

  addAssistantAttachment: (att) => set((state) => {
    if (att.url && state.assistantAttachments.some(a => a.url === att.url)) {
      return state;
    }
    if (att.type === 'document' && att.name && att.extractedText
      && state.assistantAttachments.some(a => a.type === 'document' && a.name === att.name && a.extractedText === att.extractedText)) {
      return state;
    }
    return { assistantAttachments: [...state.assistantAttachments, att] };
  }),

  removeAssistantAttachment: (index) => set((state) => ({
    assistantAttachments: state.assistantAttachments.filter((_, i) => i !== index)
  })),

  clearAssistantAttachments: () => set({ assistantAttachments: [] }),
});
