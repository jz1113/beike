import { jsonResponse } from '../../core/http';
import { prisma } from '../../repositories/db';
import { formatUserError } from '@beike/domain/upstreamErrors';

const ACTIVE_STATUSES = ['running', 'awaiting_approval'] as const;

/**
 * GET /api/assistant/threads/:threadId/runs
 * 列出指定 thread 处于活跃状态的 turn，用于"任务中心"面板的快速过滤。
 */
export async function listActiveRuns(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const threadId = parts[parts.length - 2];
    if (!threadId) return jsonResponse({ success: false, error: '缺少 threadId' }, 400);

    const turns = await prisma.assistantTurn.findMany({
      where: { threadId, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    return jsonResponse({ success: true, runs: turns.map(summarize) });
  } catch (error: unknown) {
    return jsonResponse({ success: false, error: formatUserError(error) }, 500);
  }
}

/**
 * GET /api/assistant/runs
 * 任务中心：列出全部活跃 turn（用于顶部铃铛）。
 */
export async function listAllRuns(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const includeCompleted = url.searchParams.get('includeCompleted') === '1';
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));

    const where: Record<string, unknown> = includeCompleted
      ? {}
      : { status: { in: [...ACTIVE_STATUSES] } };

    const turns = await prisma.assistantTurn.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        items: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { startedAt: true },
        },
        _count: { select: { items: true } },
      },
    });

    return jsonResponse({ success: true, runs: turns.map(summarizeFull) });
  } catch (error: unknown) {
    return jsonResponse({ success: false, error: formatUserError(error) }, 500);
  }
}

function summarize(t: { id: string; threadId: string; status: string; model: string | null; startedAt: Date; completedAt: Date | null; usageInputTokens: number | null; usageOutputTokens: number | null }) {
  return {
    turnId: t.id,
    threadId: t.threadId,
    status: t.status,
    model: t.model,
    startedAt: t.startedAt.getTime(),
    completedAt: t.completedAt?.getTime() ?? null,
    usage: {
      inputTokens: t.usageInputTokens,
      outputTokens: t.usageOutputTokens,
    },
  };
}

function summarizeFull(t: any) {
  const lastItem = t.items?.[0]?.startedAt;
  const base = summarize(t);
  return {
    ...base,
    lastItemAt: lastItem ? new Date(lastItem).getTime() : base.startedAt,
    itemCount: t._count?.items ?? 0,
  };
}

/**
 * GET /api/assistant/runs/list?status=...
 * 兼容旧脚本：纯按 status 过滤的列表（不带 threadId 限制）。
 */
export async function listRuns(req: Request): Promise<Response> {
  return listAllRuns(req);
}
