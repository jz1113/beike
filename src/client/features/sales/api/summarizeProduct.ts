import { apiRequest } from '@client/shared/api/apiRequest';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import { salesSummaryBodySchema, salesSummaryResponseSchema, type SalesSummaryInput } from '@shared/contracts/salesSummary';

export async function summarizeProduct(input: SalesSummaryInput, selection: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const body = salesSummaryBodySchema.parse({ textSources: input.textSources, productFacts: input.productFacts,
    model: selection.startsWith('deepseek-official:') ? selection : selectedTextModel(selection).modelId,
    ...getMultimodalClientOverrides(selection),
  });
  const response = await apiRequest('POST', '/api/sales/summary', {
    signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (response.status === 404) throw new Error('当前服务尚未启用卖点整理接口，请重新启动贝壳服务后重试。');
  if (!response.ok || !data || typeof data !== 'object' || !('success' in data) || !data.success) {
    throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : `卖点提炼失败（HTTP ${response.status}）`);
  }
  const result = salesSummaryResponseSchema.safeParse(data);
  if (!result.success) throw new Error('模型返回的卖点内容不完整，请重试；原始文字已保留。');
  return result.data;
}
