import { getMediaDownloadFilename, isMediaDownloadContent } from '@shared/domain/media/mediaDownload';
import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { getDerived, putDerived } from '@client/shared/media/idbMediaCache';

/** 在新标签页打开外链 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** 纯前端 Base64 DataURL 转 Blob（极速零网络开销） */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0]?.match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(parts[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

function isLocalPersistedMedia(url: string): boolean {
  return url.startsWith('/storage/') || url.startsWith('/api/assets/storage/');
}

async function blobIsReadable(blob: Blob): Promise<boolean> {
  try {
    await blob.arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

async function isDownloadableMedia(blob: Blob, url: string): Promise<boolean> {
  return blob.size > 0 && isMediaDownloadContent(blob.type, url, await blob.slice(0, 512).text());
}

async function readDownloadableResponse(res: Response, url: string): Promise<Blob | null> {
  if (!res.ok || res.headers.get('x-proxy-fallback') === 'true') return null;
  const blob = await res.blob();
  return !isTruncatedResponse(res, blob) && await isDownloadableMedia(blob, url) ? blob : null;
}

function isTruncatedResponse(res: Response, blob: Blob): boolean {
  if (res.status === 206) return true;
  const range = res.headers.get('content-range');
  if (range) {
    const match = /bytes\s+\d+-\d+\/(\d+|\*)/i.exec(range);
    if (match?.[1] && match[1] !== '*') {
      const total = Number(match[1]);
      if (Number.isFinite(total) && blob.size < total) return true;
    }
  }
  const length = Number(res.headers.get('content-length') || '');
  return Number.isFinite(length) && length > 0 && blob.size < length;
}
const memoryBlobCache = new Map<string, { blob: Blob; at: number }>();
const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000;
const MEMORY_CACHE_MAX_ITEMS = 50;
const MEMORY_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const inFlightBlobFetches = new Map<string, Promise<Blob>>();

function evictMemoryBlobCache(): void {
  const now = Date.now();
  for (const [key, entry] of memoryBlobCache) {
    if (now - entry.at >= MEMORY_CACHE_TTL_MS) {
      memoryBlobCache.delete(key);
    }
  }

  let totalBytes = 0;
  for (const entry of memoryBlobCache.values()) {
    totalBytes += entry.blob.size;
  }

  while (
    memoryBlobCache.size > MEMORY_CACHE_MAX_ITEMS ||
    totalBytes > MEMORY_CACHE_MAX_BYTES
  ) {
    const oldestKey = memoryBlobCache.keys().next().value;
    if (!oldestKey) break;
    const removed = memoryBlobCache.get(oldestKey);
    memoryBlobCache.delete(oldestKey);
    if (removed) totalBytes -= removed.blob.size;
  }
}

function setMemoryBlobCache(url: string, blob: Blob): void {
  memoryBlobCache.set(url, { blob, at: Date.now() });
  evictMemoryBlobCache();
}

/** 弹性多通道极速拉取媒体 Blob 数据流 */
export async function fetchMediaBlob(url: string): Promise<Blob> {
  if (!url) throw new Error('缺少下载地址');

  // 1. Base64 Data URL 直接前端内存解码 (0ms)
  if (url.startsWith('data:')) {
    return dataUrlToBlob(url);
  }

  // 2. 本地 Blob URL 瞬时拉取 (0ms)
  if (url.startsWith('blob:')) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`读取本地 Blob 失败 (${res.status})`);
    return res.blob();
  }

  const cachedMem = memoryBlobCache.get(url);
  if (cachedMem && Date.now() - cachedMem.at < MEMORY_CACHE_TTL_MS) {
    if (await isDownloadableMedia(cachedMem.blob, url) && await blobIsReadable(cachedMem.blob)) return cachedMem.blob;
    memoryBlobCache.delete(url);
  }

  const skipIdb = isLocalPersistedMedia(url);

  // 4. 检查 IndexedDB 离线持久化缓存 (<2ms)
  if (!skipIdb) {
    try {
      const idbBlob = await getDerived(url);
      if (idbBlob && await isDownloadableMedia(idbBlob, url) && await blobIsReadable(idbBlob)) {
        memoryBlobCache.set(url, { blob: idbBlob, at: Date.now() });
        evictMemoryBlobCache();
        return idbBlob;
      }
    } catch {
      /* fallback to network */
    }
  }

  // 5. 远端 HTTP / HTTPS 资源拉取（带请求飞行合并 In-Flight Deduplication）
  let fetchPromise = inFlightBlobFetches.get(url);
  if (!fetchPromise) {
    fetchPromise = (async () => {
      let resultBlob: Blob | null = null;

      // 5.1 优先走 API 媒体代理（解决防盗链 Referer、CORS 与私有 OSS 签名）
      try {
        const proxyUrl = proxyMediaUrl(url);
        const res = await apiFetch(proxyUrl);
        resultBlob = await readDownloadableResponse(res, url);
      } catch (proxyErr) {
        console.warn('[fetchMediaBlob] 代理拉取流失败，退回直连尝试:', proxyErr);
      }

      // 5.2 代理异常时直连拉取（兼容支持 CORS 的 CDN 节点）
      if (!resultBlob) {
        try {
          const directRes = await fetch(url, { mode: 'cors' });
          resultBlob = await readDownloadableResponse(directRes, url);
        } catch (directErr) {
          console.warn('[fetchMediaBlob] 直连拉取失败:', directErr);
        }
      }

      if (!resultBlob) {
        // Cached media was checked above. Never retry via an unvalidated fetch:
        // that could silently save the partial response or error page rejected here.
        throw new Error('无法获取完整媒体文件，请重试或打开原文件');
      }

      // 存入内存高速缓存与 IndexedDB
      setMemoryBlobCache(url, resultBlob);
      if (!skipIdb) putDerived(url, resultBlob).catch(() => {});
      return resultBlob;
    })();

    inFlightBlobFetches.set(url, fetchPromise);
    void fetchPromise.finally(() => {
      inFlightBlobFetches.delete(url);
    }).catch(() => undefined);
  }

  return fetchPromise;
}

/** 使用浏览器发起文件下载 */
export async function downloadMedia(
  url: string,
  filename: string,
): Promise<'browser'> {
  const blob = await fetchMediaBlob(url);
  const correctedName = getMediaDownloadFilename(filename, blob.type, url);
  return saveToDownloadDir(correctedName, blob);
}

/** 下载媒体文件（失败时使用系统默认浏览器打开） */
export async function downloadMediaOrOpen(
  url: string,
  filename: string,
): Promise<'browser'> {
  try {
    return await downloadMedia(url, filename);
  } catch (err) {
    console.warn('[downloadMediaOrOpen] Local save failed, opening in browser:', err);
    try { await openExternalUrl(url); } catch { /* The original download still failed. */ }
    throw new Error('下载失败，已尝试打开原文件，请手动保存或重试', { cause: err });
  }
}
