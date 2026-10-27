import type { BatchProductItem } from '../batchTypes';

/** Accept a product URL or a bare JD SKU; never infer an SKU from arbitrary prose. */
export function parseWorkshopProduct(line: string): Pick<BatchProductItem, 'platform' | 'itemId' | 'url'> | null {
  const text = line.trim();
  if (/^\d{7,16}$/.test(text)) return { platform: 'jd', itemId: text };
  const match = text.match(/https?:\/\/[^\s<>"“”]+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0].replace(/[）)，。]+$/, ''));
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const domain = (value: string) => host === value || host.endsWith(`.${value}`);
    const platform = domain('jd.com') ? 'jd' : domain('1688.com') ? '1688'
      : domain('tmall.com') ? 'tmall' : domain('taobao.com') || domain('tb.cn') ? 'taobao' : null;
    if (!platform) return null;
    const queryId = ['id', 'itemId', 'item_id'].map(key => url.searchParams.get(key)).find(value => value && /^\d+$/.test(value));
    const pathId = url.pathname.match(/(?:\/offer\/|\/)(\d{5,20})(?:\.html|\/|$)/)?.[1];
    return { platform, itemId: queryId || pathId || url.href, url: url.href };
  } catch { return null; }
}
