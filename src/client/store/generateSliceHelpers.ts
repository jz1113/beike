import type { AgentTurnTaskData, ChatSession, GenerationTask } from '@client/store/appStoreTypes';
import { isDepthImageTask, isDepthVideoTask, isGenerationVideoTask } from '@client/shared/media/generationAttempt';
import { sameUsageScope } from '@client/shared/utils/usageScope';
import { isGenerationDeleted } from './persist/index';
import { MAX_GENERATION_TASKS_IN_MEMORY, retainGenerationTasks, STARTUP_TASK_SUMMARY_COUNT } from './persist/generation';

export { MAX_GENERATION_TASKS_IN_MEMORY, retainGenerationTasks, STARTUP_TASK_SUMMARY_COUNT };

function media(task: GenerationTask): string {
  if (task.mediaType) return task.mediaType;
  if (task.id.startsWith('agent-task-') || task.agentTurn) return 'agent';
  if (task.usageScope?.mediaType) return task.usageScope.mediaType;
  if (isDepthImageTask(task)) return 'depth-image';
  if (isDepthVideoTask(task)) return 'depth-video';
  return isGenerationVideoTask(task) ? 'video' : 'image';
}

function compatible(a: GenerationTask, b: GenerationTask): boolean {
  if (a.dbId && b.dbId && a.dbId !== b.dbId) return false;
  if (media(a) !== media(b)) return false;
  if (a.usageScope && b.usageScope && !sameUsageScope(a.usageScope, b.usageScope)) return false;
  return true;
}

/** Record and local identities are authoritative. Provider numbers are only scoped aliases. */
function findRecoveryTaskIndex(tasks: GenerationTask[], incoming: GenerationTask): number {
  const candidates = tasks.map((task, index) => ({ task, index })).filter(({ task }) => compatible(task, incoming));
  const unique = (matches: typeof candidates) => matches.length === 1 ? matches[0].index : -1;
  const records = candidates.filter(({ task }) => Boolean(
    task.dbId && (task.dbId === incoming.dbId || task.dbId === incoming.id)
    || incoming.dbId && incoming.dbId === task.id,
  ));
  if (records.length) return unique(records);
  const local = candidates.filter(({ task }) => task.id && task.id === incoming.id);
  if (local.length) return unique(local);
  const scope = incoming.usageScope;
  if (!incoming.taskId || !scope) return -1;
  return unique(candidates.filter(({ task }) => task.taskId === incoming.taskId && task.usageScope
    && sameUsageScope(task.usageScope, scope)));
}

export const EMPTY_COMPOSER_MEDIA = {
  quickPrompt: '',
  quickRefImage: null,
  quickRefImages: [],
  quickVideoFirstFrame: null,
  quickVideoLastFrame: null,
  quickVideoMultiFrames: [],
};

function agentTurnText(turn?: AgentTurnTaskData): string {
  const reply = turn?.reply?.trim() || '';
  if (reply) return reply;
  return (turn?.items || [])
    .flatMap((item) => (item.kind === 'agentMessage' && item.content?.trim() ? [item.content.trim()] : []))
    .join('\n\n');
}

/** An empty database or archive record must not erase a reply already on screen. */
export function mergeAgentTurn(current?: AgentTurnTaskData, incoming?: AgentTurnTaskData): AgentTurnTaskData | undefined {
  if (!incoming) return current;
  if (!current) return incoming;
  const incomingText = agentTurnText(incoming);
  const currentText = agentTurnText(current);
  if (currentText && !incomingText) {
    return {
      ...incoming,
      reply: current.reply?.trim() ? current.reply : currentText,
      items: current.items?.length ? current.items : incoming.items,
      thinking: current.thinking || incoming.thinking,
      modelUsed: incoming.modelUsed || current.modelUsed,
    };
  }
  if (incomingText && !(incoming.items || []).some((item) => item.kind === 'agentMessage' && item.content?.trim()) && current.items?.length) {
    return { ...current, ...incoming, reply: incoming.reply?.trim() ? incoming.reply : current.reply, items: current.items };
  }
  return { ...current, ...incoming };
}

function mergeRestoredTask(current: GenerationTask | undefined, incoming: GenerationTask): GenerationTask {
  if (!current) return incoming;
  return {
    ...current,
    ...incoming,
    id: current.id || incoming.id,
    dbId: incoming.dbId || current.dbId,
    taskId: incoming.taskId || current.taskId,
    mediaType: incoming.mediaType || current.mediaType,
    modelRouteKey: incoming.modelRouteKey || current.modelRouteKey,
    usageScope: incoming.usageScope || current.usageScope,
    agentTurn: mergeAgentTurn(current.agentTurn, incoming.agentTurn),
  };
}

export function mergeRestoredSessions(current: ChatSession[], incoming: ChatSession[]): ChatSession[] {
  const seen = new Set(incoming.map((session) => session.id));
  const merged = incoming.map((session) => {
    const previous = current.find((item) => item.id === session.id);
    const previousTasks = previous?.tasks || [];
    const sessionTasks = session.tasks || [];
    const matched = new Set<number>();
    const tasks = sessionTasks.map((task) => {
      const index = findRecoveryTaskIndex(previousTasks, task);
      if (index >= 0) matched.add(index);
      return mergeRestoredTask(index >= 0 ? previousTasks[index] : undefined, task);
    });
    const extras = previousTasks.filter((_, index) => !matched.has(index));
    return { ...session, tasks: [...tasks, ...extras] };
  });
  return [...merged, ...current.filter((session) => !seen.has(session.id))];
}

export function capGenerationTasks(tasks: GenerationTask[]): GenerationTask[] {
  return retainGenerationTasks(tasks);
}

export function mergeAndSortTasks(existing: GenerationTask[], incoming: GenerationTask[], fromDatabase = false): GenerationTask[] {
  const mergedList: GenerationTask[] = [];
  // Older archive hydration accidentally assigned local attempt IDs as database IDs.
  const restoreIdentity = (task: GenerationTask) => !fromDatabase && task.dbId === task.id && /^(hub-gen-|agent-task-)/.test(task.id)
    ? { ...task, dbId: undefined } : task;

  existing.forEach((t) => {
    t = restoreIdentity(t);
    if (isGenerationDeleted(t.id, t.taskId, t.resultUrl, t.dbId)) return;
    mergedList.push(t);
  });

  incoming.forEach((dt) => {
    dt = fromDatabase ? { ...dt, dbId: dt.dbId || dt.id } : restoreIdentity(dt);
    if (isGenerationDeleted(dt.id, dt.taskId, dt.resultUrl, dt.dbId)) return;

    const matchIdx = findRecoveryTaskIndex(mergedList, dt);

    if (matchIdx >= 0) {
      const prev = mergedList[matchIdx];
      const isIncomingSuccess =
        (dt.status === 'SUCCESS' || Boolean(dt.resultUrl)) && Boolean(dt.resultUrl);
      const merged: GenerationTask = {
        ...prev,
        ...dt,
        id: prev.id, // 保留客户端本地关联的 id，保证当前会话组件稳定挂载
        dbId: dt.dbId || (fromDatabase ? dt.id : prev.dbId),
        taskId: dt.taskId || prev.taskId,
        mediaType: dt.mediaType || prev.mediaType,
        modelRouteKey: dt.modelRouteKey || prev.modelRouteKey,
        status: isIncomingSuccess ? 'SUCCESS' : dt.status || prev.status,
        resultUrl: dt.resultUrl || prev.resultUrl,
        progress: isIncomingSuccess ? '100%' : (dt.progress || prev.progress),
        failReason: isIncomingSuccess ? undefined : (dt.failReason || prev.failReason),
        usageScope: dt.usageScope || prev.usageScope,
        agentTurn: mergeAgentTurn(prev.agentTurn, dt.agentTurn),
      };
      mergedList[matchIdx] = merged;
    } else {
      mergedList.push(dt);
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
    currentSessionId: wasCurrent ? nextSessions.find(session => !session.canvasProjectId)?.id || 'session-default' : currentSessionId,
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
  const allGens = mergeAndSortTasks(stateTasks, dbTasks, true);
  const findUpdatedTask = (task: GenerationTask): GenerationTask | undefined => {
    const index = findRecoveryTaskIndex(allGens, task);
    return index >= 0 ? allGens[index] : undefined;
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
