import type { UsageLogItem } from './usageLog';
import { recordModelUsage, resolveModelVendor } from './usageTracker';

export type ReportedUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

function count(raw: unknown) {
  const number = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** Read prompt/completion/total tokens from an upstream or normalized usage object. */
export function readReportedUsage(usage: unknown): ReportedUsage | null {
  if (!usage || typeof usage !== 'object') return null;
  const value = usage as Record<string, unknown>;
  const promptTokens = count(value.promptTokens ?? value.prompt_tokens ?? value.input_tokens ?? value.inputTokens);
  const completionTokens = count(value.completionTokens ?? value.completion_tokens ?? value.output_tokens ?? value.outputTokens);
  const totalTokens = count(value.totalTokens ?? value.total_tokens) || promptTokens + completionTokens;
  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) return null;
  return { promptTokens, completionTokens, totalTokens };
}

export function recordChatTokens(input: {
  modelId: string;
  modelName?: string;
  type?: UsageLogItem['type'];
  usage: unknown;
  mediaCount?: number;
}): void {
  const tokens = readReportedUsage(input.usage);
  if (!tokens || !input.modelId) return;
  recordModelUsage({
    modelId: input.modelId,
    modelName: input.modelName || input.modelId,
    provider: resolveModelVendor(input.modelId),
    type: input.type || 'chat',
    ...tokens,
    mediaCount: input.mediaCount,
    success: true,
  });
}

export function recordMediaTaskUsage(input: {
  taskId?: string;
  modelId: string;
  modelName?: string;
  type: UsageLogItem['type'];
  mediaCount?: number;
  duration?: number;
  usage?: unknown;
}): void {
  const tokens = readReportedUsage(input.usage);
  recordModelUsage({
    taskId: input.taskId,
    modelId: input.modelId,
    modelName: input.modelName || input.modelId,
    provider: resolveModelVendor(input.modelId),
    type: input.type,
    mediaCount: input.mediaCount,
    duration: input.duration,
    promptTokens: tokens?.promptTokens,
    completionTokens: tokens?.completionTokens,
    totalTokens: tokens?.totalTokens,
    success: true,
  });
}
