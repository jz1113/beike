import { apiFetch } from '@client/shared/api/apiClient';
import { mapWithConcurrency } from '@shared/domain/core/asyncPool';
import {
  MIN_IMAGES_PER_SET,
} from '@shared/domain/assets/asset-deconstruct/prompts';
import { RateLimiter } from '@client/shared/utils/rateLimiter';
import type { PreferredScraper } from '@client/shared/utils/externalScraperCredentials';
import type { ImageSetQueueItem } from '@client/types/imageSetQueue';
import { parseXhsUrlsFromText } from './xhsLinkFormatting';

export { formatXhsLinksToOnePerLine, parseXhsUrlsFromText } from './xhsLinkFormatting';



export interface ParseLinkMedia {
  title?: string;
  author?: string;
  description?: string;
  cover?: string;
  video?: string | null;
  videos?: string[];
  livePhotos?: string[];
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

/** 解析 parse-link 返回的媒体对象，过滤视频与不足 4 张图的笔记 */
export function filterParseLinkImages(
  media: ParseLinkMedia
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

  const completeCount = Math.floor(rawImages.length / MIN_IMAGES_PER_SET) * MIN_IMAGES_PER_SET;
  return {
    ok: true,
    images: rawImages.slice(0, completeCount),
    title: media.title ? media.title.slice(0, 40) : '',
    author: media.author || '',
  };
}

export function toXhsQueueItems(
  filtered: { images: string[]; title: string; author: string },
  sourceUrl: string,
  index: number,
  apiUsed?: string,
): ImageSetQueueItem[] {
  const groups: string[][] = [];
  for (let i = 0; i + MIN_IMAGES_PER_SET <= filtered.images.length; i += MIN_IMAGES_PER_SET) {
    groups.push(filtered.images.slice(i, i + MIN_IMAGES_PER_SET));
  }
  const baseTitle = filtered.title || `小红书图集_${index + 1}`;
  return groups.map((images, groupIndex) => ({
    id: `xhs_${Date.now()}_${groupIndex}_${Math.random().toString(36).slice(2, 7)}`,
    name: groups.length > 1 ? `${baseTitle} · 组 ${groupIndex + 1}` : baseTitle,
    images,
    sourceUrl,
    author: filtered.author,
    status: 'pending',
    apiUsed,
  }));
}

export interface ParseLinkRequestOptions {
  qiyunAppId?: string;
  qiyunAppKey?: string;
  preferredScraper?: PreferredScraper;
  shouldStop?: () => boolean;
  signal?: AbortSignal;
  onSubmitted?: () => void;
}

/** 单条解析：限流后再确认派发，网络异常不自动重新提交付费请求。 */
export async function fetchParseLinkWithRateLimit(
  url: string,
  scraperId: string | undefined,
  scraperSecret: string | undefined,
  rateLimiter: RateLimiter,
  extra?: ParseLinkRequestOptions,
  signal?: AbortSignal,
): Promise<{ success: true; media: ParseLinkMedia; apiUsed?: string } | { success: false; error: string }> {
  const requestSignal = signal || extra?.signal;
  const readStoredCredential = (key: string) => {
    try { return typeof window !== 'undefined' ? localStorage.getItem(key)?.trim() || undefined : undefined; }
    catch { return undefined; }
  };
  const qiyunAppId = extra?.qiyunAppId || readStoredCredential('qiyun_app_id');
  const qiyunAppKey = extra?.qiyunAppKey || readStoredCredential('qiyun_app_key');
  const checkDispatch = () => {
    requestSignal?.throwIfAborted();
    if (extra?.shouldStop?.()) throw new DOMException('已停止派发采集请求', 'AbortError');
  };
  checkDispatch();
  await rateLimiter.acquire(requestSignal);
  checkDispatch();
  try {
    extra?.onSubmitted?.();
    const preferredScraper = extra?.preferredScraper;
    const res = await apiFetch('/api/catalog/styles/parse-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: requestSignal,
      body: JSON.stringify({ url, scraperId, scraperSecret, qiyunAppId, qiyunAppKey, preferredScraper }),
    });
    requestSignal?.throwIfAborted();
    const data = await res.json().catch(() => ({}));
    requestSignal?.throwIfAborted();
    if (res.status === 429) rateLimiter.triggerBackoff(1200);
    if (res.ok && data.success && data.data) {
      return { success: true, media: data.data as ParseLinkMedia, apiUsed: data.apiUsed };
    }
    return { success: false, error: data.error || `解析接口无有效数据（HTTP ${res.status}）` };
  } catch (error) {
    requestSignal?.throwIfAborted();
    return { success: false, error: error instanceof Error ? error.message : '网络连接异常，请检查结果后再手动重试' };
  }
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
      const filtered = filterParseLinkImages(parsed.media);
      if (filtered.ok) {
        queueItems.push(...toXhsQueueItems(filtered, url, queueItems.length, parsed.apiUsed));
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

/** 社媒单条 parse-link；兼容已有 options 与显式 AbortSignal 调用。 */
export async function parseSocialLinkWithRateLimit(
  url: string,
  scraperId: string | undefined,
  scraperSecret: string | undefined,
  rateLimiter?: RateLimiter,
  optionsOrSignal?: ParseLinkRequestOptions | AbortSignal,
  extra?: ParseLinkRequestOptions,
): Promise<{ success: true; data: ParseLinkMedia; apiUsed?: string } | { success: false; error: string }> {
  const isSignal = optionsOrSignal && 'aborted' in optionsOrSignal;
  const options = isSignal ? { ...extra, signal: optionsOrSignal as AbortSignal } : { ...extra, ...optionsOrSignal };
  const limiter = rateLimiter ?? new RateLimiter(8.5);
  const result = await fetchParseLinkWithRateLimit(url, scraperId, scraperSecret, limiter, options);
  if (!result.success) return result;
  const media = result.media;
  const images = Array.isArray(media.images) ? media.images.filter(Boolean) : [];
  if (media.cover && !images.includes(media.cover)) images.unshift(media.cover);
  return { success: true, data: { ...media, images }, apiUsed: result.apiUsed };
}
