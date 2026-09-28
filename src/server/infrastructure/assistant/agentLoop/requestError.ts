import { isRetryableUpstreamError } from '@shared/domain/models/upstreamErrors';

/** Preserve actionable upstream failures without exposing response bodies or credentials. */
export function modelRequestError(status: number, responseText = '', retryAfter?: string | null): Error {
  const reasons: Record<number, string> = {
    400: '请求参数不被上游接受，请检查模型与接口兼容性',
    401: 'API 密钥无效或已失效',
    402: '上游账户额度不足或需要付费',
    403: '上游拒绝访问，请检查模型权限',
    404: '上游接口或模型不存在，请检查 API 地址与模型配置',
    413: '请求内容过大，请减少历史消息或附件',
    422: '上游无法处理请求参数，请检查模型与接口兼容性',
    429: '上游限流或额度受限，请查看账户状态后稍后重试',
    500: '上游服务内部错误',
    502: '上游网关异常',
    503: '上游服务暂时不可用',
    504: '上游网关等待模型响应超时',
  };
  if (status === 429) {
    // 仅用上游结构化错误分类，不将原始响应或敏感字段展示给用户。
    let detail = '';
    try {
      const body = JSON.parse(responseText);
      const error = body.error || body;
      detail = [error.code, error.type, error.message].filter(v => typeof v === 'string').join(' ');
    } catch { /* 非 JSON 错误保留通用提示 */ }
    if (/insufficient_quota|insufficient.balance|quota.exceeded|余额不足|额度不足|欠费|配额不足/i.test(detail)) {
      reasons[429] = '上游返回额度不足。请确认充值账户与当前 API 密钥所属账户一致，并检查密钥或项目的独立额度；本地重启不会刷新上游余额';
    } else if (/rate_limit|rate.limit|too many requests|concurren|并发|频率|限流/i.test(detail)) {
      reasons[429] = '上游请求频率或并发受限，充值余额不代表解除限流，请稍后重试';
    }
    if (retryAfter && /^\d+$/.test(retryAfter) && Number(retryAfter) <= 86400) {
      reasons[429] += `；上游建议等待 ${Number(retryAfter)} 秒`;
    }
  }
  const error = new Error(`模型请求失败（HTTP ${status}）：${reasons[status] || '上游未成功处理请求'}`) as Error & { status?: number };
  error.status = status;
  return error;
}

export function isRetryableModelRequestError(error: unknown): boolean {
  return isRetryableUpstreamError(error);
}
