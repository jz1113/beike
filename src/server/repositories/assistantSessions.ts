import { db } from './access';

export type SessionWrite = {
  id: string;
  title: string;
  messages: unknown[];
  allowedTools: string[];
};

export const assistantSessionRepository = {
  list: () => db.assistantThread.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 }),
  count: () => db.assistantThread.count(),
  async save(sessions: SessionWrite[]) {
    const serverNow = new Date();
    await db.$transaction(async (tx) => {
      for (const session of sessions) {
        await tx.assistantThread.upsert({
          where: { id: session.id },
          create: { id: session.id, title: session.title, messagesJson: JSON.stringify(session.messages || []), createdAt: serverNow, updatedAt: serverNow },
          update: { title: session.title, messagesJson: JSON.stringify(session.messages || []), updatedAt: serverNow },
        });
      }
    });
  },
  delete: (id: string) => db.assistantThread.delete({ where: { id } }),
};
