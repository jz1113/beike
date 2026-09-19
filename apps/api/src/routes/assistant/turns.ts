import { jsonResponse } from '../../core/http';
import { prisma } from '../../repositories/db';
import { formatUserError } from '@beike/domain/upstreamErrors';
import type { AssistantTurn } from '@beike/domain/assistant/types';

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

    const where: Record<string, unknown> = { threadId };
    if (statusFilter && ['running', 'completed', 'interrupted', 'failed', 'awaiting_approval'].includes(statusFilter)) {
      where.status = statusFilter;
    }

    const turns = await prisma.assistantTurn.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    const summaries = turns.map((t) => ({
      id: t.id,
      status: t.status,
      model: t.model,
      startedAt: t.startedAt.getTime(),
      completedAt: t.completedAt?.getTime() ?? null,
      usage: {
        inputTokens: t.usageInputTokens,
        outputTokens: t.usageOutputTokens,
      },
    }));

    return jsonResponse({ success: true, turns: summaries });
  } catch (error: unknown) {
    return jsonResponse({ success: false, error: formatUserError(error) }, 500);
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

    const turn = await prisma.assistantTurn.findUnique({ where: { id: turnId } });
    if (!turn) {
      return jsonResponse({ success: false, error: 'Turn 不存在' }, 404);
    }

    const items = await prisma.assistantTurnItem.findMany({
      where: { turnId },
      orderBy: { startedAt: 'asc' },
    });

    let task: AssistantTurn['task'];
    try { task = JSON.parse(turn.snapshotJson || '{}').task; } catch { /* Legacy snapshot */ }
    // Rebuild AssistantTurn from DB
    const snapshot: AssistantTurn = {
      task,
      id: turn.id,
      threadId: turn.threadId,
      status: turn.status as AssistantTurn['status'],
      modelUsed: turn.model ?? undefined,
      usage: {
        inputTokens: turn.usageInputTokens ?? 0,
        outputTokens: turn.usageOutputTokens ?? 0,
      },
      items: items.map((item) => {
        const base = {
          id: item.id,
          kind: item.kind as AssistantTurn['items'][number]['kind'],
          createdAt: item.startedAt.getTime(),
        };

        switch (item.kind) {
          case 'agentMessage':
            return { ...base, kind: 'agentMessage' as const, content: item.content };
          case 'agentReasoning':
            return { ...base, kind: 'agentReasoning' as const, content: item.reasoning };
          case 'toolCall':
            return {
              ...base,
              kind: 'toolCall' as const,
              name: item.toolName ?? '',
              displayName: item.displayName ?? item.toolName ?? '',
              args: item.argsJson || '{}',
              callId: item.id,
              status: item.status === 'done' ? ('done' as const) : item.status === 'error' ? ('error' as const) : ('running' as const),
            };
          case 'toolResult':
            return {
              ...base,
              kind: 'toolResult' as const,
              name: item.toolName ?? '',
              displayName: item.displayName ?? item.toolName ?? '',
              status: item.status === 'done' ? ('done' as const) : ('error' as const),
              summary: item.summary ?? '',
              action: item.actionJson ? JSON.parse(item.actionJson) : undefined,
            };
          case 'approvalRequest':
            return {
              ...base,
              kind: 'approvalRequest' as const,
              approvalId: item.id,
              toolName: item.toolName ?? '',
              displayName: item.displayName ?? item.toolName ?? '',
              args: item.argsJson ? JSON.parse(item.argsJson) : {},
              status: item.status === 'done' ? ('accepted' as const) : item.status === 'cancelled' ? ('expired' as const) : item.status === 'error' ? ('declined' as const) : ('pending' as const),
            };
          default:
            return { ...base, kind: 'userMessage' as const, content: item.content };
        }
      }),
    };

    return jsonResponse({ success: true, snapshot });
  } catch (error: unknown) {
    return jsonResponse({ success: false, error: formatUserError(error) }, 500);
  }
}
