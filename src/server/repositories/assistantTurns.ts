import { db } from './access';

const VISIBLE_STATUSES = new Set(['running', 'completed', 'interrupted', 'failed', 'awaiting_approval']);

export const assistantTurnRepository = {
  listForThread(threadId: string, status: string | null) {
    return db.assistantTurn.findMany({
      where: { threadId, ...(status && VISIBLE_STATUSES.has(status) ? { status } : {}) },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  },
  async findSnapshot(turnId: string) {
    const turn = await db.assistantTurn.findUnique({ where: { id: turnId } });
    if (!turn) return null;
    const items = await db.assistantTurnItem.findMany({ where: { turnId }, orderBy: { startedAt: 'asc' } });
    return { turn, items };
  },
};
