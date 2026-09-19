import LRUCache from 'lru-cache';

// 视频缓存：4 条 / 160MB
export const MAX_VIDEO_CACHE_TOTAL_BYTES = 160 * 1024 * 1024;
export const VIDEO_CACHE_MAX = 4;
export const VIDEO_CACHE_TTL_MS = 5 * 60 * 1000;

export interface VideoCacheEntry {
  buf: Buffer;
  contentType: string;
}

export const videoBufferCache = new LRUCache<string, VideoCacheEntry>({
  max: VIDEO_CACHE_MAX,
  maxAge: VIDEO_CACHE_TTL_MS,
});
export const VIDEO_MAX_ITEM_BYTES = 25 * 1024 * 1024; // 单项上限
export const MAX_VIDEO_PROXY_BYTES = 50 * 1024 * 1024; // 视频代理上限 50MB

// 图片缓存：600 条 / 192MB / TTL 2h
export const MAX_IMAGE_CACHE_TOTAL_BYTES = 192 * 1024 * 1024;
export const MAX_IMAGE_CACHE_ITEMS = 600;
export const IMAGE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export interface ImageCacheEntry {
  buf: Buffer;
  contentType: string;
  etag: string;
}

export const imageBufferCache = new LRUCache<string, ImageCacheEntry>({
  max: MAX_IMAGE_CACHE_ITEMS,
  maxAge: IMAGE_CACHE_TTL_MS,
});
export const IMAGE_MAX_ITEM_BYTES = 25 * 1024 * 1024; // 单张大于 25MB 不进内存缓存

// 🌟 请求飞行合并 (In-Flight Promise Deduplication)，杜绝瞬时并发回源击穿
export const inFlightImageFetches = new Map<
  string,
  Promise<{ buf: Buffer; contentType: string; etag: string } | null>
>();

export function clearProxyVideoCache(): number {
  const n = videoBufferCache.itemCount + imageBufferCache.itemCount;
  videoBufferCache.reset();
  imageBufferCache.reset();
  return n;
}

export function getCachedVideo(url: string): VideoCacheEntry | null {
  return videoBufferCache.get(url) ?? null;
}

export function setCachedVideo(url: string, buf: Buffer, contentType: string): void {
  if (buf.byteLength > VIDEO_MAX_ITEM_BYTES) return;
  if (buf.byteLength >= MAX_VIDEO_CACHE_TOTAL_BYTES) return;
  videoBufferCache.set(url, { buf, contentType });
}

export function getCachedImage(url: string): ImageCacheEntry | null {
  const hit = imageBufferCache.get(url);
  if (hit) imageBufferCache.get(url);
  return hit ?? null;
}

export function setCachedImage(
  url: string,
  buf: Buffer,
  contentType: string,
  etag: string
): void {
  if (buf.byteLength > IMAGE_MAX_ITEM_BYTES) return;
  if (buf.byteLength >= MAX_IMAGE_CACHE_TOTAL_BYTES) return;
  imageBufferCache.set(url, { buf, contentType, etag });
}
