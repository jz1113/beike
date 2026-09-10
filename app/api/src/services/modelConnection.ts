import { normalizeGatewayBaseUrl } from '@beike/shared/gatewayUrl';

/** Connectivity checks must not create billable image/video generation tasks. */
export async function checkMediaModelConnection(baseUrl: string, apiKey: string, model: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${normalizeGatewayBaseUrl(baseUrl)}/v1/models`, {
    method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return { success: false, status: response.status, error: `模型目录请求失败（HTTP ${response.status}），请检查网关地址、凭证或额度。`, testedGeneration: false };
  const data = await response.json().catch(() => null);
  if (!Array.isArray(data?.data)) return { success: false, error: '网关未返回有效的模型目录，无法确认模型是否可见。', testedGeneration: false };
  const modelVisible = data.data.some((item: { id?: string }) => item?.id === model);
  return {
    success: true, model, modelVisible, testedGeneration: false,
    message: modelVisible ? '网关连接正常，模型在目录中可见；未执行图片或视频生成。' : '网关连接正常，但目录中未找到该模型；生成权限和可用性尚未确认。',
  };
}
