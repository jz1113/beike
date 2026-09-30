import { db } from './access';
import { DELETED_ASSISTANT_THREAD_MESSAGES, isAssistantThreadDeleted, rememberAssistantThreadDeletion,
  withAssistantThreadWrite, withAssistantThreadWrites } from './assistantThreadLifecycle';

export type SessionWrite = {
  id: string;
  title: string;
  messages: unknown[];
  allowedTools?: string[];
  createdAt: number;
  updatedAt: number;
};

function messageKey(message: unknown): string | undefined {
  const id = message && typeof message === 'object' && 'id' in message ? message.id : undefined;
  return typeof id === 'string' && id ? `id:${id}` : JSON.stringify(message);
}

// Local caches and old clients may contain only a suffix. Session deletion uses
// DELETE; saving a snapshot must never remove earlier chat messages.
function mergeMessages(previousJson: string | undefined, incoming: unknown[]): unknown[] {
  let previous: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(previousJson || '[]');
    if (Array.isArray(parsed)) previous = parsed;
  } catch { /* A malformed legacy record must not prevent saving new messages. */ }
  const previousByKey = new Map(previous.map((message) => [messageKey(message), message]));
  const incomingByKey = new Map(incoming.map((message) => [messageKey(message), message]));
  const additions = new Map<string | undefined, unknown[]>();
  let nextExistingKey: string | undefined;
  // Anchor missing prefixes before the next known message, including legacy
  // messages with absent or equal timestamps; suffix caches still only append.
  for (const [key, message] of [...incomingByKey].reverse()) {
    if (previousByKey.has(key)) nextExistingKey = key;
    else {
      const group = additions.get(nextExistingKey) || [];
      group.push(message);
      additions.set(nextExistingKey, group);
    }
  }
  const merged: unknown[] = [];
  for (const [key, message] of previousByKey) {
    merged.push(...(additions.get(key) || []).reverse(), incomingByKey.has(key) ? incomingByKey.get(key) : message);
  }
  merged.push(...(additions.get(undefined) || []).reverse());
  return merged;
}

export const assistantSessionRepository = {
  list: () => db.assistantThread.findMany({ where: { messagesJson: { not: DELETED_ASSISTANT_THREAD_MESSAGES } }, orderBy: { updatedAt: 'desc' } }),
  count: () => db.assistantThread.count({ where: { messagesJson: { not: DELETED_ASSISTANT_THREAD_MESSAGES } } }),
  async save(sessions: SessionWrite[]) {
    const serverNow = Date.now();
    let savedCount = 0;
    await withAssistantThreadWrites(sessions.map(session => session.id), () => db.$transaction(async (tx) => {
      for (const session of sessions) {
        if (await isAssistantThreadDeleted(session.id, tx)) continue;
        const updatedAt = new Date(Math.min(serverNow, session.updatedAt));
        const previous = await tx.assistantThread.findUnique({ where: { id: session.id }, select: { messagesJson: true, updatedAt: true } });
        if (previous && previous.updatedAt.getTime() > updatedAt.getTime()) continue;
        const messagesJson = JSON.stringify(mergeMessages(previous?.messagesJson, session.messages || []));
        const allowedToolsJson = session.allowedTools ? JSON.stringify({ version: 1, tools: session.allowedTools }) : undefined;
        await tx.assistantThread.upsert({
          where: { id: session.id },
          create: { id: session.id, title: session.title, messagesJson, allowedToolsJson,
            createdAt: new Date(Math.min(serverNow, session.createdAt)), updatedAt },
          update: { title: session.title, messagesJson, allowedToolsJson, updatedAt },
        });
        savedCount += 1;
      }
    }));
    return savedCount;
  },
  async markDeleted(id: string) {
    await withAssistantThreadWrite(id, async () => {
      await db.assistantThread.upsert({ where: { id },
        create: { id, title: '已删除对话', messagesJson: DELETED_ASSISTANT_THREAD_MESSAGES, allowedToolsJson: '{"version":1,"tools":[]}' },
        update: { title: '已删除对话', messagesJson: DELETED_ASSISTANT_THREAD_MESSAGES, allowedToolsJson: '{"version":1,"tools":[]}' },
      });
      rememberAssistantThreadDeletion(id);
    });
  },
  turnIds: (threadId: string) => db.assistantTurn.findMany({ where: { threadId }, select: { id: true } }),
  deleteTurnData: (threadId: string, turnIds: string[]) => withAssistantThreadWrite(threadId, () => db.$transaction(async (tx) => {
    await tx.assistantTurnItem.deleteMany({ where: { turnId: { in: turnIds } } });
    await tx.assistantTurn.deleteMany({ where: { threadId } });
  })),
};
