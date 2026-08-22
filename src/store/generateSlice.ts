import type { StateCreator } from 'zustand';
import type { ChatSession, GenerationTask } from '@/types/app-store';
import {
  getStoredDrawingSessions,
  isGenerationDeleted,
  markGenerationDeleted,
  persistDrawingStateToStorage,
} from './persist';
import type { AppState, GenerateSlice } from './types';

const initialDrawing = getStoredDrawingSessions();

export const createGenerateSlice: StateCreator<AppState, [], [], GenerateSlice> = (set) => ({
  sessions: initialDrawing.sessions,
  currentSessionId: initialDrawing.currentId,
  previewTask: null,
  previewQueue: [],
  hubGenerations: initialDrawing.tasks,

  createSession: () => set((state) => {
    const newSessionId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: '新创作对话',
      createdAt: Date.now(),
      tasks: []
    };
    const updatedSessions = [newSession, ...state.sessions];
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_sessions', JSON.stringify(updatedSessions));
        localStorage.setItem('drawing_current_session_id', newSessionId);
      } catch {}
    }
    return {
      sessions: updatedSessions,
      currentSessionId: newSessionId,
      quickPrompt: '',
      quickRefImage: null,
      quickRefImages: []
    };
  }),

  switchSession: (id) => set((state) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_current_session_id', id);
      } catch {}
    }
    return {
      currentSessionId: id
    };
  }),

  deleteSession: (id) => set((state) => {
    const deletedSession = state.sessions.find(s => s.id === id);
    const deletedTaskIds = new Set((deletedSession?.tasks || []).map(t => t.id));
    const filtered = state.sessions.filter(s => s.id !== id);
    const updatedHubGens = state.hubGenerations.filter(g => !deletedTaskIds.has(g.id));

    let nextSessions = filtered;
    let nextSessionId = state.currentSessionId;

    if (nextSessions.length === 0) {
      const defaultId = `session-${Date.now()}`;
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

    persistDrawingStateToStorage(updatedHubGens, nextSessions, nextSessionId);

    return {
      sessions: nextSessions,
      currentSessionId: nextSessionId,
      hubGenerations: updatedHubGens
    };
  }),

  renameSession: (id, newTitle) => set((state) => {
    const updated = state.sessions.map(s => s.id === id ? { ...s, title: newTitle.trim() || '未命名对话' } : s);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_sessions', JSON.stringify(updated));
      } catch {}
    }
    return { sessions: updated };
  }),

  pinSession: (id) => set((state) => {
    const updated = state.sessions.map(s => s.id === id ? { ...s, isPinned: !s.isPinned } : s);
    // 置顶项排在最前面
    updated.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_sessions', JSON.stringify(updated));
      } catch {}
    }
    return { sessions: updated };
  }),

  renameTask: (taskId, newTitle) => set((state) => {
    const updatedHubGens = state.hubGenerations.map(t => t.id === taskId ? { ...t, title: newTitle } : t);
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.map(t => t.id === taskId ? { ...t, title: newTitle } : t)
    }));
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_sessions', JSON.stringify(updatedSessions));
      } catch {}
    }
    return {
      hubGenerations: updatedHubGens,
      sessions: updatedSessions,
      previewTask: state.previewTask?.id === taskId ? { ...state.previewTask, title: newTitle } : state.previewTask
    };
  }),

  setPreviewTask: (previewTask, queue) => set((state) => ({
    previewTask,
    previewQueue: queue !== undefined ? queue : (previewTask === null ? [] : state.previewQueue)
  })),
  setPreviewQueue: (previewQueue) => set({ previewQueue }),

  addHubGeneration: (task, isNewSession = false) => set((state) => {
    const updatedHubGens = [task, ...state.hubGenerations.filter(g => g.id !== task.id && (!task.taskId || g.taskId !== task.taskId))];
    let sessions = [...state.sessions];
    let targetSessionId = state.currentSessionId;

    if (isNewSession) {
      const newSessionId = `session-${Date.now()}`;
      const newSession: ChatSession = {
        id: newSessionId,
        title: task.title ? task.title.slice(0, 18) : 'AI 生图创作',
        createdAt: Date.now(),
        tasks: [task]
      };
      sessions = [newSession, ...sessions];
      targetSessionId = newSessionId;
    } else {
      if (targetSessionId === '__all__' || sessions.length === 0 || !sessions.some(s => s.id === targetSessionId)) {
        const newSessionId = `session-${Date.now()}`;
        const newSession: ChatSession = {
          id: newSessionId,
          title: task.title ? task.title.slice(0, 18) : 'AI 生图创作',
          createdAt: Date.now(),
          tasks: [task]
        };
        sessions = [newSession, ...sessions];
        targetSessionId = newSessionId;
      } else {
        sessions = sessions.map(s => {
          if (s.id === targetSessionId) {
            return {
              ...s,
              tasks: [task, ...s.tasks.filter(t => t.id !== task.id && (!task.taskId || t.taskId !== task.taskId))]
            };
          }
          return s;
        });
      }
    }

    persistDrawingStateToStorage(updatedHubGens, sessions, targetSessionId);

    return {
      hubGenerations: updatedHubGens,
      sessions,
      currentSessionId: targetSessionId
    };
  }),

  addBatchHubGenerations: (tasks, customTitle, isNewSession = true) => set((state) => {
    const sharedBatchId = `batch-${Date.now()}`;
    const sharedTime = Date.now();
    const normalizedTasks = tasks.map(t => ({
      ...t,
      batchId: t.batchId || sharedBatchId,
      createdAt: t.createdAt || sharedTime
    }));

    const taskIds = new Set(normalizedTasks.map(t => t.id || t.taskId));
    const updatedHubGens = [...normalizedTasks, ...state.hubGenerations.filter(g => !taskIds.has(g.id) && (!g.taskId || !taskIds.has(g.taskId)))];
    let sessions = [...state.sessions];
    let targetSessionId = state.currentSessionId;

    if (isNewSession) {
      const newSessionId = `session-${Date.now()}`;
      const newSession: ChatSession = {
        id: newSessionId,
        title: customTitle || tasks[0]?.title?.slice(0, 18) || 'AI 批量分镜生图',
        createdAt: Date.now(),
        tasks: normalizedTasks
      };
      sessions = [newSession, ...sessions];
      targetSessionId = newSessionId;
    } else {
      if (targetSessionId === '__all__' || sessions.length === 0 || !sessions.some(s => s.id === targetSessionId)) {
        const newSessionId = `session-${Date.now()}`;
        const newSession: ChatSession = {
          id: newSessionId,
          title: customTitle || tasks[0]?.title?.slice(0, 18) || 'AI 批量分镜生图',
          createdAt: Date.now(),
          tasks: normalizedTasks
        };
        sessions = [newSession, ...sessions];
        targetSessionId = newSessionId;
      } else {
        sessions = sessions.map(s => {
          if (s.id === targetSessionId) {
            return {
              ...s,
              tasks: [...normalizedTasks, ...s.tasks.filter(t => !taskIds.has(t.id) && (!t.taskId || !taskIds.has(t.taskId)))]
            };
          }
          return s;
        });
      }
    }

    persistDrawingStateToStorage(updatedHubGens, sessions, targetSessionId);

    return {
      hubGenerations: updatedHubGens,
      sessions,
      currentSessionId: targetSessionId
    };
  }),

  updateHubGeneration: (id, updates) => set((state) => {
    const updatedHubGens = state.hubGenerations.map(g => (g.id === id || g.taskId === id) ? { ...g, ...updates } : g);
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.map(g => (g.id === id || g.taskId === id) ? { ...g, ...updates } : g)
    }));

    persistDrawingStateToStorage(updatedHubGens, updatedSessions);

    return {
      hubGenerations: updatedHubGens,
      sessions: updatedSessions,
      previewTask: (state.previewTask && (state.previewTask.id === id || state.previewTask.taskId === id))
        ? ({ ...state.previewTask, ...updates } as GenerationTask)
        : state.previewTask
    };
  }),

  // 🌟 删除对话中的单项记录（仅从会话与当前对话流中移除，绝不删除数据库/资产库中的实体）
  deleteHubGeneration: (id) => set((state) => {
    const updatedHubGens = state.hubGenerations.filter(g => g.id !== id && g.taskId !== id);
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.filter(g => g.id !== id && g.taskId !== id)
    }));

    persistDrawingStateToStorage(updatedHubGens, updatedSessions);

    return {
      hubGenerations: updatedHubGens,
      sessions: updatedSessions,
      previewTask: (state.previewTask?.id === id || state.previewTask?.taskId === id) ? null : state.previewTask
    };
  }),

  // 🌟 彻底物理删除生成记录 (同步清理本地会话、全局生成历史与 localStorage 缓存)
  deleteGenerationPermanently: (ids: string[], urls?: string[]) => set((state) => {
    const idSet = new Set((ids || []).filter(Boolean));
    const urlSet = new Set((urls || []).filter(Boolean));

    markGenerationDeleted(Array.from(idSet), Array.from(urlSet));

    const updatedHubGens = state.hubGenerations.filter(g =>
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

    persistDrawingStateToStorage(updatedHubGens, updatedSessions);

    const isPreviewDeleted = state.previewTask && (
      idSet.has(state.previewTask.id) ||
      (state.previewTask.taskId && idSet.has(state.previewTask.taskId)) ||
      (state.previewTask.resultUrl && urlSet.has(state.previewTask.resultUrl))
    );

    return {
      hubGenerations: updatedHubGens,
      sessions: updatedSessions,
      previewTask: isPreviewDeleted ? null : state.previewTask
    };
  }),

  syncDatabaseTasks: (dbTasks) => set((state) => {
    if (!dbTasks || dbTasks.length === 0) return state;

    // 1. 全局生成历史合并 (去重并按创建时间倒序) - 供资产中心使用
    const taskMap = new Map<string, GenerationTask>();
    state.hubGenerations.forEach(t => {
      if (isGenerationDeleted(t.id, t.taskId, t.resultUrl, t.dbId)) return;
      const key = t.id || t.taskId;
      if (key) taskMap.set(key, t);
    });
    dbTasks.forEach(dt => {
      if (isGenerationDeleted(dt.id, dt.taskId, dt.resultUrl, dt.dbId)) return;
      const key = dt.id || dt.taskId;
      if (key) {
        const existing = taskMap.get(key);
        taskMap.set(key, existing ? { ...existing, ...dt } : dt);
      }
    });

    const allGens = Array.from(taskMap.values()).sort((a, b) => {
      const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
      const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

    // 2. 仅更新各会话内部已有的任务最新状态 (如已完成的 resultUrl)，绝不将全量历史灌入空白新会话！
    const updatedSessions = state.sessions.map(s => {
      const updatedTasks = (s.tasks || []).map(st => {
        const key = st.id || st.taskId;
        if (key && taskMap.has(key)) {
          return { ...st, ...taskMap.get(key) };
        }
        return st;
      });
      return { ...s, tasks: updatedTasks };
    });

    persistDrawingStateToStorage(allGens, updatedSessions);

    return {
      hubGenerations: allGens,
      sessions: updatedSessions
    };
  }),
});
