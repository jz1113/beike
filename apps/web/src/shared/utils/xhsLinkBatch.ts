import { apiFetch } from '@/shared/api/apiClient';
import { mapWithConcurrency } from '@beike/domain/asyncPool';
import {
  MAX_IMAGES_PER_SET,
  MIN_IMAGES_PER_SET,
} from '@beike/domain/assetDeconstruct/prompts';
import { RateLimiter } from '@/shared/utils/rateLimiter';
import type { ImageSetQueueItem } from '@/shared/types/imageSetQueue';
import { parseXhsUrlsFromText } from './xhsLinkFormatting';

export { formatXhsLinksToOnePerLine, parseXhsUrlsFromText } from './xhsLinkFormatting';



export interface ParseLinkMedia {
  title?: string;
  author?: string;
  description?: string;
  cover?: string;
  video?: string | null;
  videos?: string[];
  images?: string[];
}

export interface XhsParseSkipRecord {
  url: string;
  reason: string;
  kind: 'failed' | 'filtered';
}

export interface XhsParseProgress {
  current: number;
  total: number;
  success: number;
  filtered: number;
  failed: number;
  skipped?: number;
}

export interface XhsParseResult {
  queueItems: ImageSetQueueItem[];
  skipped: XhsParseSkipRecord[];
}

/** 解析 parse-link 返回的媒体对象，过滤视频与不足 3 张图的笔记 */
export function filterParseLinkImages(
  media: ParseLinkMedia,
  sourceUrl: string
): { ok: true; images: string[]; title: string; author: string } | { ok: false; reason: string } {
  const isVideoUrl = (u: string) => /\.(mp4|mov|m4v|webm|avi|flv)(\?|#|$)/i.test(u);
  const rawImages: string[] = Array.isArray(media.images)
    ? media.images.filter((u) => Boolean(u) && !isVideoUrl(u))
    : [];

  if (media.cover && !rawImages.includes(media.cover) && !isVideoUrl(media.cover)) {
    rawImages.unshift(media.cover);
  }

  if (media.video || rawImages.length === 0) {
    return { ok: false, reason: '视频作品或无图（已跳过）' };
  }
  if (rawImages.length < MIN_IMAGES_PER_SET) {
    return { ok: false, reason: `图片数不足 ${MIN_IMAGES_PER_SET} 张（当前 ${rawImages.length} 张，已跳过）` };
  }

  return {
    ok: true,
    images: rawImages.slice(0, MAX_IMAGES_PER_SET),
    title: media.title ? media.title.slice(0, 40) : '',
    author: media.author || '',
  };
}

export function toXhsQueueItem(
  filtered: { images: string[]; title: string; author: string },
  sourceUrl: string,
  index: number,
  apiUsed?: string,
): ImageSetQueueItem {
  return {
    id: `xhs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: filtered.title || `小红书图集_${index + 1}`,
    images: filtered.images,
    sourceUrl,
    author: filtered.author,
    status: 'pending',
    apiUsed,
  };
}

/** 单条链接 parse-link（含 429 退避，最多 2 次尝试） */
export async function fetchParseLinkWithRateLimit(
  url: string,
  scraperId: string | undefined,
  scraperSecret: string | undefined,
  rateLimiter: RateLimiter,
  extra?: { qiyunAppId?: string; qiyunAppKey?: string }
): Promise<{ success: true; media: ParseLinkMedia; apiUsed?: string } | { success: false; error: string }> {
  const qiyunAppId =
    extra?.qiyunAppId ||
    (typeof window !== 'undefined' ? (localStorage.getItem('qiyun_app_id') || '').trim() || undefined : undefined);
  const qiyunAppKey =
    extra?.qiyunAppKey ||
    (typeof window !== 'undefined' ? (localStorage.getItem('qiyun_app_key') || '').trim() || undefined : undefined);

  for (let attempt = 0; attempt < 2; attempt++) {
    await rateLimiter.acquire();
    try {
      const res = await apiFetch('/api/catalog/styles/parse-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          scraperId,
          scraperSecret,
          qiyunAppId,
          qiyunAppKey,
        }),
      });

      if (res.status === 429) {
        rateLimiter.triggerBackoff(1200);
        continue;
      }

      const data = await res.json().catch(() => ({}));
      if (data.success && data.data) {
        return { success: true, media: data.data as ParseLinkMedia, apiUsed: data.apiUsed };
      }
      return { success: false, error: data.error || '解析接口无有效数据' };
    } catch (e: unknown) {
      if (attempt === 1) {
        const msg = e instanceof Error ? e.message : '网络连接异常';
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: '解析请求失败' };
}

/** 批量解析小红书链接为反推队列项 */
export async function batchParseXhsLinks(
  rawText: string,
  scraperId: string | undefined,
  scraperSecret: string | undefined,
  opts?: {
    concurrency?: number;
    onProgress?: (progress: XhsParseProgress) => void;
    qiyunAppId?: string;
    qiyunAppKey?: string;
  }
): Promise<XhsParseResult> {
  const candidateUrls = parseXhsUrlsFromText(rawText);
  if (candidateUrls.length === 0) {
    return { queueItems: [], skipped: [] };
  }

  const rateLimiter = new RateLimiter(8.5);
  const queueItems: ImageSetQueueItem[] = [];
  const skipped: XhsParseSkipRecord[] = [];
  const concurrency = Math.min(opts?.concurrency ?? 8, candidateUrls.length);
  let completed = 0;

  await mapWithConcurrency(candidateUrls, concurrency, async (url) => {
    const parsed = await fetchParseLinkWithRateLimit(url, scraperId, scraperSecret, rateLimiter, {
      qiyunAppId: opts?.qiyunAppId,
      qiyunAppKey: opts?.qiyunAppKey,
    });
    if (parsed.success) {
      const filtered = filterParseLinkImages(parsed.media, url);
      if (filtered.ok) {
        queueItems.push(toXhsQueueItem(filtered, url, queueItems.length, parsed.apiUsed));
      } else {
        skipped.push({ url, reason: filtered.reason, kind: 'filtered' });
      }
    } else {
      skipped.push({ url, reason: parsed.error, kind: 'failed' });
    }

    completed += 1;
    opts?.onProgress?.({
      current: completed,
      total: candidateUrls.length,
      success: queueItems.length,
      filtered: skipped.filter((item) => item.kind === 'filtered').length,
      failed: skipped.filter((item) => item.kind === 'failed').length,
      skipped: skipped.length,
    });
  });

  return { queueItems, skipped };
}

/** 社媒单条 parse-link（带限流，供采集弹窗等复用） */
export async function parseSocialLinkWithRateLimit(
  url: string,
  scraperId: string | undefined,
  scraperSecret: string | undefined,
  rateLimiter?: RateLimiter
): Promise<{ success: true; data: ParseLinkMedia } | { success: false; error: string }> {
  const limiter = rateLimiter ?? new RateLimiter(8.5);
  const result = await fetchParseLinkWithRateLimit(url, scraperId, scraperSecret, limiter);
  if (!result.success) return result;
  const media = result.media;
  const images = Array.isArray(media.images) ? media.images.filter(Boolean) : [];
  if (media.cover && !images.includes(media.cover)) {
    images.unshift(media.cover);
  }
  return { success: true, data: { ...media, images } };
}
