/** 生图会话与进行中任务：UI 草稿 + 本地缓存；服务端列表由 TanStack Query 持有 */
import type { StateCreator } from 'zustand';
import type { ChatSession, GenerationTask } from '@client/store/appStoreTypes';
import {
  getStoredDrawingSessions,
  isGenerationDeleted,
  markGenerationDeleted,
  persistDrawingStateToStorage,
  isDrawingHistoryReady,
} from './persist/index';
import { retainGenerationTasks } from './generationLimits';
import { deferDrawingMutation } from './persist/generationHydration';
import type { AppState, GenerateSlice } from '@client/store/types';

function capGenerationTasks(tasks: GenerationTask[]): GenerationTask[] {
  return retainGenerationTasks(tasks);
}

function mergeAndSortTasks(existing: GenerationTask[], incoming: GenerationTask[]): GenerationTask[] {
  const mergedList: GenerationTask[] = [];
  const idMap = new Map<string, number>();
  const taskIdMap = new Map<string, number>();
  const dbIdMap = new Map<string, number>();

  existing.forEach((t) => {
    if (isGenerationDeleted(t.id, t.taskId, t.resultUrl, t.dbId)) return;
    const index = mergedList.length;
    mergedList.push(t);
    if (t.id) idMap.set(t.id, index);
    if (t.taskId) taskIdMap.set(t.taskId, index);
    if (t.dbId) dbIdMap.set(t.dbId, index);
  });

  incoming.forEach((dt) => {
    if (isGenerationDeleted(dt.id, dt.taskId, dt.resultUrl, dt.dbId)) return;

    // 智能多维匹配：优先匹配 id，次选 taskId，末选 dbId
    let matchIdx = -1;
    if (dt.id && idMap.has(dt.id)) {
      matchIdx = idMap.get(dt.id)!;
    } else if (dt.taskId && taskIdMap.has(dt.taskId)) {
      matchIdx = taskIdMap.get(dt.taskId)!;
    } else if (dt.id && dbIdMap.has(dt.id)) {
      matchIdx = dbIdMap.get(dt.id)!;
    }

    if (matchIdx >= 0) {
      const prev = mergedList[matchIdx];
      const isIncomingSuccess =
        (dt.status === 'SUCCESS' || Boolean(dt.resultUrl)) && Boolean(dt.resultUrl);
      const merged: GenerationTask = {
        ...prev,
        ...dt,
        id: prev.id, // 保留客户端本地关联的 id，保证当前会话组件稳定挂载
        dbId: dt.id || prev.dbId,
        taskId: dt.taskId || prev.taskId,
        status: isIncomingSuccess ? 'SUCCESS' : dt.status || prev.status,
        resultUrl: dt.resultUrl || prev.resultUrl,
        progress: isIncomingSuccess ? '100%' : (dt.progress || prev.progress),
        failReason: isIncomingSuccess ? undefined : (dt.failReason || prev.failReason),
      };
      mergedList[matchIdx] = merged;
      // 补充更新索引
      if (merged.id) idMap.set(merged.id, matchIdx);
      if (merged.taskId) taskIdMap.set(merged.taskId, matchIdx);
      if (merged.dbId) dbIdMap.set(merged.dbId, matchIdx);
    } else {
      const index = mergedList.length;
      mergedList.push(dt);
      if (dt.id) idMap.set(dt.id, index);
      if (dt.taskId) taskIdMap.set(dt.taskId, index);
      if (dt.dbId) dbIdMap.set(dt.dbId, index);
    }
  });

  return capGenerationTasks(
    mergedList.sort((a, b) => {
      const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
      const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
      return tB - tA;
    }),
  );
}

const initialDrawing = getStoredDrawingSessions();

export const createGenerateSlice: StateCreator<AppState, [], [], GenerateSlice> = (set, get) => {
  const setDrawing = (update: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => {
    if (get().generationHistoryReady === false) deferDrawingMutation(() => set(update));
    else set(update);
  };
  return ({
  generationHistoryReady: isDrawingHistoryReady(),
  sessions: initialDrawing.sessions,
  currentSessionId: initialDrawing.currentId,
  previewTask: null,
  previewQueue: [],
  generationTasks: initialDrawing.tasks,

  createSession: () => setDrawing((state) => {
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: '新创作对话',
      createdAt: Date.now(),
      tasks: []
    };
    const updatedSessions = [newSession, ...state.sessions];
    persistDrawingStateToStorage(undefined, updatedSessions, newSessionId);
    return {
      sessions: updatedSessions,
      currentSessionId: newSessionId,
      quickPrompt: '',
      quickRefImage: null,
      quickRefImages: [],
      quickVideoFirstFrame: null,
      quickVideoLastFrame: null,
      quickVideoMultiFrames: [],
    };
  }),

  switchSession: (id) => setDrawing(() => {
    persistDrawingStateToStorage(undefined, undefined, id);
    return {
      currentSessionId: id
    };
  }),

  deleteSession: (id) => setDrawing((state) => {
    const deletedSession = state.sessions.find(s => s.id === id);
    const deletedTaskIds = new Set((deletedSession?.tasks || []).map(t => t.id));
    const filtered = state.sessions.filter(s => s.id !== id);
    const updatedGenTasks = state.generationTasks.filter(g => !deletedTaskIds.has(g.id));

    let nextSessions = filtered;
    let nextSessionId = state.currentSessionId;

    if (nextSessions.length === 0) {
      const defaultId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      nextSessions = [{
        id: defaultId,
        title: '新创作对话',
        createdAt: Date.now(),
        tasks: []
      }];
      nextSessionId = defaultId;
    } else if (state.currentSessionId === id) {
      nextSessionId = nextSessions[0].id;
    }

    persistDrawingStateToStorage(updatedGenTasks, nextSessions, nextSessionId);

    return {
      sessions: nextSessions,
      currentSessionId: nextSessionId,
      generationTasks: updatedGenTasks
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
    let sessions = [...state.sessions];
    let targetSessionId = state.currentSessionId;
    let currentSessionTitle = task.title ? task.title.slice(0, 18) : 'AI 生图创作';

    const matched = sessions.find(s => s.id === targetSessionId);
    const reuseEmpty = Boolean(matched && matched.tasks.length === 0);
    const shouldCreateNew = !reuseEmpty && (isNewSession || targetSessionId === '__all__' || !matched);

    if (shouldCreateNew) {
      targetSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    } else if (matched && matched.tasks.length > 0 && matched.title) {
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
          return {
            ...s,
            title: s.tasks.length === 0 ? currentSessionTitle : s.title,
            tasks: [taskWithSession, ...s.tasks.filter(t => t.id !== taskWithSession.id && (!taskWithSession.taskId || t.taskId !== taskWithSession.taskId))]
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
    const sharedBatchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const sharedTime = Date.now();
    let sessions = [...state.sessions];
    let targetSessionId = state.currentSessionId;
    let resolvedTitle = customTitle || tasks[0]?.title?.slice(0, 18) || 'AI 批量分镜生图';

    const matched = sessions.find(s => s.id === targetSessionId);
    const reuseEmpty = Boolean(matched && matched.tasks.length === 0);
    const shouldCreateNew = !reuseEmpty && (isNewSession || targetSessionId === '__all__' || !matched);

    if (shouldCreateNew) {
      targetSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    } else if (matched && matched.tasks.length > 0 && matched.title) {
      resolvedTitle = matched.title;
    }

    const normalizedTasks: GenerationTask[] = tasks.map(t => ({
      ...t,
      batchId: t.batchId || sharedBatchId,
      createdAt: t.createdAt || sharedTime,
      sessionId: t.sessionId || targetSessionId,
      sessionTitle: t.sessionTitle || resolvedTitle
    }));

    const taskIds = new Set(normalizedTasks.map(t => t.id || t.taskId));
    const updatedGenTasks = capGenerationTasks([...normalizedTasks, ...state.generationTasks.filter(g => !taskIds.has(g.id) && (!g.taskId || !taskIds.has(g.taskId)))]);

    if (shouldCreateNew) {
      const newSession: ChatSession = {
        id: targetSessionId,
        title: resolvedTitle,
        createdAt: Date.now(),
        tasks: normalizedTasks
      };
      sessions = [newSession, ...sessions];
    } else {
      sessions = sessions.map(s => {
        if (s.id === targetSessionId) {
          return {
            ...s,
            title: s.tasks.length === 0 ? resolvedTitle : s.title,
            tasks: [...normalizedTasks, ...s.tasks.filter(t => !taskIds.has(t.id) && (!t.taskId || !taskIds.has(t.taskId)))]
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
    if (shouldPersist && (isTerminal || linked || statusChanged || recoveryChanged)) {
      persistDrawingStateToStorage(updatedGenTasks, updatedSessions, undefined, { immediate: linked || isTerminal || recoveryChanged });
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

    const updatedGenTasks = state.generationTasks.filter(g =>
      !idSet.has(g.id) &&
      (!g.taskId || !idSet.has(g.taskId)) &&
      (!g.resultUrl || !urlSet.has(g.resultUrl))
    );
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.filter(g =>
        !idSet.has(g.id) &&
        (!g.taskId || !idSet.has(g.taskId)) &&
        (!g.resultUrl || !urlSet.has(g.resultUrl))
      )
    }));

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
    if (!dbTasks || dbTasks.length === 0) return state;

    const allGens = mergeAndSortTasks(state.generationTasks, dbTasks);

    const taskMapById = new Map<string, GenerationTask>();
    const taskMapByTaskId = new Map<string, GenerationTask>();
    const taskMapByDbId = new Map<string, GenerationTask>();

    allGens.forEach((t) => {
      if (t.id) taskMapById.set(t.id, t);
      if (t.taskId) taskMapByTaskId.set(t.taskId, t);
      if (t.dbId) taskMapByDbId.set(t.dbId, t);
    });

    const findUpdatedTask = (st: GenerationTask): GenerationTask | undefined => {
      if (st.id && taskMapById.has(st.id)) return taskMapById.get(st.id);
      if (st.taskId && taskMapByTaskId.has(st.taskId)) return taskMapByTaskId.get(st.taskId);
      if (st.dbId && taskMapByDbId.has(st.dbId)) return taskMapByDbId.get(st.dbId);
      return undefined;
    };

    const updatedSessions = state.sessions.map(s => {
      const updatedTasks = (s.tasks || []).map(st => {
        const merged = findUpdatedTask(st);
        if (merged) {
          return { ...st, ...merged, id: st.id };
        }
        return st;
      });
      return { ...s, tasks: updatedTasks };
    });

    return {
      generationTasks: allGens,
      sessions: updatedSessions
    };
  }),
  });
};
