import type { ChatSession, GenerationTask } from '@client/store/appStoreTypes';
import { isGenerationDeleted } from './persist/index';
import { retainGenerationTasks } from './generationLimits';

export const EMPTY_COMPOSER_MEDIA = {
  quickPrompt: '',
  quickRefImage: null,
  quickRefImages: [],
  quickVideoFirstFrame: null,
  quickVideoLastFrame: null,
  quickVideoMultiFrames: [],
};

export function capGenerationTasks(tasks: GenerationTask[]): GenerationTask[] {
  return retainGenerationTasks(tasks);
}

export function mergeAndSortTasks(existing: GenerationTask[], incoming: GenerationTask[]): GenerationTask[] {
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

export function collectSessionDeletion(
  sessions: ChatSession[],
  generationTasks: GenerationTask[],
  sessionId: string,
): { ids: string[]; urls: string[] } {
  const ids: string[] = [];
  const urls: string[] = [];
  const take = (task?: GenerationTask) => {
    if (!task) return;
    if (task.id) ids.push(task.id);
    if (task.taskId) ids.push(task.taskId);
    if (task.dbId) ids.push(task.dbId);
    if (task.resultUrl) urls.push(task.resultUrl);
  };
  sessions.find((session) => session.id === sessionId)?.tasks?.forEach(take);
  generationTasks.forEach((task) => {
    if (task.sessionId === sessionId) take(task);
  });
  return { ids, urls };
}

export function omitDeletedGenerationTasks(
  tasks: GenerationTask[],
  sessionId: string,
  ids: string[],
  urls: string[],
): GenerationTask[] {
  const idSet = new Set(ids);
  const urlSet = new Set(urls);
  return tasks.filter((task) => {
    if (task.sessionId === sessionId) return false;
    if (task.id && idSet.has(task.id)) return false;
    if (task.taskId && idSet.has(task.taskId)) return false;
    if (task.dbId && idSet.has(task.dbId)) return false;
    if (task.resultUrl && urlSet.has(task.resultUrl)) return false;
    return true;
  });
}

/** 删除后若已无会话，保持空列表，不再自动补一条删不掉的空白对话。 */
export function resolveSessionsAfterDelete(
  remaining: ChatSession[],
  wasCurrent: boolean,
  currentSessionId: string,
): { sessions: ChatSession[]; currentSessionId: string } {
  const nextSessions = pruneEmptySessions(remaining, wasCurrent ? undefined : currentSessionId);
  if (nextSessions.length === 0) {
    return { sessions: [], currentSessionId: 'session-default' };
  }
  return {
    sessions: nextSessions,
    currentSessionId: wasCurrent ? nextSessions[0].id : currentSessionId,
  };
}

export function pruneEmptySessions(sessions: ChatSession[], keepSessionId?: string): ChatSession[] {
  const emptySessions = sessions.filter((s) => !s.tasks || s.tasks.length === 0);
  let singleEmptyIdToKeep: string | undefined;

  if (emptySessions.length > 0) {
    if (keepSessionId && emptySessions.some((s) => s.id === keepSessionId)) {
      singleEmptyIdToKeep = keepSessionId;
    } else {
      singleEmptyIdToKeep = emptySessions[0].id;
    }
  }

  return sessions.filter((s) => {
    const hasTasks = Boolean(s.tasks && s.tasks.length > 0);
    if (hasTasks) return true;
    return s.id === singleEmptyIdToKeep;
  });
}

export function deriveSessionTitleFromTasks(
  tasks: Partial<GenerationTask>[],
  fallback = 'AI 创作对话',
): string {
  if (!tasks || tasks.length === 0) return fallback;
  const first = tasks[0];
  const title = first.title?.trim();
  if (title && title !== '新创作对话' && title !== '未命名对话') {
    return title.slice(0, 20);
  }
  const prompt = first.prompt?.trim();
  if (prompt) {
    return prompt.slice(0, 20);
  }
  return fallback;
}

export const RESET_QUICK_PROMPT_STATE = {
  quickPrompt: '',
  quickRefImage: null,
  quickRefImages: [],
  quickVideoFirstFrame: null,
  quickVideoLastFrame: null,
  quickVideoMultiFrames: [],
};

export function createBatchGenerationTasksPayload(
  tasks: Partial<GenerationTask>[],
  customTitle: string | undefined,
  isNewSession: boolean,
  state: { sessions: ChatSession[]; currentSessionId: string; generationTasks: GenerationTask[] },
) {
  const sharedBatchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const sharedTime = Date.now();
  let sessions = pruneEmptySessions(state.sessions, state.currentSessionId);
  let targetSessionId = state.currentSessionId;
  const autoTitle = deriveSessionTitleFromTasks(tasks, 'AI 批量分镜生图');
  let resolvedTitle = customTitle || autoTitle;

  const matched = sessions.find((s) => s.id === targetSessionId);
  const reuseEmpty = Boolean(matched && (!matched.tasks || matched.tasks.length === 0));
  const shouldCreateNew = !reuseEmpty && (isNewSession || targetSessionId === '__all__' || !matched);

  if (shouldCreateNew) {
    targetSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  } else if (matched && matched.tasks && matched.tasks.length > 0 && matched.title && matched.title !== '新创作对话' && matched.title !== '未命名对话') {
    resolvedTitle = matched.title;
  }

  const normalizedTasks: GenerationTask[] = tasks.map((t) => ({
    ...t,
    batchId: t.batchId || sharedBatchId,
    createdAt: t.createdAt || sharedTime,
    sessionId: t.sessionId || targetSessionId,
    sessionTitle: t.sessionTitle || resolvedTitle,
  } as GenerationTask));

  const taskIds = new Set(normalizedTasks.map((t) => t.id || t.taskId));
  const updatedGenTasks = capGenerationTasks([
    ...normalizedTasks,
    ...state.generationTasks.filter((g) => !taskIds.has(g.id) && (!g.taskId || !taskIds.has(g.taskId))),
  ]);

  if (shouldCreateNew) {
    const newSession: ChatSession = {
      id: targetSessionId,
      title: resolvedTitle,
      createdAt: Date.now(),
      tasks: normalizedTasks,
    };
    sessions = [newSession, ...sessions];
  } else {
    sessions = sessions.map((s) => {
      if (s.id === targetSessionId) {
        const isDefaultTitle = !s.title || s.title === '新创作对话' || s.title === '未命名对话';
        return {
          ...s,
          title: (!s.tasks || s.tasks.length === 0 || isDefaultTitle) ? resolvedTitle : s.title,
          tasks: [...normalizedTasks, ...(s.tasks || []).filter((t) => !taskIds.has(t.id) && (!t.taskId || !taskIds.has(t.taskId)))],
        };
      }
      return s;
    });
  }

  return {
    updatedGenTasks,
    sessions,
    targetSessionId,
  };
}

export function syncTasksWithDatabase(
  stateTasks: GenerationTask[],
  sessions: ChatSession[],
  dbTasks: GenerationTask[],
): { generationTasks: GenerationTask[]; sessions: ChatSession[] } {
  if (!dbTasks || dbTasks.length === 0) return { generationTasks: stateTasks, sessions };
  const allGens = mergeAndSortTasks(stateTasks, dbTasks);
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

  const updatedSessions = sessions.map((s) => {
    const updatedTasks = (s.tasks || []).map((st) => {
      const merged = findUpdatedTask(st);
      return merged ? { ...st, ...merged, id: st.id } : st;
    });
    const isDefaultTitle = !s.title || s.title === '新创作对话' || s.title === '未命名对话';
    let nextTitle = s.title;
    if (isDefaultTitle && updatedTasks.length > 0) {
      nextTitle = deriveSessionTitleFromTasks(updatedTasks, s.title || '新创作对话');
    }
    return {
      ...s,
      title: nextTitle,
      tasks: updatedTasks,
    };
  });

  return { generationTasks: allGens, sessions: updatedSessions };
}

export function filterOutDeletedGenerations(
  stateTasks: GenerationTask[],
  sessions: ChatSession[],
  idSet: Set<string>,
  urlSet: Set<string>,
): { generationTasks: GenerationTask[]; sessions: ChatSession[] } {
  const matches = (g: GenerationTask) =>
    !idSet.has(g.id) &&
    (!g.taskId || !idSet.has(g.taskId)) &&
    (!g.resultUrl || !urlSet.has(g.resultUrl));

  const updatedGenTasks = stateTasks.filter(matches);
  const updatedSessions = sessions.map(s => ({
    ...s,
    tasks: s.tasks.filter(matches),
  }));
  return { generationTasks: updatedGenTasks, sessions: updatedSessions };
}
