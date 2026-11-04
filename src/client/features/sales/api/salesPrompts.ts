import { apiRequest } from '@client/shared/api/apiRequest';
import { salesPromptListSchema, salesPromptResultSchema } from '@shared/contracts/salesPrompts';

export class SalesPromptRequestError extends Error {
  constructor(message: string, readonly status: number, readonly promptId = '') { super(message); }
}

async function responseJSON(response: Response): Promise<unknown> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : response.status === 404 ? '当前服务尚未启用提示词管理，请重启贝壳服务后重试。' : '提示词请求失败，请重试';
    throw new SalesPromptRequestError(message, response.status);
  }
  return data;
}

export async function listSalesPrompts(signal?: AbortSignal) {
  const response = await apiRequest('GET', '/api/sales/prompts', { signal, cache: 'no-store' });
  return salesPromptListSchema.parse(await responseJSON(response)).prompts;
}

export async function saveSalesPrompt(id: string, prompt: string, expectedVersion: string) {
  const response = await apiRequest('PUT', '/api/sales/prompts/{id}', {
    pathParams: { id }, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, expectedVersion }),
  });
  const saved = salesPromptResultSchema.parse(await responseJSON(response)).prompt;
  if (saved.id !== id || saved.prompt !== prompt || !saved.configured) throw new Error('后台返回的提示词与本次保存不一致，请刷新核对；编辑内容已保留。');
  return saved;
}
