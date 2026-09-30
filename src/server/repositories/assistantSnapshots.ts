import { assistantTurnRepository } from './assistantTurns';
import { isAssistantThreadDeleted } from './assistantThreadLifecycle';
import type { AssistantTurn, TurnStatus } from '@shared/domain/assistant/types';
import { normalizeAssistantItems, normalizeAssistantTask } from '@shared/domain/assistant/normalizeAssistantItems';
function parseStoredJson<T>(value: string | null, fallback: T): T {
  try { return value ? JSON.parse(value) ?? fallback : fallback; } catch { return fallback; }
}

export async function readAssistantSnapshot(turnId: string, effectiveStatusFor: (id: string, status: string) => TurnStatus = (_, status) => status as TurnStatus): Promise<AssistantTurn | null> {
    const stored = await assistantTurnRepository.findSnapshot(turnId);
    if (!stored) return null;
    const { turn, items } = stored;
    if (await isAssistantThreadDeleted(turn.threadId)) return null;

    let task: AssistantTurn['task'];
    try { task = JSON.parse(turn.snapshotJson || '{}').task; } catch { /* Legacy snapshot */ }
    // In the single-process sidecar, a persisted active state with no registered
    // worker means execution ended on restart. Recovery must not block retries forever.
    const effectiveStatus = effectiveStatusFor(turn.id, turn.status);
    const orphaned = ['running', 'awaiting_approval'].includes(turn.status) && effectiveStatus === 'interrupted';
    // Rebuild AssistantTurn from DB
    const snapshot: AssistantTurn = {
      task: normalizeAssistantTask(task),
      id: turn.id,
      threadId: turn.threadId,
      status: effectiveStatus,
      modelUsed: turn.model ?? undefined,
      usage: {
        inputTokens: turn.usageInputTokens ?? 0,
        outputTokens: turn.usageOutputTokens ?? 0,
      },
      items: items.map((item) => {
        const meta = parseStoredJson<Record<string, any>>(item.metaJson, {});
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
              callId: typeof meta.callId === 'string' ? meta.callId : item.id,
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
              action: parseStoredJson<Record<string, unknown> | undefined>(item.actionJson, undefined),
              visualImages: parseStoredJson<Array<{ url: string; label?: string }> | undefined>(item.visualImagesJson, undefined),
            };
          case 'approvalRequest':
            return {
              ...base,
              kind: 'approvalRequest' as const,
              approvalId: typeof meta.approvalId === 'string' ? meta.approvalId : item.id.replace(/^appr_(?=appr_)/, ''),
              decision: ['accept', 'decline', 'acceptForSession', 'cancel'].includes(meta.decision) ? meta.decision : undefined,
              toolName: item.toolName ?? '',
              displayName: item.displayName ?? item.toolName ?? '',
              args: parseStoredJson<Record<string, unknown>>(item.argsJson, {}),
              status: item.status === 'done' ? ('accepted' as const) : item.status === 'cancelled' ? ('expired' as const) : item.status === 'error' ? ('declined' as const) : ('pending' as const),
            };
          case 'subAgent':
            return { ...base, kind: 'subAgent' as const,
              skillId: typeof meta.skillId === 'string' ? meta.skillId : '',
              prompt: typeof meta.prompt === 'string' ? meta.prompt : '',
              status: item.status === 'done' ? 'completed' as const : item.status === 'error' ? 'failed' as const : 'running' as const,
              result: typeof meta.result === 'string' ? meta.result : item.content || undefined,
              subTurnId: typeof meta.subTurnId === 'string' ? meta.subTurnId : undefined };
          default:
            return { ...base, kind: 'userMessage' as const, content: item.content };
        }
      }),
    };

    snapshot.items = normalizeAssistantItems(snapshot.items);
    if (orphaned) {
      snapshot.items = snapshot.items.map(item => {
        if (item.kind === 'toolCall' && item.status === 'running') return { ...item, status: 'error' };
        if (item.kind === 'approvalRequest' && item.status === 'pending') return { ...item, status: 'expired', decision: 'cancel' };
        if (item.kind === 'subAgent' && ['running', 'spawning'].includes(item.status)) return { ...item, status: 'failed' };
        return item;
      });
      if (snapshot.task?.status === 'running') snapshot.task = { ...snapshot.task, status: 'cancelled', stage: '执行连接已结束，已有结果已保留' };
    }
    // A snapshot read that started before deletion must not return its old text afterward.
    if (await isAssistantThreadDeleted(turn.threadId)) return null;
    if (snapshot.task?.status === 'running' && ['completed', 'failed', 'interrupted'].includes(snapshot.status)) {
      snapshot.task = { ...snapshot.task, status: snapshot.status === 'completed' ? 'completed' : snapshot.status === 'interrupted' ? 'cancelled' : 'failed' };
    }
    return snapshot;
}
