import { apiFetch } from '@client/shared/api/apiClient';
import { normalizeAssistantItems } from '@shared/domain/assistant/normalizeAssistantItems';
import type { AssistantItem, AssistantTurn } from '@shared/domain/assistant/types';

type RecoveredTurn = AssistantTurn & { error?: string };

export function readAgentTurnSnapshot(value: unknown, turnId: string, threadId: string): RecoveredTurn | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.id !== turnId || snapshot.threadId !== threadId || !Array.isArray(snapshot.items)
    || !['running', 'awaiting_approval', 'completed', 'interrupted', 'failed'].includes(String(snapshot.status))) return null;
  return {
    id: turnId, threadId, status: snapshot.status as AssistantTurn['status'],
    items: normalizeAssistantItems(snapshot.items),
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
