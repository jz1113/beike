/** 检测是否已含中文（避免二次包装） */
export function hasChineseText(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/** 剥离网关或上游嵌套的 JSON 错误壳（如 `{"code":"1501","message":"..."}`），并对敏感素材提示做友好化 */
export function unwrapJsonErrorMessage(raw: string): string {
  let text = raw.trim();
  const prefixMatch = text.match(/^[^{]*failed[^{]*(\{[\s\S]+\})$/i);
  if (prefixMatch?.[1]) {
    text = prefixMatch[1].trim();
  }
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const key of ['message', 'error', 'fail_reason', 'failReason', 'reason']) {
          const value = parsed[key];
          if (typeof value === 'string' && value.trim()) {
            return unwrapJsonErrorMessage(value);
          }
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const innerMsg = (value as Record<string, unknown>).message;
            if (typeof innerMsg === 'string' && innerMsg.trim()) {
              return unwrapJsonErrorMessage(innerMsg);
            }
          }
        }
      }
    } catch {
      /* Non-JSON error text stays intact. */
    }
  }
  const lower = text.toLowerCase();
  if (lower.includes('videourls[') && (lower.includes('sensitive') || text.includes('敏感')) && !text.startsWith('参考视频未通过安全检测')) {
    return `参考视频未通过安全检测（可能包含敏感画面或真人未报备素材），请更换合规的参考视频后重试：${text}`;
  }
  if (lower.includes('imageurls[') && (lower.includes('sensitive') || text.includes('敏感')) && !text.startsWith('参考图片未通过安全检测')) {
    return `参考图片未通过安全检测（可能包含敏感内容或违规画面），请更换参考图片后重试：${text}`;
  }
  return redactSignedMediaUrls(text);
}

const ERROR_URL_PATTERN = /https?:\/\/[^\s"'<>|，。；：！？]+/gi;

function summarizeErrorMediaUrl(raw: string): { label: string; signed: boolean } | null {
  const lower = raw.toLowerCase();
  const signed =
    lower.includes('x-oss-') ||
    lower.includes('x-amz-') ||
    lower.includes('signature=') ||
    lower.includes('q-sign-') ||
    lower.includes('/seedance/refs/');
  let pathPart = raw;
  try {
    const parsed = new URL(raw);
    if (parsed.pathname) pathPart = parsed.pathname;
  } catch {
    const qIdx = pathPart.indexOf('?');
    if (qIdx >= 0) pathPart = pathPart.slice(0, qIdx);
  }
  const segments = pathPart.replace(/\/+$/, '').split('/').filter(Boolean);
  let base = segments[segments.length - 1] || '';
  try {
    const decoded = decodeURIComponent(base).trim();
    if (decoded) base = decoded;
  } catch {
    /* keep raw basename */
  }
  const dotIdx = base.lastIndexOf('.');
  const ext = dotIdx >= 0 ? base.slice(dotIdx).toLowerCase() : '';
  const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);
  const isImage = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  if (!signed && !isVideo && !isImage && raw.length < 80) {
    return null;
  }
  const kind = isVideo ? '参考视频' : isImage ? '参考图片' : '参考素材';
  const label = base && base.length <= 40 ? `【${kind}：${base}】` : `【${kind}】`;
  return { label, signed };
}

/** 折叠报错中混入的 OSS/S3 预签名长链接，保留可读文件名与后续真实错误原因 */
export function redactSignedMediaUrls(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes('http://') && !trimmed.includes('https://')) {
    return trimmed;
  }
  return trimmed
    .replace(ERROR_URL_PATTERN, (match) => {
      const clean = match.replace(/[.,;:)\]}]+$/, '');
      const suffix = match.slice(clean.length);
      const summary = summarizeErrorMediaUrl(clean);
      if (!summary) return match;
      if (clean === trimmed && summary.signed) {
        return `${summary.label}处理失败（上游仅返回临时签名链接，请检查素材合规性或对象存储访问权限后重试）`;
      }
      return `${summary.label}${suffix}`;
    })
    .trim();
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

/** Only an explicit missing-model/endpoint response proves this POST was rejected. */
export function isRetryableUpstreamStatus(status: number): boolean {
  return status === 404;
}

/** Network failures and timeouts may follow an accepted, billable request. */
export function isRetryableUpstreamError(err: unknown): boolean {
  const status = Number((err as { status?: unknown } | undefined)?.status);
  if (Number.isFinite(status)) return isRetryableUpstreamStatus(status);
  return false;
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
  if (
    lower.includes('appear to be unsafe') ||
    lower.includes('images appear to be unsafe') ||
    lower.includes('content policy') ||
    lower.includes('safety system') ||
    (lower.includes('unsafe') && lower.includes('modif'))
  ) {
    return '生图被安全审核拦截。请弱化暴露/特写措辞后重试，或改用端庄半身近景描述项链等佩戴部位。';
  }
  if (
    lower.includes('invalid image file or mode') ||
    (lower.includes('invalid image') && lower.includes('mode')) ||
    lower.includes('unsupported image mode') ||
    lower.includes('cannot identify image file')
  ) {
    return '参考图色彩模式或格式不兼容（上游要求标准 RGB 格式）。已自动优化转码；若仍提示，请尝试更换为标准 JPEG 图片后重试。';
  }
  if (lower.includes('undefined mention')) {
    return '提示词中的 @引用名与参考图不匹配。请将自定义 @ 名改为 @图片1、@图片2 等，或重新选择参考图后再试。';
  }

  return msg;
}

function humanizeGenericMessage(name: string, message: string, fallback: string): string {
  const msg = message.trim();
  const lower = msg.toLowerCase();
  const lowerName = name.toLowerCase();

  if (lowerName === 'timeouterror' || /timed out|timeout/i.test(msg)) {
    return '模型响应超时，已生成内容已保留。请稍后继续，或检查上游服务的超时设置。';
  }

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
    lower.includes('etimedout') ||
    lower.includes('did not match the expected pattern')
  ) {
    if (lower.includes('did not match the expected pattern')) {
      return '视频上传失败，请重试或换用较短的视频（建议 30s 以内）';
    }
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
  const trimmed = unwrapJsonErrorMessage(message).replace(/context deadline exceeded/gi, '上游生图超时');

  if (/上游生图超时/.test(trimmed) && !hasChineseText(message)) {
    return '上游生图超时';
  }

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
  const trimmed = unwrapJsonErrorMessage(raw);
  if (hasChineseText(trimmed)) return trimmed;
  return humanizeUpstreamMessage(humanizeGenericMessage('', trimmed, '模型渲染失败，请稍后重试'));
}
