import { db } from './access';

const ACTIVE_STATUSES = ['running', 'awaiting_approval'] as const;

export function listActiveThreadRuns(threadId: string) {
  return db.assistantTurn.findMany({
    where: { threadId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
}

export function listAllAssistantRuns(includeCompleted: boolean, limit: number) {
  return db.assistantTurn.findMany({
    where: includeCompleted ? {} : { status: { in: [...ACTIVE_STATUSES] } },
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: {
      items: { orderBy: { startedAt: 'desc' }, take: 1, select: { startedAt: true } },
      _count: { select: { items: true } },
    },
  });
}
