import { apiRequest } from '@client/shared/api/apiRequest';
import { retryWhenLocalApiUnavailable } from '@client/shared/api/localApiRetry';
import { createUsageScope, sameUsageScope, operationUsageScope } from '@client/shared/utils/usageScope';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import { generationRecoveryError } from '@client/shared/api/generation/generationRecovery';

/** Query an existing phase before considering a POST with the same durable key. */
export async function posterStageRequest(path: '/api/generate/headline-title' | '/api/generate/headline-design', body: Record<string, unknown>, signal?: AbortSignal, operationKey?: string) {
  try {
    const selection = String(body.model || '');
    const wireBody: Record<string, unknown> = { ...(!body.customBaseUrl && !body.customApiKey ? getMultimodalClientOverrides(selection) : {}), ...body };
    const field = (key: string) => typeof wireBody[key] === 'string' ? wireBody[key] as string : '';
    const scopeHeaders = {
      'x-custom-base-url': field('customBaseUrl'), 'x-custom-api-key': field('customApiKey'), 'x-custom-protocol': field('textProtocol'),
    };
    const scope = operationUsageScope(operationKey ? `${path}:${operationKey}` : undefined, 'chat', selection, scopeHeaders);
    let response: Response | undefined;
    if (operationKey) {
      const receipt = await apiRequest('GET', path, { search: `operationKey=${encodeURIComponent(operationKey)}`, signal });
      if (receipt.status === 404) {
        const missing = await receipt.json().catch(() => null);
        if (missing?.code !== 'operation_not_found') throw generationRecoveryError('后端阶段回执接口不可用，请重启后端后核对；本次未提交模型');
      } else response = receipt;
    }
    if (!response && !sameUsageScope(scope, createUsageScope('chat', selection, scopeHeaders))) throw generationRecoveryError('原操作渠道已变更，请恢复原渠道或开始新操作；本次未提交模型');
    response ??= await retryWhenLocalApiUnavailable(() => apiRequest('POST', path, {
      headers: { 'Content-Type': 'application/json', ...(operationKey ? { 'x-idempotency-key': operationKey } : {}) },
      body: JSON.stringify(wireBody), signal,
    }), { signal });
    const data = await response.json().catch(() => null);
    if (!data) throw generationRecoveryError('阶段响应未确认，请核对原操作');
    recordChatTokens({ modelId: data.model || String(body.model || ''), type: 'chat', usage: data.usage,
      scope, operationId: operationKey || data.operationKey, success: data.success === true });
    if (!response.ok || data.success !== true) {
      if (data.submissionRejected === true) throw Object.assign(new Error(data.error || '阶段请求被拒绝'), { retryable: false, submissionRejected: true });
      throw generationRecoveryError(data.error || '阶段结果待核对，不会重新提交');
    }
    return data;
  } catch (error) {
    if (error && typeof error === 'object' && 'submissionRejected' in error) throw error;
    throw generationRecoveryError(error instanceof Error ? error.message : '阶段结果待核对');
  }
}
