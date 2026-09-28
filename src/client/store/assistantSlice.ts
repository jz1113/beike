import type { StateCreator } from 'zustand';
import type { AssistantSession } from '@client/store/appStoreTypes';
import { deleteAssistantSessionRemote, fetchAssistantSessionsRemote } from '@client/features/assistant/api/sessions';
import {
  assistantDeletedIds,
  clearAssistantPersistTimer,
  getStoredAssistantState,
  loadAssistantTombstones,
  markAssistantSessionDeleted,
  persistAssistantSessions,
  writeAssistantLocalCache,
} from './persist/index';
import type { AppState, AssistantSlice } from '@client/store/types';

const defaultAssistantId = 'asst-session-default';

let lastStreamPersistAt = 0;
let lastStreamPersistLen = 0;

export const createAssistantSlice: StateCreator<AppState, [], [], AssistantSlice> = (set, get) => ({
  // AI 助手初始状态（会话由 requestIdleCallback 延迟 hydrate）
  isAssistantOpen: false,
  assistantSessions: [
    {
      id: defaultAssistantId,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    },
  ],
  currentAssistantSessionId: defaultAssistantId,
  assistantModel: 'gemini-3.7-flash',
  assistantHistoryLimit: 20,
  assistantAttachments: [],
  assistantInputDraft: '',
  assistantSessionDrafts: {},

  setIsAssistantOpen: (isAssistantOpen) => set({ isAssistantOpen }),
  setAssistantInputDraft: (assistantInputDraft) => {
    if (get().assistantInputDraft === assistantInputDraft) return;
    set({ assistantInputDraft });
  },
  setAssistantModel: (assistantModel) => {
    if (get().assistantModel === assistantModel) return;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('beike_assistant_selected_model', assistantModel); localStorage.setItem('ai_assistant_model', assistantModel); } catch { /* Model selection still works without storage. */ }
    }
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
    const newId = `asst-session-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
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
      assistantInputDraft: '',
      assistantSessionDrafts: { ...state.assistantSessionDrafts, [state.currentAssistantSessionId]: state.assistantInputDraft },
      activeAssistantSkillId: null,
      assistantAttachments: []
    };
  }),

  switchAssistantSession: (id) => {
    const state = get();
    if (id === state.currentAssistantSessionId || !state.assistantSessions.some(session => session.id === id)) return;
    persistAssistantSessions(state.assistantSessions, id);
    set({ currentAssistantSessionId: id, assistantAttachments: [],
      assistantInputDraft: state.assistantSessionDrafts[id] || '',
      assistantSessionDrafts: { ...state.assistantSessionDrafts, [state.currentAssistantSessionId]: state.assistantInputDraft },
      ...(id !== state.currentAssistantSessionId ? { activeAssistantSkillId: null } : {}),
    });
  },

  deleteAssistantSession: async (id) => {
    clearAssistantPersistTimer();

    markAssistantSessionDeleted(id);

    let serverOk = true;
    let serverError: string | undefined;
    if (typeof window !== 'undefined') {
      const remote = await deleteAssistantSessionRemote(id);
      serverOk = remote.success;
      serverError = remote.error;
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
      currentAssistantSessionId: nextSession.id,
      activeAssistantSkillId: null,
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

  updateAssistantSession: (sessionUpdate) => set((state) => {
    const updated = state.assistantSessions.map(s =>
      s.id === sessionUpdate.id ? { ...s, ...sessionUpdate, updatedAt: Date.now() } : s
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
      const sessions = await fetchAssistantSessionsRemote();
      if (sessions && sessions.length > 0) {
        remoteSessions = sessions
          .filter((s) => s?.id && !assistantDeletedIds.has(s.id))
          .map((s) => ({
            id: s.id,
            title: s.title || '新对话',
            createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
            updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
            messages: Array.isArray(s.messages) ? s.messages : [],
          }));
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
