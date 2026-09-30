import { jsonResponse } from '../../core/http';
import { listActiveThreadRuns, listAllAssistantRuns } from '@server/repositories/assistantRuns';
import { safeErrorMessage } from '../../core/validate';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { isAssistantThreadDeleted } from '@server/repositories/assistantThreadLifecycle';
import { getEffectiveAssistantTurnStatus } from '../../services/assistant/assistantTurnStream';

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
    if (await isAssistantThreadDeleted(threadId)) return jsonResponse({ success: false, error: '对话已删除' }, 404);

    const turns = await listActiveThreadRuns(threadId);
    const runs = turns.map(summarize).filter(turn => turn.status === 'running' || turn.status === 'awaiting_approval');
    return jsonResponse({ success: true, runs });
  } catch (error: unknown) {
    return jsonResponse({ success: false, error: safeErrorMessage(new Error(formatUserError(error)), '任务列表读取失败，请稍后重试') }, 500);
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
    const limit = Math.min(50, Math.max(1, Math.floor(Number(url.searchParams.get('limit')) || 20)));

    const turns = await listAllAssistantRuns(includeCompleted, limit);

    const visible = [];
    for (const turn of turns) if (!await isAssistantThreadDeleted(turn.threadId)) visible.push(turn);
    const runs = visible.map(summarizeFull).filter(turn => includeCompleted || turn.status === 'running' || turn.status === 'awaiting_approval');
    return jsonResponse({ success: true, runs });
  } catch (error: unknown) {
    return jsonResponse({ success: false, error: safeErrorMessage(new Error(formatUserError(error)), '任务列表读取失败，请稍后重试') }, 500);
  }
}

function summarize(t: { id: string; threadId: string; status: string; model: string | null; startedAt: Date; completedAt: Date | null; usageInputTokens: number | null; usageOutputTokens: number | null }) {
  return {
    turnId: t.id,
    threadId: t.threadId,
    status: getEffectiveAssistantTurnStatus(t.id, t.status),
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
