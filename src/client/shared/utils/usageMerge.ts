import type { UsageLogItem } from './usageLog';
import { sameUsageScope, type UsageScope } from './usageScope';

type Identity = { scope: UsageScope; taskId?: string; localTaskId?: string; recordId?: string };

export function findUsageLog(logs: UsageLogItem[], identity: Identity): UsageLogItem | undefined {
  const candidates = logs.filter(log => sameUsageScope(log.scope, identity.scope));
  const exact = candidates.find(log => identity.recordId && log.recordId === identity.recordId
    || identity.localTaskId && log.localTaskId === identity.localTaskId && (!identity.recordId || !log.recordId || log.recordId === identity.recordId));
  if (exact) return exact;
  const remote = candidates.filter(log => identity.taskId && log.taskId === identity.taskId
    && (!identity.recordId || !log.recordId || log.recordId === identity.recordId)
    && (!identity.localTaskId || !log.localTaskId || log.localTaskId === identity.localTaskId));
  return remote.length === 1 ? remote[0] : undefined;
}

function count(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0; }

/** Merge cumulative receipts, including disjoint detail fields and stale replays. */
export function mergeUsageTokens(existing: UsageLogItem, incoming: { promptTokens?: number; completionTokens?: number; totalTokens?: number }): boolean {
  const prompt = Math.max(count(existing.promptTokens), count(incoming.promptTokens));
  const completion = Math.max(count(existing.completionTokens), count(incoming.completionTokens));
  const total = Math.max(count(existing.totalTokens), count(incoming.totalTokens), prompt + completion);
  const changed = existing.promptTokens !== prompt || existing.completionTokens !== completion || existing.totalTokens !== total;
  existing.promptTokens = prompt; existing.completionTokens = completion; existing.totalTokens = total;
  return changed;
}
