import { apiFetch } from '@/lib/apiClient';
import { getExternalScraperCredentials } from '@/lib/externalScraperCredentials';

/**
 * 解析单条小红书等对标笔记链接中的图片列表
 */
export async function parseSingleRefLink(refUrl: string): Promise<string[]> {
  if (!refUrl.trim()) return [];
  try {
    const { scraperId, scraperSecret } = await getExternalScraperCredentials();
    const res = await apiFetch('/api/catalog/styles/parse-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: refUrl.trim(), scraperId, scraperSecret }),
    });
    const data = await res.json();
    if (res.ok && data.success && data.data) {
      const imgs = Array.isArray(data.data.images) ? data.data.images : [];
      if (data.data.cover && !imgs.includes(data.data.cover)) imgs.unshift(data.data.cover);
      return imgs.filter(Boolean);
    }
  } catch (e) {
    console.warn('解析对标链接异常:', e);
  }
  return [];
}
