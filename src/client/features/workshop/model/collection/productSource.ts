import type { BatchProductItem } from '../batchTypes';

export function workshopProductSource(item: Pick<BatchProductItem, 'platform' | 'itemId' | 'url'>): string | null {
  if (item.platform === 'local') return null;
  if (item.url) {
    try {
      const url = new URL(item.url);
      if (!url.username && !url.password && (url.protocol === 'http:' || url.protocol === 'https:')
        && /(^|\.)(jd\.com|taobao\.com|tmall\.com|1688\.com)$/.test(url.hostname)) return url.href;
    } catch { /* Build a canonical source only when a numeric ID is available. */ }
  }
  if (!/^\d+$/.test(item.itemId)) return null;
  const id = item.itemId;
  if (item.platform === 'jd') return `https://item.jd.com/${id}.html`;
  if (item.platform === '1688') return `https://detail.1688.com/offer/${id}.html`;
  if (item.platform === 'tmall') return `https://detail.tmall.com/item.htm?id=${id}`;
  return `https://item.taobao.com/item.htm?id=${id}`;
}
