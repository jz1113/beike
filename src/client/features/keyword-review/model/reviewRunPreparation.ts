import { apiFetch } from '@client/shared/api/apiClient';
import { credentialGet } from '@client/shared/api/credentialClient';

/** Read local credentials and the rule version before creating a paid request. */
export async function prepareReviewRun(
  route: { provider: 'deepseek' | 'gateway'; apiKey?: string; keySource: 'deepseek' | 'channel' | 'gateway' },
  lockedVersion: number | null,
) {
  let apiKey = route.apiKey?.trim() || '';
  if (!apiKey && route.keySource === 'deepseek') {
    apiKey = (await credentialGet('deepseek_api_key')).trim();
  } else if (!apiKey && route.keySource === 'gateway') {
    apiKey = (await credentialGet('ai_api_key')).trim();
  }
  if (!apiKey) throw new Error(route.provider === 'deepseek'
    ? '未配置 DeepSeek API Key，请到设置里的 DeepSeek 官方服务填写'
    : route.keySource === 'channel'
      ? '未配置该网关的 API Key，请到设置里的对应服务商填写'
      : '未配置模型网关 API Key，请到设置里的大模型网关填写');
  if (lockedVersion !== null) return { apiKey, rulesVersion: lockedVersion };
  try {
    const response = await apiFetch('/api/generate/keyword-review/rules', { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error('读取审核规则失败');
    const rules = await response.json() as { current?: { version?: number } };
    const version = rules.current?.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) throw new Error('审核规则版本异常');
    return { apiKey, rulesVersion: version };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new Error('读取审核规则超时，未发起审核请求，请重试');
    throw error;
  }
}
