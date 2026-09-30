import { normalizeImageUrlToStandardJpg, isProductImageUrl } from '@shared/domain/media/drawing';

export type ProductPlatform = 'jd' | 'taobao' | '1688' | 'pinduoduo';
export type CollectionFailure = { error: string; status: number; upstreamCode?: string | number; stop?: boolean; retryable?: boolean };

const ID_RE = /^\d{7,20}$/;
const RATE_LIMIT_RE = /请求次数频繁|请勿使用盗版|操作过于频繁|请稍后再试|验证码|安全验证|风控拦截|(?:请求|访问).*(?:频率|次数).*(?:限|超|频繁)|rate.?limit|call.?limit/i;

function hostMatches(host: string, root: string) {
  return host === root || host.endsWith(`.${root}`);
}

function platformFromHost(host: string): ProductPlatform | undefined {
  if (['jd.com', '360buy.com', '3.cn'].some(root => hostMatches(host, root))) return 'jd';
  if (['taobao.com', 'tmall.com', 'tb.cn'].some(root => hostMatches(host, root))) return 'taobao';
  if (hostMatches(host, '1688.com')) return '1688';
  if (['yangkeduo.com', 'pinduoduo.com'].some(root => hostMatches(host, root))) return 'pinduoduo';
  return undefined;
}

/** 只接受明确的商品 ID 或平台详情链接，避免从文案、追踪参数中误取数字后付费采集。 */
export function resolveProductInput(body: Record<string, unknown>):
  | { success: true; platform: ProductPlatform; itemId: string; forceRefresh: boolean }
  | { success: false; error: string } {
  const requested = typeof body.platform === 'string' ? body.platform.trim().toLowerCase() : 'auto';
  const normalized = requested === 'tmall' ? 'taobao' : requested || 'auto';
  if (!['auto', 'jd', 'taobao', '1688', 'pinduoduo'].includes(normalized)) {
    return { success: false, error: '不支持该商品平台，请选择京东、淘宝/天猫、1688 或拼多多' };
  }
  for (const name of ['force_refresh', 'forceRefresh']) {
    if (body[name] !== undefined && typeof body[name] !== 'boolean') {
      return { success: false, error: '强制刷新参数必须为布尔值' };
    }
  }
  const input = [body.url, body.num_iid, body.itemId, body.id]
    .find(value => (typeof value === 'string' && value.trim()) || (typeof value === 'number' && Number.isSafeInteger(value)));
  const raw = String(input ?? '').trim();
  const forceRefresh = (body.force_refresh ?? body.forceRefresh ?? false) as boolean;
  if (ID_RE.test(raw)) {
    return { success: true, platform: normalized === 'auto' ? 'jd' : normalized as ProductPlatform, itemId: raw, forceRefresh };
  }
  const matches = raw.match(/https?:\/\/[^\s"'<>，。；）)\]]+/gi) || [];
  if (matches.length > 1) return { success: false, error: '每次请传入一个商品链接，多个链接请使用批量采集' };
  let url: URL;
  try {
    const candidate = (matches[0] || raw).replace(/[，。；）)\]]+$/, '');
    url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
  } catch {
    return { success: false, error: '请输入有效的商品 ID 或商品详情链接' };
  }
  const detected = platformFromHost(url.hostname.toLowerCase());
  if (!detected || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
    return { success: false, error: '未识别到支持的商品详情链接，请输入京东、淘宝/天猫、1688 或拼多多链接' };
  }
  if (normalized !== 'auto' && normalized !== detected) {
    return { success: false, error: '所选平台与商品链接不一致，请切换平台或使用自动识别' };
  }
  if (['3.cn', 'tb.cn'].some(root => hostMatches(url.hostname.toLowerCase(), root)) || hostMatches(url.hostname.toLowerCase(), 'u.jd.com')) {
    return { success: false, error: '商品分享短链不包含可靠的商品 ID，请先在浏览器展开后复制完整详情链接' };
  }
  const keys = detected === 'jd' ? ['skuId', 'sku', 'wareId', 'itemId', 'item_id']
    : detected === 'pinduoduo' ? ['goods_id', 'goodsId'] : ['id', 'itemId', 'item_id'];
  let itemId = keys.map(key => url.searchParams.get(key)).find(value => value && ID_RE.test(value)) || '';
  if (!itemId && detected === 'jd') itemId = url.pathname.match(/^\/(?:product\/)?(\d{7,20})(?:\.html?)?\/?$/i)?.[1] || '';
  if (!itemId && detected === '1688') itemId = url.pathname.match(/^\/offer\/(\d{7,20})(?:\.html?)?\/?$/i)?.[1] || '';
  if (!ID_RE.test(itemId)) {
    return { success: false, error: '链接中未找到商品 ID。请复制完整商品详情链接，或选择平台后输入商品 ID（短链请先在浏览器展开）' };
  }
  return { success: true, platform: detected, itemId, forceRefresh };
}

/** 商品素材必须是远程静态图片，缓存与新采集结果使用相同判定。 */
export function cleanProductImages(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.flatMap(value => {
    if (typeof value !== 'string') return [];
    const normalized = normalizeImageUrlToStandardJpg(value);
    try {
      const url = new URL(normalized);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          /\.(?:mp4|mov|m4v|webm|avi|flv|m3u8|html?)(?:[/?#!]|$)/i.test(url.pathname) ||
          !isProductImageUrl(normalized)) return [];
      return [normalized];
    } catch {
      return [];
    }
  }))];
}

export function productTitleFailure(title: string): CollectionFailure | undefined {
  return RATE_LIMIT_RE.test(title)
    ? { error: '电商采集接口触发上游频控或安全验证，请降低并发或稍后重试', status: 429, stop: true, retryable: false }
    : undefined;
}

export function wanbangFailure(data: Record<string, unknown>): CollectionFailure {
  const item = data.item && typeof data.item === 'object' ? data.item as Record<string, unknown> : {};
  const code = typeof data.error_code === 'string' || typeof data.error_code === 'number' ? data.error_code : undefined;
  const message = [data.reason, data.error, item.error].filter(value => typeof value === 'string').join('；');
  const value = String(code);
  if (value === '2000') return { error: '该商品未返回查询结果，请检查商品是否存在或已下架', status: 404, upstreamCode: code, stop: true, retryable: false };
  if (['4008', '4013'].includes(value) || RATE_LIMIT_RE.test(message)) {
    return { error: '万邦采集接口请求受限，请稍后重试', status: 429, upstreamCode: code, stop: true, retryable: false };
  }
  if (value === '4016' || /余额|扣费|次数不足|配额/i.test(message)) {
    return { error: '万邦接口余额或调用配额不足，请检查服务接口配置', status: 402, upstreamCode: code, stop: true, retryable: false };
  }
  if (['4003', '4004', '4005', '4007', '4012', '4014', '4015'].includes(value) || /apikey|api key|secret|密钥|权限/i.test(message)) {
    return { error: '万邦接口凭证、参数或权限异常，请检查服务接口配置', status: 400, upstreamCode: code, stop: true, retryable: false };
  }
  if (['4006', '4009', '4010'].includes(value)) {
    return { error: value === '4009' ? '万邦接口维护中，请稍后重试' : '万邦接口未开通或已停用，请检查服务接口配置',
      status: 503, upstreamCode: code, stop: true, retryable: value === '4009' };
  }
  if (/not.?found|不存在|下架|无效.*(?:id|商品)|invalid.*(?:id|item)/i.test(message)) {
    return { error: '商品不存在、已下架或商品 ID 无效，请检查输入', status: 404, upstreamCode: code, stop: true, retryable: false };
  }
  if (value === '4017') return { error: '万邦采集接口超时，请稍后重试', status: 504, upstreamCode: code, retryable: true };
  return { error: '万邦接口未返回有效的商品图片，请检查商品链接或稍后重试', status: 502, upstreamCode: code };
}
