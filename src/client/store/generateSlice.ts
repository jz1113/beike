/** 生图会话与进行中任务：UI 草稿 + 本地缓存；服务端列表由 TanStack Query 持有 */
import type { StateCreator } from 'zustand';
import type { ChatSession, GenerationTask } from '@client/store/appStoreTypes';
import {
  getStoredDrawingSessions,
  markGenerationDeleted,
  markSessionDeleted,
  persistDrawingStateToStorage,
  isDrawingHistoryReady,
} from './persist/index';
import { deferDrawingMutation } from './persist/generationHydration';
import type { AppState, GenerateSlice } from '@client/store/types';
import {
  capGenerationTasks,
  pruneEmptySessions,
  resolveSessionsAfterDelete,
  collectSessionDeletion,
  omitDeletedGenerationTasks,
  deriveSessionTitleFromTasks,
  syncTasksWithDatabase,
  filterOutDeletedGenerations,
  EMPTY_COMPOSER_MEDIA,
  createBatchGenerationTasksPayload,
} from './generateSliceHelpers';

let lastReplyPersistAt = 0;

const initialDrawing = getStoredDrawingSessions();
const sanitizedInitialSessions = (initialDrawing.sessions || []).map((session) => {
  const isDefaultTitle = !session.title || session.title === '新创作对话' || session.title === '未命名对话';
  if (isDefaultTitle && session.tasks && session.tasks.length > 0) {
    return {
      ...session,
      title: deriveSessionTitleFromTasks(session.tasks, session.title || '新创作对话'),
    };
  }
  return session;
});
const initialPrunedSessions = sanitizedInitialSessions.length > 0
  ? pruneEmptySessions(sanitizedInitialSessions, initialDrawing.currentId)
  : sanitizedInitialSessions;
const initialCurrentId = initialPrunedSessions.some(s => s.id === initialDrawing.currentId)
  ? initialDrawing.currentId
  : initialPrunedSessions[0]?.id || 'session-default';

export const createGenerateSlice: StateCreator<AppState, [], [], GenerateSlice> = (set, get) => {
  const setDrawing = (update: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => {
    if (get().generationHistoryReady === false) deferDrawingMutation(() => set(update));
    else set(update);
  };
  return ({
  generationHistoryReady: isDrawingHistoryReady(),
  sessions: initialPrunedSessions,
  currentSessionId: initialCurrentId,
  previewTask: null,
  previewQueue: [],
  generationTasks: initialDrawing.tasks,

  createSession: () => setDrawing((state) => {
    const prunedSessions = pruneEmptySessions(state.sessions, state.currentSessionId);
    const current = prunedSessions.find(s => s.id === state.currentSessionId);
    if (current && (!current.tasks || current.tasks.length === 0)) {
      if (prunedSessions.length !== state.sessions.length) {
        persistDrawingStateToStorage(undefined, prunedSessions, current.id);
        return { sessions: prunedSessions, currentSessionId: current.id, ...EMPTY_COMPOSER_MEDIA };
      }
      return { currentSessionId: current.id, ...EMPTY_COMPOSER_MEDIA };
    }

    const existingEmpty = prunedSessions.find(s => !s.tasks || s.tasks.length === 0);
    if (existingEmpty) {
      persistDrawingStateToStorage(undefined, prunedSessions, existingEmpty.id);
      return { sessions: prunedSessions, currentSessionId: existingEmpty.id, ...EMPTY_COMPOSER_MEDIA };
    }

    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: '新创作对话',
      createdAt: Date.now(),
      tasks: []
    };
    const updatedSessions = [newSession, ...prunedSessions];
    persistDrawingStateToStorage(undefined, updatedSessions, newSessionId);
    return { sessions: updatedSessions, currentSessionId: newSessionId, ...EMPTY_COMPOSER_MEDIA };
  }),

  switchSession: (id) => setDrawing((state) => {
    const prunedSessions = pruneEmptySessions(state.sessions, id);
    persistDrawingStateToStorage(undefined, prunedSessions.length !== state.sessions.length ? prunedSessions : undefined, id);
    return {
      ...(prunedSessions.length !== state.sessions.length ? { sessions: prunedSessions } : {}),
      currentSessionId: id
    };
  }),

  deleteSession: (id) => setDrawing((state) => {
    const { ids, urls } = collectSessionDeletion(state.sessions, state.generationTasks, id);
    markSessionDeleted(id);
    markGenerationDeleted(ids, urls);
    const updatedGenTasks = omitDeletedGenerationTasks(state.generationTasks, id, ids, urls);
    const wasCurrent = state.currentSessionId === id;
    const resolved = resolveSessionsAfterDelete(
      state.sessions.filter((session) => session.id !== id),
      wasCurrent,
      state.currentSessionId,
    );
    const nextSessions = resolved.sessions;
    const nextSessionId = resolved.currentSessionId;

    persistDrawingStateToStorage(updatedGenTasks, nextSessions, nextSessionId, { immediate: true, force: true });

    return {
      sessions: nextSessions,
      currentSessionId: nextSessionId,
      generationTasks: updatedGenTasks,
      previewTask: wasCurrent ? null : state.previewTask,
      previewQueue: wasCurrent ? [] : state.previewQueue,
      ...(wasCurrent ? EMPTY_COMPOSER_MEDIA : {}),
    };
  }),

  deleteAllSessions: () => setDrawing(() => {
    const emptySessionId = 'session-default';
    persistDrawingStateToStorage(undefined, [], emptySessionId, { force: true });
    return {
      sessions: [],
      currentSessionId: emptySessionId,
      previewTask: null,
      previewQueue: [],
    };
  }),

  renameSession: (id, newTitle) => setDrawing((state) => {
    const trimmed = newTitle.trim() || '未命名对话';
    const updated = state.sessions.map(s => s.id === id ? {
      ...s,
      title: trimmed,
      tasks: s.tasks.map(t => ({ ...t, sessionTitle: trimmed }))
    } : s);
    const updatedGenTasks = state.generationTasks.map(t => t.sessionId === id ? { ...t, sessionTitle: trimmed } : t);
    persistDrawingStateToStorage(updatedGenTasks, updated);
    return { sessions: updated, generationTasks: updatedGenTasks };
  }),

  pinSession: (id) => setDrawing((state) => {
    const updated = state.sessions.map(s => s.id === id ? { ...s, isPinned: !s.isPinned } : s);
    // 置顶项排在最前面
    updated.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });
    persistDrawingStateToStorage(undefined, updated);
    return { sessions: updated };
  }),

  renameTask: (taskId, newTitle) => setDrawing((state) => {
    const updatedGenTasks = state.generationTasks.map(t => t.id === taskId ? { ...t, title: newTitle } : t);
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.map(t => t.id === taskId ? { ...t, title: newTitle } : t)
    }));
    persistDrawingStateToStorage(updatedGenTasks, updatedSessions);
    return {
      generationTasks: updatedGenTasks,
      sessions: updatedSessions,
      previewTask: state.previewTask?.id === taskId ? { ...state.previewTask, title: newTitle } : state.previewTask
    };
  }),

  setPreviewTask: (previewTask, queue) => setDrawing((state) => ({
    previewTask,
    previewQueue: queue !== undefined ? queue : (previewTask === null ? [] : state.previewQueue)
  })),
  setPreviewQueue: (previewQueue) => setDrawing({ previewQueue }),

  addGenerationTask: (task, isNewSession = false) => setDrawing((state) => {
    let sessions = pruneEmptySessions(state.sessions, state.currentSessionId);
    let targetSessionId = state.currentSessionId;
    let currentSessionTitle = deriveSessionTitleFromTasks([task], task.mediaType === 'video' ? '智能视频创作' : 'AI 生图创作');

    const matched = sessions.find(s => s.id === targetSessionId);
    const reuseEmpty = Boolean(matched && (!matched.tasks || matched.tasks.length === 0));
    const shouldCreateNew = !reuseEmpty && (isNewSession || targetSessionId === '__all__' || !matched);

    if (shouldCreateNew) {
      targetSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    } else if (matched && matched.tasks && matched.tasks.length > 0 && matched.title && matched.title !== '新创作对话' && matched.title !== '未命名对话') {
      currentSessionTitle = matched.title;
    }

    const taskWithSession: GenerationTask = {
      ...task,
      sessionId: task.sessionId || targetSessionId,
      sessionTitle: task.sessionTitle || currentSessionTitle
    };

    const updatedGenTasks = capGenerationTasks([taskWithSession, ...state.generationTasks.filter(g => g.id !== taskWithSession.id && (!taskWithSession.taskId || g.taskId !== taskWithSession.taskId))]);

    if (shouldCreateNew) {
      const newSession: ChatSession = {
        id: targetSessionId,
        title: currentSessionTitle,
        createdAt: Date.now(),
        tasks: [taskWithSession]
      };
      sessions = [newSession, ...sessions];
    } else {
      sessions = sessions.map(s => {
        if (s.id === targetSessionId) {
          const isDefaultTitle = !s.title || s.title === '新创作对话' || s.title === '未命名对话';
          return {
            ...s,
            title: (!s.tasks || s.tasks.length === 0 || isDefaultTitle) ? currentSessionTitle : s.title,
            tasks: [taskWithSession, ...(s.tasks || []).filter(t => t.id !== taskWithSession.id && (!taskWithSession.taskId || t.taskId !== taskWithSession.taskId))]
          };
        }
        return s;
      });
    }

    persistDrawingStateToStorage(updatedGenTasks, sessions, targetSessionId);

    return {
      generationTasks: updatedGenTasks,
      sessions,
      currentSessionId: targetSessionId
    };
  }),

  addBatchGenerationTasks: (tasks, customTitle, isNewSession = true) => setDrawing((state) => {
    const { updatedGenTasks, sessions, targetSessionId } = createBatchGenerationTasksPayload(
      tasks,
      customTitle,
      isNewSession,
      state
    );
    persistDrawingStateToStorage(updatedGenTasks, sessions, targetSessionId);

    return {
      generationTasks: updatedGenTasks,
      sessions,
      currentSessionId: targetSessionId
    };
  }),

  updateGenerationTask: (id, updates, opts) => setDrawing((state) => {
    const matches = (task: GenerationTask) => task.id === id || task.taskId === id;
    const current = state.generationTasks.find(matches) || state.sessions.flatMap(session => session.tasks).find(matches);
    // A late timeout/failure cannot downgrade a completed task. Retry creates a new task.
    if (current?.status === 'SUCCESS' && current.resultUrl && updates.status && updates.status !== 'SUCCESS') return state;
    let updatedGenTasks = state.generationTasks.map(g => matches(g) ? { ...g, ...updates } : g);
    if (current && !state.generationTasks.some(matches) && updates.status === 'IN_PROGRESS') {
      updatedGenTasks = capGenerationTasks([{ ...current, ...updates }, ...updatedGenTasks]);
    }
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.map(g => (g.id === id || g.taskId === id) ? { ...g, ...updates } : g)
    }));

    const shouldPersist = opts?.persist !== false;
    const isTerminal = updates.status === 'SUCCESS' || updates.status === 'FAILURE';
    const linked = Boolean(updates.taskId && updates.taskId !== current?.taskId) || Boolean(updates.dbId && updates.dbId !== current?.dbId);
    const statusChanged = Boolean(updates.status && updates.status !== current?.status);
    const recoveryChanged = updates.submissionRecoveryRequired !== undefined && updates.submissionRecoveryRequired !== current?.submissionRecoveryRequired;
    const nextReply = updates.agentTurn?.reply?.trim() || '';
    const previousReply = current?.agentTurn?.reply?.trim() || '';
    const now = Date.now();
    const replyDue = Boolean(nextReply) && nextReply !== previousReply && (!previousReply || now - lastReplyPersistAt >= 1000);
    if (shouldPersist && (isTerminal || linked || statusChanged || recoveryChanged || replyDue)) {
      if (replyDue) lastReplyPersistAt = now;
      persistDrawingStateToStorage(updatedGenTasks, updatedSessions, undefined, { immediate: linked || isTerminal || recoveryChanged || replyDue });
    }
    if (shouldPersist && isTerminal) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('azhuo:generation-completed', { detail: { id, updates } }));
      }
    }

    return {
      generationTasks: updatedGenTasks,
      sessions: updatedSessions,
      previewTask: (state.previewTask && (state.previewTask.id === id || state.previewTask.taskId === id))
        ? ({ ...state.previewTask, ...updates } as GenerationTask)
        : state.previewTask
    };
  }),

  // 🌟 删除对话中的单项记录（仅从会话与当前对话流中移除，绝不删除数据库/资产库中的实体）
  deleteGenerationTask: (id) => setDrawing((state) => {
    const updatedGenTasks = state.generationTasks.filter(g => g.id !== id && g.taskId !== id);
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.filter(g => g.id !== id && g.taskId !== id)
    }));

    persistDrawingStateToStorage(updatedGenTasks, updatedSessions);

    return {
      generationTasks: updatedGenTasks,
      sessions: updatedSessions,
      previewTask: (state.previewTask?.id === id || state.previewTask?.taskId === id) ? null : state.previewTask
    };
  }),

  // 🌟 彻底物理删除生成记录 (同步清理本地会话、全局生成历史与 localStorage 缓存)
  deleteGenerationPermanently: (ids: string[], urls?: string[]) => setDrawing((state) => {
    const idSet = new Set((ids || []).filter(Boolean));
    const urlSet = new Set((urls || []).filter(Boolean));

    markGenerationDeleted(Array.from(idSet), Array.from(urlSet));

    const { generationTasks: updatedGenTasks, sessions: updatedSessions } = filterOutDeletedGenerations(
      state.generationTasks,
      state.sessions,
      idSet,
      urlSet,
    );

    persistDrawingStateToStorage(updatedGenTasks, updatedSessions);

    const isPreviewDeleted = state.previewTask && (
      idSet.has(state.previewTask.id) ||
      (state.previewTask.taskId && idSet.has(state.previewTask.taskId)) ||
      (state.previewTask.resultUrl && urlSet.has(state.previewTask.resultUrl))
    );

    return {
      generationTasks: updatedGenTasks,
      sessions: updatedSessions,
      previewTask: isPreviewDeleted ? null : state.previewTask
    };
  }),

  syncDatabaseTasks: (dbTasks) => setDrawing((state) => {
    const { generationTasks, sessions } = syncTasksWithDatabase(state.generationTasks, state.sessions, dbTasks);
    return { generationTasks, sessions };
  }),
  });
};
