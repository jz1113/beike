import { gatewayFetch } from './http';
import { normalizeImageUrlToStandardJpg } from '@shared/domain/media/drawing';

/**
 * 万邦网关的公开接口以 query 参数接收凭证。URL 只在服务端构造，且绝不能写入日志。
 */
export function withWanbangCredentials(endpoint: string, apiKey: string, apiSecret: string): string {
  const url = new URL(endpoint);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('secret', apiSecret);
  return url.toString();
}

/**
 * 万邦偶发会返回空 body 或 HTML 错误页；不要让底层 JSON.parse 错误泄露到界面。
 */
export async function parseWanbangResponse(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  const body = raw.trim();

  if (!body) {
    throw new Error(`万邦网关返回空响应（HTTP ${res.status}），请稍后重试或检查接口权限`);
  }

  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid payload');
    }
    return parsed;
  } catch {
    const contentType = res.headers.get('content-type');
    const responseKind = contentType?.includes('text/html') ? 'HTML 页面' : '非 JSON 内容';
    throw new Error(`万邦网关返回 ${responseKind}（HTTP ${res.status}），请稍后重试或检查接口权限`);
  }
}

// 辅助函数：带智能错误识别和快速失败机制的 fetch（默认最多重试 1 次，超时 7s，快速跳过不存在的商品）
// 兼容官方 query 凭证调用；禁止在日志中输出完整 URL。
export class WanbangHttpError extends Error {
  constructor(readonly status: number) {
    super(`万邦网关请求失败（HTTP ${status}）`);
    this.name = 'WanbangHttpError';
  }
}

function retryDelay(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const cancel = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, 1000);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function fetchWithRetry(
  url: string,
  apiKey: string,
  apiSecret: string,
  retries = 1,
  timeoutMs = 7000,
  signal?: AbortSignal,
): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', cancel, { once: true });
    const timeoutId = setTimeout(() => controller.abort(new DOMException('万邦采集请求超时', 'TimeoutError')), timeoutMs);
    try {
      const res = await gatewayFetch(withWanbangCredentials(url, apiKey, apiSecret), {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });
      if (!res.ok) {
        throw new WanbangHttpError(res.status);
      }
      const json = await parseWanbangResponse(res);

      // 1. 永久性错误（商品不存在、已下架、ID无效、缺少Key等）-> 立即返回失败，绝对不浪费时间重试！
      const errMsg = `${json?.error || ''} ${json?.reason || ''} ${json?.error_code || ''}`.toLowerCase();
      const isPermanentError = (
        errMsg.includes('not-found') ||
        errMsg.includes('不存在') ||
        errMsg.includes('下架') ||
        errMsg.includes('invalid') ||
        errMsg.includes('empty') ||
        errMsg.includes('apikey') ||
        ['2000', '4003', '4004', '4005', '4006', '4007', '4008', '4009', '4010', '4012', '4013', '4014', '4015', '4016'].includes(String(json?.error_code))
      );
      if (isPermanentError) {
        return json; // 秒级直接返回，绝不挂起
      }

      // 官方文档：2000 是收费的无结果响应；仅不收费的网络/服务端/超时错误重试一次。
      const isTemporaryWbError = json && ['4000', '4001', '4002', '4017', '5000'].includes(String(json.error_code));
      if (isTemporaryWbError && i < retries) {
        throw new Error(`万邦网关临时限流/繁忙(${json.reason || json.error_code})`);
      }

      return json;
    } catch (err: any) {
      if (signal?.aborted) throw signal.reason;
      if (err instanceof WanbangHttpError && err.status < 500 && err.status !== 408) throw err;
      if (i === retries) throw err;
      console.warn(`[Collect] 第 ${i + 1} 次请求万邦接口失败，将进行最后一次快速重试`);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', cancel);
    }
    await retryDelay(signal);
  }
}

// 通用图片提取器：递归穿透所有万邦可能返回的复杂数组/对象/HTML结构，并彻底去水印大图化
export function extractUrls(source: any, allowHtml = true): string[] {
  const urls: string[] = [];
  if (!source) return urls;

  if (typeof source === 'string') {
    let clean = source.trim();
    if (!clean) return urls;

    // 如果包含 HTML 标签 (例如 desc 或 desc_img 为 HTML 片段)
    if (clean.includes('<img') || clean.includes('&lt;img')) {
      if (!allowHtml) return urls;
      const imgRegex = /<img[^>]+(?:src|data-original|data-src|data-lazyload|data-ks-lazyload)=["']([^"']+)["']/gi;
      let match;
      while ((match = imgRegex.exec(clean)) !== null) {
        const u = match[1]?.trim();
        if (u) {
          const normalized = normalizeImageUrlToStandardJpg(u);
          if (normalized && !urls.includes(normalized)) urls.push(normalized);
        }
      }
      return urls;
    }

    if (clean.startsWith('//')) clean = 'https:' + clean;
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      const normalized = normalizeImageUrlToStandardJpg(clean);
      if (normalized && !urls.includes(normalized)) urls.push(normalized);
    }
    return urls;
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const subUrls = extractUrls(item, allowHtml);
      for (const u of subUrls) {
        if (u && !urls.includes(u)) urls.push(u);
      }
    }
    return urls;
  }

  if (typeof source === 'object') {
    // 优先提取直接 url 属性
    if (source.url) {
      const sub = extractUrls(source.url, allowHtml);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    if (source.pic_url) {
      const sub = extractUrls(source.pic_url, allowHtml);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    // 提取 item_img、prop_img、sku_img 嵌套
    if (source.item_img) {
      const sub = extractUrls(source.item_img, allowHtml);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    if (source.prop_img) {
      const sub = extractUrls(source.prop_img, allowHtml);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    if (source.sku) {
      const sub = extractUrls(source.sku, allowHtml);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }

    for (const [key, val] of Object.entries(source)) {
      if (!['url', 'pic_url', 'item_img', 'prop_img', 'sku', 'sku_url', 'detail_url'].includes(key)) {
        if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('//') || val.includes('<img'))) {
          const sub = extractUrls(val, allowHtml);
          for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
        } else if (typeof val === 'object' && val !== null) {
          const sub = extractUrls(val, allowHtml);
          for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
        }
      }
    }
  }

  return urls;
}
