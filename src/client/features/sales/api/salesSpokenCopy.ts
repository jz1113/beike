import { apiRequest } from '@client/shared/api/apiRequest';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import { salesSpokenCopyBodySchema, salesSpokenCopyPendingReviewSchema, salesSpokenCopyResponseSchema,
  type SalesSpokenCopyInput, type SalesSpokenCopyPendingReview } from '@shared/contracts/salesSpokenCopy';

export class SalesSpokenCopyRequestError extends Error {
  constructor(message: string, readonly code = '', readonly pendingReview?: SalesSpokenCopyPendingReview) {
    super(message);
    this.name = 'SalesSpokenCopyRequestError';
  }
}

function matchingBeatIndexes(beats: readonly { index: number }[], expected: readonly { index: number }[]) {
  const indexes = new Set(beats.map((beat) => beat.index));
  return beats.length === expected.length && indexes.size === expected.length && expected.every((beat) => indexes.has(beat.index));
}

export async function adaptSalesSpokenCopy(input: SalesSpokenCopyInput, selection: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const body = salesSpokenCopyBodySchema.parse({
    ...input,
    model: selection.startsWith('deepseek-official:') ? selection : selectedTextModel(selection).modelId,
    ...getMultimodalClientOverrides(selection),
  });
  const response = await apiRequest('POST', '/api/sales/spoken-copy', {
    signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  signal.throwIfAborted();
  const data: unknown = await response.json().catch(() => null);
  signal.throwIfAborted();
  if (!response.ok || !data || typeof data !== 'object' || !('success' in data) || data.success !== true) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '';
    const code = data && typeof data === 'object' && 'code' in data && typeof data.code === 'string' ? data.code : '';
    const candidate = !body.reviewOnly && response.status === 502 && data && typeof data === 'object'
      && 'stage' in data && data.stage === 'review' && 'pendingReview' in data
      ? salesSpokenCopyPendingReviewSchema.safeParse(data.pendingReview) : null;
    const pendingReview = candidate?.success && matchingBeatIndexes(candidate.data.beats, body.beats) ? candidate.data : undefined;
    throw new SalesSpokenCopyRequestError(message || `口播时长适配失败（HTTP ${response.status}），原分镜已保留。`, code, pendingReview);
  }
  const parsed = salesSpokenCopyResponseSchema.safeParse(data);
  if (!parsed.success || !body.reviewOnly && !parsed.data.promptVersion.trim()) throw new Error('口播时长适配返回结构不完整，原分镜已保留，请重试。');
  if (!matchingBeatIndexes(parsed.data.beats, body.beats)) {
    throw new Error('口播时长适配返回的分镜编号不匹配，原分镜已保留，请重试。');
  }
  return parsed.data;
}
