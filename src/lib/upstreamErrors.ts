/** 检测是否已含中文（避免二次包装） */
export function hasChineseText(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function extractErrorMessage(err: unknown): { name: string; message: string } {
  if (err instanceof Error) {
    return { name: err.name || '', message: err.message || '' };
  }
  if (typeof err === 'string') {
    return { name: '', message: err };
  }
  if (err && typeof err === 'object') {
    const obj = err as { name?: string; message?: string; error?: string };
    return {
      name: String(obj.name || ''),
      message: String(obj.message || obj.error || err),
    };
  }
  return { name: '', message: String(err ?? '') };
}

function humanizeUpstreamMessage(raw: string): string {
  const msg = raw.trim();
  if (!msg) return '操作失败，请稍后重试';
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
  if (
    lower.includes('invalid api key') ||
    lower.includes('incorrect api key') ||
    (lower.includes('unauthorized') && !hasChineseText(msg))
  ) {
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

function humanizeGenericMessage(name: string, message: string, fallback: string): string {
  const msg = message.trim();
  const lower = msg.toLowerCase();
  const lowerName = name.toLowerCase();

  if (lowerName === 'aborterror' || /aborted/i.test(msg)) {
    if (/视觉|分镜|vision/i.test(msg) || hasChineseText(msg)) {
      return msg || '视觉模型响应超时，请稍后重试或换用 Flash 极速模型';
    }
    return '请求超时，请稍后重试';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('network request failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout')
  ) {
    return '网络连接失败，请检查网络或 API 地址';
  }

  const httpStatusMatch =
    msg.match(/HTTP error! status:\s*(\d+)/i) ||
    msg.match(/fetch failed:\s*(\d+)/i) ||
    msg.match(/\bHTTP\s+(\d{3})\b/i);
  if (httpStatusMatch) {
    return `服务请求失败（HTTP ${httpStatusMatch[1]}）`;
  }

  const modelHttpMatch = msg.match(/Model\s+\[[^\]]+\]\s+HTTP\s+(\d+)/i);
  if (modelHttpMatch) {
    return `模型调用失败（HTTP ${modelHttpMatch[1]}）`;
  }

  if (lower.includes('forbidden') || /\b403\b/.test(msg)) {
    return '无权限执行此操作';
  }

  if (lower.includes('not found') || /\b404\b/.test(msg)) {
    return '请求的资源不存在';
  }

  if (msg === 'Invalid URL') return 'URL 无效';
  if (msg === 'Only http(s) URLs allowed') return '仅允许 http 或 https 协议的 URL';
  if (msg === 'Only https URLs allowed in production') return '生产环境仅允许 https 协议的 URL';
  if (msg.startsWith('Host not allowed')) {
    return msg.includes(':') ? `不允许访问该主机：${msg.split(':').slice(1).join(':').trim()}` : '不允许访问该主机';
  }
  if (msg === 'Resolved to private IP') return '目标地址解析为内网 IP，不允许访问';
  if (msg === 'DNS lookup failed for host') return '域名解析失败，请检查 URL 是否正确';

  if (/internal server error/i.test(msg)) {
    return '服务器内部错误，请稍后重试';
  }

  if (!msg) return fallback;
  return msg;
}

/**
 * 统一将异常/错误转为用户可见的中文提示
 */
export function formatUserError(err: unknown, fallback = '操作失败，请稍后重试'): string {
  const { name, message } = extractErrorMessage(err);
  const trimmed = message.trim();

  if (trimmed && hasChineseText(trimmed)) {
    return trimmed;
  }

  const generic = humanizeGenericMessage(name, trimmed, fallback);
  if (generic !== trimmed) {
    return generic;
  }

  const upstream = humanizeUpstreamMessage(generic);
  return upstream || fallback;
}

/** @deprecated 请改用 formatUserError */
export function humanizeUpstreamError(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '模型渲染失败，请稍后重试';
  const trimmed = raw.trim();
  if (hasChineseText(trimmed)) return trimmed;
  return humanizeUpstreamMessage(humanizeGenericMessage('', trimmed, '模型渲染失败，请稍后重试'));
}
