import { apiFetch } from '@client/shared/api/apiClient';
import { salesOCRBodySchema, salesOCRResultSchema, type SalesOCRResult } from '@shared/contracts/sales';

export class SalesOCRError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'SalesOCRError'; }
}

export async function recognizeProductImage(imageUrl: string, signal: AbortSignal, force = false): Promise<SalesOCRResult> {
  const body = salesOCRBodySchema.parse({ imageUrl, force });
  const response = await apiFetch('/api/sales/ocr', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new SalesOCRError(typeof data?.error === 'string' ? data.error : `文字识别失败（HTTP ${response.status}）`, response.status);
  const parsed = salesOCRResultSchema.safeParse(data.result);
  if (!parsed.success) throw new Error('文字识别返回格式异常，请重试');
  return parsed.data;
}
