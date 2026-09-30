import type { ApprovalDecision } from '@shared/domain/assistant/types';
import type { ApprovalWaiter } from '@server/infrastructure/assistant/agentLoop';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { getToolDefinition } from '@shared/domain/assistant/tools/defs';

const APPROVAL_TIMEOUT_MS = 60_000;
const grants = new Map<string, { tools: Set<string>; expiresAt: number }>();
const pending = new Map<string, { turnId: string; workspaceId: string; settle: (decision: ApprovalDecision) => void }>();
const scopedKey = (id: string) => `${requireWorkspaceId()}:${id}`;
export function getSessionApprovals(threadId: string): Set<string> {
  for (const [key, grant] of grants) if (grant.expiresAt < Date.now()) grants.delete(key);
  return new Set(grants.get(scopedKey(threadId))?.tools || []);
}
export function clearSessionApprovals(threadId: string): void { grants.delete(scopedKey(threadId)); }
export function approvalWaiterForThread(threadId: string): ApprovalWaiter {
  const key = scopedKey(threadId);
  return { async waitForApproval(...args) {
    const decision = await apiApprovalWaiter.waitForApproval(...args);
    if (decision === 'acceptForSession' && getToolDefinition(args[2])?.approval === 'per_session') {
      const tools = getSessionApprovals(threadId); tools.add(args[2]);
      grants.set(key, { tools, expiresAt: Date.now() + 30 * 60_000 });
    }
    return decision;
  } };
}
export function resolveApproval(approvalId: string, decision: ApprovalDecision): boolean {
  const entry = pending.get(scopedKey(approvalId));
  if (!entry) return false;
  if (!['accept', 'acceptForSession', 'decline', 'cancel'].includes(decision)) return false;
  entry.settle(decision);
  return true;
}
export function rejectTurnApprovals(turnId: string) {
  const workspaceId = requireWorkspaceId();
  for (const entry of pending.values()) if (entry.turnId === turnId && entry.workspaceId === workspaceId) entry.settle('cancel');
}
export const apiApprovalWaiter: ApprovalWaiter = {
  waitForApproval(...args) {
    const [turnId, approvalId, , , , , signal] = args;
    return new Promise<ApprovalDecision>((resolve) => {
      if (signal?.aborted) { resolve('cancel'); return; }
      const workspaceId = requireWorkspaceId();
      const key = scopedKey(`${turnId}_${approvalId}`);
      pending.get(key)?.settle('cancel');
      let settled = false;
      const settle = (decision: ApprovalDecision) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); pending.delete(key); signal?.removeEventListener('abort', onAbort); resolve(decision);
      };
      const onAbort = () => settle('cancel');
      const timer = setTimeout(() => settle('decline'), APPROVAL_TIMEOUT_MS);
      pending.set(key, { turnId, workspaceId, settle });
      signal?.addEventListener('abort', onAbort, { once: true });
      // AgentRuntime emits the request once. Registration itself must not duplicate it.
      if (signal?.aborted) settle('cancel');
    });
  },
};
