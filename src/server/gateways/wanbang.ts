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
// 万邦要求 key/secret 位于 query；调用方禁止记录最终请求 URL。
export async function fetchWithRetry(
  url: string,
  apiKey: string,
  apiSecret: string,
  retries = 1,
  timeoutMs = 7000,
): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await gatewayFetch(withWanbangCredentials(url, apiKey, apiSecret), {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`万邦网关请求失败（HTTP ${res.status}）`);
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
        json?.error_code === '4000'
      );
      if (isPermanentError) {
        return json; // 秒级直接返回，绝不挂起
      }

      // 2. 临时性网络/网关限流错误（4001 限流、5000 繁忙、2000 超时）-> 允许重试 1 次
      const isTemporaryWbError = json && (
        json.error_code === '4001' || // 访问频率受限 / API Call limit
        json.error_code === '5000' || // 服务商网关繁忙
        json.error_code === '2000'    // 上游数据拉取超时
      );
      if (isTemporaryWbError && i < retries) {
        throw new Error(`万邦网关临时限流/繁忙(${json.reason || json.error_code})`);
      }

      return json;
    } catch (err: any) {
      if (i === retries) throw err;
      console.warn(`[Collect] 第 ${i + 1} 次请求万邦接口抖动(${err.message})，将在 1000ms 后进行最后一次快速重试...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// 通用图片提取器：递归穿透所有万邦可能返回的复杂数组/对象/HTML结构，并彻底去水印大图化
export function extractUrls(source: any): string[] {
  const urls: string[] = [];
  if (!source) return urls;

  if (typeof source === 'string') {
    let clean = source.trim();
    if (!clean) return urls;

    // 如果包含 HTML 标签 (例如 desc 或 desc_img 为 HTML 片段)
    if (clean.includes('<img') || clean.includes('&lt;img')) {
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
      const subUrls = extractUrls(item);
      for (const u of subUrls) {
        if (u && !urls.includes(u)) urls.push(u);
      }
    }
    return urls;
  }

  if (typeof source === 'object') {
    // 优先提取直接 url 属性
    if (source.url) {
      const sub = extractUrls(source.url);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    if (source.pic_url) {
      const sub = extractUrls(source.pic_url);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    // 提取 item_img、prop_img、sku_img 嵌套
    if (source.item_img) {
      const sub = extractUrls(source.item_img);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    if (source.prop_img) {
      const sub = extractUrls(source.prop_img);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    if (source.sku) {
      const sub = extractUrls(source.sku);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }

    for (const [key, val] of Object.entries(source)) {
      if (!['url', 'pic_url', 'item_img', 'prop_img', 'sku', 'sku_url', 'detail_url'].includes(key)) {
        if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('//') || val.includes('<img'))) {
          const sub = extractUrls(val);
          for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
        } else if (typeof val === 'object' && val !== null) {
          const sub = extractUrls(val);
          for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
        }
      }
    }
  }

  return urls;
}
