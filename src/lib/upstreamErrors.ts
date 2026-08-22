/**
 * 将上游绘图网关英文错误转为可操作的中文提示
 */
export function humanizeUpstreamError(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '模型渲染失败，请稍后重试';
  const msg = raw.trim();
  const lower = msg.toLowerCase();

  if (lower.includes('no available compatible accounts')) {
    return 'GPT Image 通道暂无可用账号（上游账号池已满或未开通）。请改用 Seedream 5.0 / Grok，或联系 API 服务商开通该模型分组。';
  }
  if (lower.includes('argument not supported') && lower.includes('size')) {
    return '当前模型不支持 size 参数，请更新应用后重试；若仍失败请联系技术支持。';
  }
  if (msg.includes('未返回图片数据') || lower.includes('no image data')) {
    return '上游未返回图片数据。请确认模型 ID 与 API 文档一致，或更换模型后重试。';
  }
  if (lower.includes('invalid api key') || lower.includes('incorrect api key') || lower.includes('unauthorized')) {
    return 'API Key 无效或未授权。请在设置中检查密钥是否正确。';
  }
  if (lower.includes('insufficient') && lower.includes('quota')) {
    return 'API 账户余额或配额不足，请充值后重试。';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return '请求过于频繁，请稍后再试。';
  }

  return msg;
}
