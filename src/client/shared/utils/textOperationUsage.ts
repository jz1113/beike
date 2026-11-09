import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { readReportedUsage, recordChatTokens, type ReportedUsage } from './modelUsage';
import { createUsageScope, usageDigest, type UsageScope } from './usageScope';
import { currentUsageEpoch } from './usageStorage';

interface TextUsage { modelId: string; scope: UsageScope; tokens?: ReportedUsage; success?: boolean }
function slot(id: string) {
  return 'beike.text-operation-usage.v1:' + usageDigest(JSON.stringify([getWorkspaceSecret(), id]));
}
function read(id: string): TextUsage | undefined {
  const raw = localStorage.getItem(slot(id));
  if (!raw) return;
  const row = JSON.parse(raw) as TextUsage;
  if (!row.modelId || !row.scope || !row.scope.workspaceId || !row.scope.channelId || !row.scope.epoch) throw new Error('原文本用量归属无法核对');
  return row;
}
function write(id: string, row: TextUsage) {
  const key = slot(id), raw = JSON.stringify(row);
  localStorage.setItem(key, raw);
  if (localStorage.getItem(key) !== raw) throw new Error('文本用量归属保存未确认，未提交模型');
}
/** Freeze attribution before dispatch. Only digests, never credentials, are persisted. */
export function prepareTextOperationUsage(id: string, modelId: string, type = 'chat', overrides?: Record<string, unknown>) {
  const existing = read(id);
  if (existing) return existing.scope;
  const headers = overrides ? {
    'x-custom-base-url': String(overrides.customBaseUrl || ''),
    'x-custom-api-key': String(overrides.customApiKey || ''),
    'x-custom-protocol': String(overrides.textProtocol || ''),
  } : undefined;
  const scope = createUsageScope(type, modelId, headers);
  write(id, { modelId, scope });
  return scope;
}
/** Fresh and recovered receipts settle the same operation; the statistics epoch rejects old replies. */
export function replayTextOperationUsage(id: string, usage?: unknown, success = false) {
  const saved = read(id);
  // Legacy receipts without original attribution must not borrow today's channel or clear epoch.
  if (!saved) return;
  const incoming = readReportedUsage(usage);
  if (saved.scope.epoch !== currentUsageEpoch()) return;
  if (incoming) {
    const promptTokens = Math.max(saved.tokens?.promptTokens || 0, incoming.promptTokens);
    const completionTokens = Math.max(saved.tokens?.completionTokens || 0, incoming.completionTokens);
    saved.tokens = { promptTokens, completionTokens, totalTokens: Math.max(saved.tokens?.totalTokens || 0, incoming.totalTokens, promptTokens + completionTokens) };
  }
  saved.success ||= success;
  write(id, saved);
  if (saved.tokens) recordChatTokens({ operationId: id, modelId: saved.modelId,
    type: saved.scope.mediaType as 'chat' | 'vision', scope: saved.scope, usage: saved.tokens, success: !!saved.success });
}
