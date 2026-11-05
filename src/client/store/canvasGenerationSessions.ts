import type { ChatSession, GenerationTask } from './appStoreTypes';
import { capGenerationTasks } from './generateSliceHelpers';

/** Keep canvas turns durable without changing the ordinary conversation selection. */
export function canvasGenerationPayload(
  tasks: GenerationTask[],
  state: { sessions: ChatSession[]; generationTasks: GenerationTask[] },
) {
  const projectId = tasks.find(task => task.canvasProjectId)?.canvasProjectId;
  if (!projectId) return;
  if (tasks.some(task => task.canvasProjectId !== projectId)) throw new Error('同一批任务必须属于同一个画布项目');
  const sessionId = `canvas-session:${projectId}`;
  const existing = state.sessions.find(session => session.id === sessionId);
  const title = tasks[0].sessionTitle || existing?.title || '画布创作';
  const linked = tasks.map(task => ({ ...task, sessionId, sessionTitle: title }));
  const ids = new Set(linked.map(task => task.id));
  const remoteIds = new Set(linked.flatMap(task => task.taskId ? [task.taskId] : []));
  const keep = (task: GenerationTask) => !ids.has(task.id) && (!task.taskId || !remoteIds.has(task.taskId));
  const session: ChatSession = { ...existing, id: sessionId, canvasProjectId: projectId, title,
    createdAt: existing?.createdAt ?? Date.now(), tasks: [...linked, ...(existing?.tasks || []).filter(keep)] };
  // A recovered legacy task may still live in its old conversation. Move its
  // aliases as well, or deleting that conversation would delete the canvas task.
  const sessions = state.sessions.map(item => {
    if (item.id === sessionId) return session;
    const tasks = item.tasks.filter(keep);
    return tasks.length === item.tasks.length ? item : { ...item, tasks };
  });
  if (!existing) sessions.unshift(session);
  return {
    generationTasks: capGenerationTasks([...linked, ...state.generationTasks.filter(keep)]),
    sessions,
  };
}
