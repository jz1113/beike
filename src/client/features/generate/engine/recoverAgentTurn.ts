import { readReportedUsage, recordChatTokens } from '@client/shared/utils/modelUsage';
import { apiFetch } from '@client/shared/api/apiClient';
import { useAppStore, type GenerationTask, type ProductWidgetData } from '@client/store';
import { isImageTaskActive } from '@shared/domain/core/taskStatus';
import { deriveTurnView } from '@client/shared/agent/turnItems';
import { normalizeAssistantItems } from '@shared/domain/assistant/normalizeAssistantItems';
import type { AssistantItem, AssistantTurn } from '@shared/domain/assistant/types';
import { GenerationSubmissionQueue } from './generationSubmissionQueue';
import { subscribeGenerationPreparationStop } from '@client/shared/api/generation/generationDispatch';
import { getGenerationMediaConcurrency, subscribeGenerationMediaConcurrency } from '@client/shared/agent/dispatchGenerationBatch';

export type TaskUpdater = (
  id: string,
  updates: Partial<GenerationTask>,
  opts?: { persist?: boolean },
) => void;

export { getGenerationMediaConcurrency, setGenerationMediaConcurrency, subscribeGenerationMediaConcurrency } from '@client/shared/agent/dispatchGenerationBatch';

// The shared preference has no feature imports; UI and engines use the same value.
export const generationSubmissionQueue = new GenerationSubmissionQueue();
subscribeGenerationPreparationStop(taskId => generationSubmissionQueue.cancelTask(taskId));
generationSubmissionQueue.setMediaConcurrency(getGenerationMediaConcurrency());
subscribeGenerationMediaConcurrency(() => generationSubmissionQueue.setMediaConcurrency(getGenerationMediaConcurrency()));

/** Live receipts and restored snapshots share the original turn and captured channel. */
export function recordAgentTaskUsage(task: Pick<GenerationTask, 'usageScope'>, turnId: string, model: string, usage: unknown): void {
  if (!task.usageScope || model === 'direct-collection') return;
  recordChatTokens({ modelId: model, operationId: `agent:${turnId}`, scope: task.usageScope, usage });
}

/** Recovery reads the accepted turn; it never dispatches another model or replays client actions. */
export async function restoreStoredAgentTask(task: GenerationTask, update: TaskUpdater, signal: AbortSignal): Promise<boolean> {
  const turnId = task.agentTurn?.turnId || task.taskId;
  const threadId = task.agentTurn?.threadId || task.sessionId;
  if (!turnId || !threadId) return false;
  const snapshot = await recoverAgentTurn(turnId, threadId, signal, snapshot => {
    const current = useAppStore.getState().generationTasks.find(item => item.id === task.id);
    if (signal.aborted || !current || !isImageTaskActive(current.status) || !current.submissionRecoveryRequired) return;
    recordAgentTaskUsage(current, turnId, snapshot.modelUsed || current.agentTurn?.modelUsed || current.model || '', snapshot.usage);
    const items = restoreAgentTurnItems(current.agentTurn?.items || [], snapshot);
    const view = deriveTurnView(items);
    const finished = !['running', 'awaiting_approval'].includes(snapshot.status);
    const success = snapshot.status === 'completed' && Boolean(view.content.trim());
    update(task.id, {
      status: finished ? success ? 'SUCCESS' : 'FAILURE' : 'IN_PROGRESS',
      progress: finished ? success ? '100%' : '0%' : current.progress,
      submissionRecoveryRequired: !finished,
      failReason: finished ? success ? undefined : snapshot.error || '对话已中断，可重试' : '正在核对原对话结果…',
      agentTurn: { ...current.agentTurn, turnId, threadId, items, reply: view.content || (finished ? '' : current.agentTurn?.reply), thinking: view.thinking || (finished ? '' : current.agentTurn?.thinking),
        toolActivity: view.toolActivity, productWidget: snapshot.productWidget || current.agentTurn?.productWidget, modelUsed: snapshot.modelUsed || current.agentTurn?.modelUsed,
        statusText: finished ? undefined : snapshot.status === 'awaiting_approval' ? '原对话等待确认' : '正在恢复对话进度…' },
    });
  });
  return Boolean(snapshot);
}

type RecoveredTurn = AssistantTurn & { error?: string; productWidget?: ProductWidgetData };

export function readProductWidget(value: unknown): ProductWidgetData | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const widget = value as Record<string, unknown>;
  if (typeof widget.title !== 'string' || typeof widget.platform !== 'string' || typeof widget.itemId !== 'string') return undefined;
  return widget as unknown as ProductWidgetData;
}

export function readAgentTurnSnapshot(value: unknown, turnId: string, threadId: string): RecoveredTurn | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.id !== turnId || snapshot.threadId !== threadId || !Array.isArray(snapshot.items)
    || !['running', 'awaiting_approval', 'completed', 'interrupted', 'failed'].includes(String(snapshot.status))) return null;
  const usage = readReportedUsage(snapshot.usage);
  return {
    ...(usage ? { usage: { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens } } : {}),
    id: turnId, threadId, status: snapshot.status as AssistantTurn['status'],
    items: normalizeAssistantItems(snapshot.items),
    productWidget: readProductWidget(snapshot.productWidget),
    modelUsed: typeof snapshot.modelUsed === 'string' ? snapshot.modelUsed : undefined,
    error: typeof snapshot.error === 'string' ? snapshot.error : undefined,
  };
}

/** Running snapshots can lag live deltas; never erase text already received. */
export function restoreAgentTurnItems(current: AssistantItem[], snapshot: RecoveredTurn): AssistantItem[] {
  if (snapshot.status === 'completed') return snapshot.items;
  const merged = new Map(current.map(item => [item.id, item]));
  for (const item of snapshot.items) {
    const previous = merged.get(item.id);
    if (previous?.kind === item.kind && 'content' in previous && 'content' in item
      && previous.content.length > item.content.length) continue;
    merged.set(item.id, item);
  }
  return [...merged.values()];
}

function waitForSnapshot(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Read the existing turn only. A delivery failure must never submit a new model call. */
export async function recoverAgentTurn(
  turnId: string,
  threadId: string,
  signal: AbortSignal,
  onSnapshot: (snapshot: RecoveredTurn) => void,
): Promise<RecoveredTurn | null> {
  const recoverySignal = AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)]);
  let failures = 0;
  while (!recoverySignal.aborted) {
    let snapshot: RecoveredTurn | null = null;
    try {
      const response = await apiFetch(`/api/assistant/turns/${encodeURIComponent(turnId)}/snapshot`, {
        signal: AbortSignal.any([recoverySignal, AbortSignal.timeout(15_000)]),
      });
      const data = response.ok ? await response.json() : null;
      if (data?.success === true) snapshot = readAgentTurnSnapshot(data.snapshot, turnId, threadId);
    } catch {
      signal.throwIfAborted();
    }
    if (snapshot) {
      failures = 0;
      onSnapshot(snapshot);
      if (snapshot.status !== 'running' && snapshot.status !== 'awaiting_approval') return snapshot;
    } else if (++failures >= 3) return null;
    await waitForSnapshot(recoverySignal);
  }
  return null;
}
