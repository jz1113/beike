import { jsonResponse } from '../../core/http';
import { assistantTurnRepository } from '@server/repositories/assistantTurns';
import { safeErrorMessage } from '../../core/validate';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { readAssistantSnapshot } from '@server/repositories/assistantSnapshots';
import { isAssistantThreadDeleted } from '@server/repositories/assistantThreadLifecycle';
import { getEffectiveAssistantTurnStatus } from '../../services/assistant/assistantTurnStream';

/**
 * 从 pathname 中提取 `:threadId` 或 `:turnId`（路径最后第二个段）。
 * 不依赖字符串 split 顺序，健壮性更高。
 */
function extractPathId(pathname: string, marker: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const idx = segments.lastIndexOf(marker);
  if (idx < 0 || idx >= segments.length - 1) return null;
  const id = segments[idx + 1];
  return id && id.length > 0 && id.length < 256 ? id : null;
}

/**
 * GET /api/assistant/threads/:threadId/turns
 */
export async function listThreadTurns(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const threadId = extractPathId(url.pathname, 'threads');
    const statusFilter = url.searchParams.get('status');

    if (!threadId) {
      return jsonResponse({ success: false, error: '缺少 threadId' }, 400);
    }
    if (await isAssistantThreadDeleted(threadId)) return jsonResponse({ success: false, error: '对话已删除' }, 404);

    const turns = await assistantTurnRepository.listForThread(threadId, statusFilter);

    const summaries = turns.map((t) => ({
      id: t.id,
      status: getEffectiveAssistantTurnStatus(t.id, t.status),
      model: t.model,
      startedAt: t.startedAt.getTime(),
      completedAt: t.completedAt?.getTime() ?? null,
      usage: {
        inputTokens: t.usageInputTokens,
        outputTokens: t.usageOutputTokens,
      },
    }));

    return jsonResponse({ success: true, turns: summaries.filter(turn => !statusFilter
      || !['running', 'completed', 'interrupted', 'failed', 'awaiting_approval'].includes(statusFilter) || turn.status === statusFilter) });
  } catch (error: unknown) {
    return jsonResponse({ success: false, error: safeErrorMessage(new Error(formatUserError(error)), '对话记录读取失败，请稍后重试') }, 500);
  }
}

/**
 * GET /api/assistant/turns/:turnId/snapshot
 * 从 DB 读 AssistantTurn + AssistantTurnItem，重建 AssistantTurn 对象
 * 客户端断线重连时调用
 */
export async function getTurnSnapshot(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const turnId = extractPathId(url.pathname, 'turns');

    if (!turnId) {
      return jsonResponse({ success: false, error: '缺少 turnId' }, 400);
    }

    const snapshot = await readAssistantSnapshot(turnId, getEffectiveAssistantTurnStatus);
    if (!snapshot) return jsonResponse({ success: false, error: 'Turn 不存在或对话已删除' }, 404);

    return jsonResponse({ success: true, snapshot });
  } catch (error: unknown) {
    return jsonResponse({ success: false, error: safeErrorMessage(new Error(formatUserError(error)), '对话记录读取失败，请稍后重试') }, 500);
  }
}
