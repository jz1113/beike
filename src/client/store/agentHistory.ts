import type { ChatSession, GenerationTask } from './appStoreTypes';

export interface DrawingSnapshot {
  sessions: ChatSession[];
  tasks: GenerationTask[];
  currentId: string;
  updatedAt: number;
}

/** Only Agent conversations belong in chat history; media remains in generation records. */
export function isAgentConversation(session: ChatSession): boolean {
  return !session.canvasProjectId && session.tasks.some(task => task.mediaType === 'agent' || task.id.startsWith('agent-task-'));
}

export function agentHistorySnapshot(snapshot: DrawingSnapshot): DrawingSnapshot {
  const tasks = new Map(snapshot.tasks.map(task => [task.id, task]));
  for (const session of snapshot.sessions) {
    for (const task of session.tasks) if (!tasks.has(task.id)) tasks.set(task.id, task);
  }
  return { ...snapshot, tasks: [...tasks.values()], sessions: snapshot.sessions.filter(isAgentConversation) };
}
