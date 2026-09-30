import { apiFetch } from '@client/shared/api/apiClient';
import { credentialGet } from '@client/shared/api/credentialClient';

/** Read local credentials and the rule version before creating a paid request. */
export async function prepareReviewRun(provider: 'deepseek' | 'gateway', lockedVersion: number | null) {
  const apiKey = (await credentialGet(provider === 'deepseek' ? 'deepseek_api_key' : 'ai_api_key')).trim();
  if (!apiKey) throw new Error(provider === 'deepseek'
    ? '未配置 DeepSeek API Key，请到设置里的 DeepSeek 官方服务填写'
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
