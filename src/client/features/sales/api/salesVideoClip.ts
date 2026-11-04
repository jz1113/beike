import { apiRequest } from '@client/shared/api/apiRequest';
import { salesVideoClipBodySchema, salesVideoClipResponseSchema, type SalesDepthVideoClip } from '@shared/contracts/salesVideoClip';

export async function prepareSalesDepthVideoClip(
  input: { sourceUrl: string; endSec: number; maxDurationSec?: number },
  signal: AbortSignal,
): Promise<SalesDepthVideoClip> {
  signal.throwIfAborted();
  const body = salesVideoClipBodySchema.parse(input);
  const response = await apiRequest('POST', '/api/sales/video-clip', {
    signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  signal.throwIfAborted();
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '';
    throw new Error(error || (response.status === 404 ? '当前服务尚未加载动作片段准备接口，请重启贝壳服务后重试' : '准备深度动作片段失败，原视频已保留'));
  }
  const parsed = salesVideoClipResponseSchema.safeParse(data);
  if (!parsed.success || Math.abs(parsed.data.endSec - input.endSec) > 0.001
    || (input.maxDurationSec !== undefined && parsed.data.durationSec > input.maxDurationSec + 0.001)) {
    throw new Error('动作参考片段返回结果不完整，请重试');
  }
  const { url, startSec, endSec, durationSec } = parsed.data;
  return { url, startSec, endSec, durationSec };
}
