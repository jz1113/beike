import { apiFetch } from '@client/shared/api/apiClient';
import { credentialGet } from '@client/shared/api/credentialClient';
import { KeywordReviewRowSchema } from '@shared/contracts/generate';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';

/** Reject invalid source rows before any paid batch in this run is dispatched. */
export function validateReviewInputs(rows: KeywordReviewRecord[]): void {
  const labels: Record<string, string> = { id: '行标识', query: '关键词', expansion: '相关拓展词', entityExpansion: '实体拓展词', contentType: '内容类型' };
  for (const row of rows) {
    const parsed = KeywordReviewRowSchema.safeParse(row);
    if (parsed.success && row.query.trim()) continue;
    const issue = parsed.success ? undefined : parsed.error.issues[0];
    const field = labels[String(issue?.path[0] || 'query')] || '输入内容';
    const detail = issue?.code === 'too_big' ? `超过 ${issue.maximum} 字符上限` : '为空或格式无效';
    throw new Error(`工作表“${row.sheetName}”第 ${row.rowNumber.toLocaleString('en-US')} 行的${field}${detail}；请修改原表后重新导入，本轮尚未提交模型`);
  }
}

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
