const DEEPSEEK_ERROR_HINTS: Record<number, string> = {
  400: 'DeepSeek 请求格式有误，请检查本批请求参数',
  401: 'DeepSeek API Key 无效或已失效，请到设置中检查密钥',
  402: 'DeepSeek 账户余额不足，请检查余额或充值',
  422: 'DeepSeek 请求参数有误，请检查模型和参数配置',
  429: 'DeepSeek 请求过于频繁，请稍后重试',
  500: 'DeepSeek 服务暂时故障，请稍后重试',
  503: 'DeepSeek 服务繁忙，请稍后重试',
};

export class DeepSeekApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'DeepSeekApiError';
  }
}

function upstreamMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const error = (body as { error?: unknown }).error;
  const message = error && typeof error === 'object'
    ? (error as { message?: unknown }).message
    : typeof error === 'string' ? error : '';
  return typeof message === 'string' ? message.trim().slice(0, 300) : '';
}

export async function deepSeekResponseError(response: Response): Promise<DeepSeekApiError> {
  let detail = '';
  try { detail = upstreamMessage(await response.json()); }
  catch { /* Some gateway errors do not contain JSON. */ }
  const hint = DEEPSEEK_ERROR_HINTS[response.status] || 'DeepSeek 请求失败，请稍后重试';
  return new DeepSeekApiError(response.status, detail ? `${hint}。接口原因：${detail}` : hint);
}
