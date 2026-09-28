import { jsonResponse } from '../../core/http';
import { listActiveThreadRuns, listAllAssistantRuns } from '@server/repositories/assistantRuns';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

/**
 * GET /api/assistant/threads/:threadId/runs
 * 列出指定 thread 处于活跃状态的 turn。
 * Web 任务中心前端已移除，路由保留给恢复/运维查询。
 */
export async function listActiveRuns(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const threadId = parts[parts.length - 2];
    if (!threadId) return jsonResponse({ success: false, error: '缺少 threadId' }, 400);

    const turns = await listActiveThreadRuns(threadId);
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

    const turns = await listAllAssistantRuns(includeCompleted, limit);

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
