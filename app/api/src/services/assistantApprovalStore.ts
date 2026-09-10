import type { ApprovalDecision } from '@beike/shared/assistant/types';
import type { AssistantSSEEvent } from '@beike/shared/assistant/events';
import type { ApprovalWaiter } from '@beike/shared/assistant/agentLoop';

const APPROVAL_TIMEOUT_MS = 60_000;

interface PendingApproval {
  resolve: (decision: ApprovalDecision) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingApproval>();

export function resolveApproval(approvalId: string, decision: ApprovalDecision): boolean {
  const entry = pending.get(approvalId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(approvalId);
  entry.resolve(decision);
  return true;
}

export function rejectTurnApprovals(turnId: string) {
  for (const [id, entry] of pending.entries()) {
    if (id.startsWith(`${turnId}_`)) {
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.resolve('cancel');
    }
  }
}

export const apiApprovalWaiter: ApprovalWaiter = {
  waitForApproval(turnId, approvalId, toolName, displayName, args, send, signal) {
    return new Promise<ApprovalDecision>((resolve, reject) => {
      if (signal?.aborted) {
        resolve('cancel');
        return;
      }

      const key = `${turnId}_${approvalId}`;
      const timer = setTimeout(() => {
        pending.delete(key);
        resolve('decline');
      }, APPROVAL_TIMEOUT_MS);

      pending.set(key, { resolve, reject, timer });

      send({
        type: 'item/approval/request',
        turnId,
        approvalId,
        toolName,
        displayName,
        args,
      } as AssistantSSEEvent);

      const onAbort = () => {
        clearTimeout(timer);
        pending.delete(key);
        resolve('cancel');
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  },
};
