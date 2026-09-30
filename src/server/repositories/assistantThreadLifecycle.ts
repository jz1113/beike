import { db as prisma } from './access';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
const scopedKey = (id: string) => JSON.stringify([requireWorkspaceId(), id]);

/** A durable, content-free tombstone prevents an old client from recreating a deleted ID. */
export const DELETED_ASSISTANT_THREAD_MESSAGES = '{"version":1,"deleted":true}';
const deletedThreads = new Set<string>();
const threadWrites = new Map<string, Promise<unknown>>();
export class AssistantThreadDeletedError extends Error {
  constructor() { super('此对话已删除，请新建对话后发送'); this.name = 'AssistantThreadDeletedError'; }
}

export function rememberAssistantThreadDeletion(threadId: string): void {
  deletedThreads.add(scopedKey(threadId));
}

export async function isAssistantThreadDeleted(threadId: string, db: Pick<typeof prisma, 'assistantThread'> = prisma): Promise<boolean> {
  if (deletedThreads.has(scopedKey(threadId))) return true;
  const thread = await db.assistantThread.findUnique({ where: { id: threadId }, select: { messagesJson: true } });
  if (thread?.messagesJson !== DELETED_ASSISTANT_THREAD_MESSAGES) return false;
  deletedThreads.add(scopedKey(threadId));
  return true;
}

/** Serialize snapshots, turn writes and explicit deletion within a thread. */
export async function withAssistantThreadWrite<T>(threadId: string, run: () => Promise<T>): Promise<T> {
  const key = scopedKey(threadId);
  const previous = threadWrites.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  threadWrites.set(key, next);
  try { return await next; }
  finally { if (threadWrites.get(key) === next) threadWrites.delete(key); }
}

export function withAssistantThreadWrites<T>(threadIds: string[], run: () => Promise<T>): Promise<T> {
  const ids = [...new Set(threadIds)].sort();
  const lock = (index: number): Promise<T> => index === ids.length ? run()
    : withAssistantThreadWrite(ids[index], () => lock(index + 1));
  return lock(0);
}
