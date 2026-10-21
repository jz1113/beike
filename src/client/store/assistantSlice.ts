import type { StateCreator } from 'zustand';
import type { AssistantSession, MediaAttachment } from '@client/store/appStoreTypes';
import { deleteAssistantSessionRemote, fetchAssistantSessionsRemote } from '@client/shared/api/assistantSessions';
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
import { normalizeAssistantSessions } from './persist/assistantValidation';

function createEmptySession(): AssistantSession {
  const now = Date.now();
  return {
    id: `asst-session-${globalThis.crypto?.randomUUID?.() || `${now}-${Math.random().toString(36).slice(2)}`}`,
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function getStoredHistoryLimit(): number {
  try {
    const limit = Number(localStorage.getItem('ai_assistant_history_limit'));
    if (Number.isInteger(limit) && limit >= 1 && limit <= 500) return limit;
  } catch {}
  return 20;
}

export const createAssistantSlice: StateCreator<AppState, [], [], AssistantSlice> = (set, get) => {
  const initial = getStoredAssistantState();
  const drafts = new Map<string, { input: string; attachments: MediaAttachment[]; skillId: string | null }>();
  const rememberDraft = (state: AppState) => drafts.set(state.currentAssistantSessionId, {
    input: state.assistantInputDraft,
    attachments: state.assistantAttachments,
    skillId: state.activeAssistantSkillId,
  });
  const restoreDraft = (id: string) => {
    const draft = drafts.get(id);
    const skillId = draft?.skillId;
    return {
      assistantInputDraft: draft?.input || get().assistantSessionDrafts[id] || '',
      assistantAttachments: draft?.attachments || [],
      activeAssistantSkillId: skillId && get().getAllAssistantSkills().some((skill) => skill.id === skillId) ? skillId : null,
    };
  };
  let lastStreamPersistAt = 0;
  let lastStreamPersistLen = 0;
  let lastStreamMessageId = '';
  let hydrationPromise: Promise<void> | null = null;

  const getInitialAssistantModel = (): string => {
    if (typeof window === 'undefined') return 'gemini-3.7-flash';
    try {
      const saved = localStorage.getItem('beike_assistant_selected_model') || localStorage.getItem('ai_assistant_model');
      if (saved) return saved;
      const prefRaw = localStorage.getItem('beike_prompt_bar_preferences_v1');
      if (prefRaw) {
        const parsed = JSON.parse(prefRaw);
        if (parsed?.reasoning?.modelId) return parsed.reasoning.modelId;
      }
    } catch {
      // ignore
    }
    return 'gemini-3.7-flash';
  };

  return {
    isAssistantOpen: false,
    assistantSessions: initial.sessions,
    currentAssistantSessionId: initial.currentId,
    assistantModel: getInitialAssistantModel(),
    assistantHistoryLimit: getStoredHistoryLimit(),
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
      if (!Number.isFinite(assistantHistoryLimit)) return;
      assistantHistoryLimit = Math.max(1, Math.min(500, Math.trunc(assistantHistoryLimit)));
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('ai_assistant_history_limit', String(assistantHistoryLimit));
        } catch {}
      }
      set({ assistantHistoryLimit });
    },

    createAssistantSession: () => set((state) => {
      rememberDraft(state);
      const newSession = createEmptySession();
      const newId = newSession.id;
      const updatedSessions = [newSession, ...state.assistantSessions];
      persistAssistantSessions(updatedSessions, newId);
      return {
        assistantSessions: updatedSessions,
        currentAssistantSessionId: newId,
        ...restoreDraft(newId),
        assistantSessionDrafts: { ...state.assistantSessionDrafts, [state.currentAssistantSessionId]: state.assistantInputDraft },
      };
    }),

    switchAssistantSession: (id) => {
      const state = get();
      if (id === state.currentAssistantSessionId || !state.assistantSessions.some((s) => s.id === id)) return;
      rememberDraft(state);
      persistAssistantSessions(state.assistantSessions, id);
      set({ currentAssistantSessionId: id, ...restoreDraft(id),
        assistantSessionDrafts: { ...state.assistantSessionDrafts, [state.currentAssistantSessionId]: state.assistantInputDraft } });
    },

    deleteAssistantSession: async (id) => {
      const state = get();
      if (!state.assistantSessions.some((s) => s.id === id)) return { success: true };
      clearAssistantPersistTimer();
      markAssistantSessionDeleted(id);
      drafts.delete(id);
      const assistantSessionDrafts = { ...state.assistantSessionDrafts };
      delete assistantSessionDrafts[id];
      const filtered = state.assistantSessions.filter(s => s.id !== id && !assistantDeletedIds.has(s.id));
      const nextSession = filtered.find((s) => s.id === state.currentAssistantSessionId) || filtered[0] || createEmptySession();
      const finalSessions = filtered.length > 0 ? filtered : [nextSession];
      // 删除后强制写本地，避免「空新对话不覆盖」把旧会话留在 localStorage
      persistAssistantSessions(finalSessions, nextSession.id, { immediate: true, forceLocal: true });
      set({
        assistantSessionDrafts,
        assistantSessions: finalSessions,
        currentAssistantSessionId: nextSession.id,
        ...(state.currentAssistantSessionId === id ? restoreDraft(nextSession.id) : {}),
      });
      return typeof window !== 'undefined' ? deleteAssistantSessionRemote(id) : { success: true };
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
          const msgs = [...s.messages.filter((m) => m.id !== message.id), message];
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
      const streamMessageId = `${sessionId}:${messageId}`;
      const dueByLen = contentLen - lastStreamPersistLen >= 800;
      if (dueByTime || dueByLen || streamMessageId !== lastStreamMessageId) {
        lastStreamPersistAt = now;
        lastStreamPersistLen = contentLen;
        lastStreamMessageId = streamMessageId;
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
      if (hydrationPromise) return hydrationPromise;
      hydrationPromise = (async () => {
        loadAssistantTombstones();
        const baseline = new Map(get().assistantSessions.map((s) => [s.id, s]));
        let remoteSessions: AssistantSession[] = [];
        try {
          remoteSessions = normalizeAssistantSessions(await fetchAssistantSessionsRemote());
        } catch {}

        // Read live state after the request: sending, renaming, switching and deleting
        // are allowed while remote history loads and must win over that older snapshot.
        const state = get();
        const byId = new Map(state.assistantSessions.filter((s) => !assistantDeletedIds.has(s.id)).map((s) => [s.id, s]));
        for (const remote of remoteSessions) {
          if (assistantDeletedIds.has(remote.id)) continue;
          const local = byId.get(remote.id);
          const changedDuringLoad = local && baseline.get(local.id) !== local;
          if (!local || (!changedDuringLoad && (remote.updatedAt > local.updatedAt
            || (remote.updatedAt === local.updatedAt && remote.messages.length > local.messages.length)))) {
            byId.set(remote.id, { ...remote, allowedTools: remote.allowedTools ?? local?.allowedTools });
          }
        }
        const placeholder = byId.get('asst-session-default');
        if (byId.size > 1 && placeholder?.title === '新对话' && !placeholder.messages.length
          && (state.currentAssistantSessionId !== placeholder.id
            || (!state.assistantInputDraft && !state.assistantAttachments.length && !state.activeAssistantSkillId))) {
          byId.delete(placeholder.id);
        }
        const nextSessions = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
        if (!nextSessions.length) nextSessions.push(createEmptySession());
        const nextId = nextSessions.some((s) => s.id === state.currentAssistantSessionId)
          ? state.currentAssistantSessionId : nextSessions[0].id;
        set({
          assistantSessions: nextSessions,
          currentAssistantSessionId: nextId,
          ...(nextId !== state.currentAssistantSessionId ? restoreDraft(nextId) : {}),
        });
        // Recovery reads server state; echoing it back would rewrite every timestamp.
        writeAssistantLocalCache(nextSessions, nextId);
      })();
      try {
        await hydrationPromise;
      } finally {
        hydrationPromise = null;
      }
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
  };
};
