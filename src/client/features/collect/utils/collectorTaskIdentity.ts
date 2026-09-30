import type { BatchTaskItem } from './collectorTypes';

export const COLLECTOR_BATCH_LIMIT = 500;

/** Only collapse known entity links. Unresolved short links retain their full URL. */
export function collectorTaskIdentity(raw: string, platform: BatchTaskItem['platform']): string {
  const value = raw.trim();
  if (/^\d{7,20}$/.test(value) && platform !== 'social') return `${platform}:${value}`;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const matches = (...domains: string[]) => domains.some(domain => host === domain || host.endsWith(`.${domain}`));
    const numeric = (keys: string[]) => keys.map(key => url.searchParams.get(key) || '').find(id => /^\d{7,20}$/.test(id));
    let id: string | undefined;
    if (platform === 'jd' && matches('jd.com', '360buy.com')) {
      id = numeric(['skuId', 'sku', 'wareId', 'itemId', 'item_id'])
        || url.pathname.match(/^\/(?:product\/)?(\d{7,20})(?:\.html?)?\/?$/i)?.[1];
    } else if (platform === 'taobao' && matches('taobao.com', 'tmall.com')) id = numeric(['id', 'itemId', 'item_id']);
    else if (platform === '1688' && matches('1688.com')) {
      id = numeric(['id', 'itemId', 'item_id']) || url.pathname.match(/^\/offer\/(\d{7,20})\.html?$/i)?.[1];
    } else if (platform === 'pinduoduo' && matches('pinduoduo.com', 'yangkeduo.com')) id = numeric(['goods_id', 'goodsId']);
    else if (platform === 'social') {
      if (matches('xiaohongshu.com')) id = url.pathname.match(/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/i)?.[1];
      else if (matches('douyin.com', 'iesdouyin.com')) id = url.pathname.match(/^\/(?:video|note|share\/video)\/(\d{7,20})\/?$/i)?.[1];
      else if (matches('bilibili.com')) id = url.pathname.match(/^\/video\/((?:BV[\da-z]+|av\d+))\/?$/i)?.[1];
      // Social platforms may reuse numeric IDs, so include the source domain family.
      if (id) return `social:${matches('xiaohongshu.com') ? 'xhs' : matches('bilibili.com') ? 'bilibili' : 'douyin'}:${id}`;
    }
    if (id) return `${platform}:${id}`;
  } catch { /* Invalid values are rejected by the input/transport validation. */ }
  return `${platform}:url:${value}`;
}
