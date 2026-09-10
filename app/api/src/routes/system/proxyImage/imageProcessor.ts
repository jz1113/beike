import sharp from 'sharp';
import { readResponseBodyLimited } from '../../../core/readBodyLimited';
import { assertSafeRemoteUrl, MAX_PROXY_BYTES } from '@beike/shared/safeUrl';
import { extractStorageKeyFromUrl, getObjectBufferFromStorage } from '@beike/shared/storage';
import { setCachedImage, inFlightImageFetches } from './cache';
import { buildUpstreamHeaders, fetchRemote } from './fetcher';

export function getFallbackSvgImage(label = '商品素材加载中'): string {
  return `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F8FAFC" />
      <stop offset="100%" stop-color="#EDF2F7" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bgGrad)" rx="16" />
  <g fill="none" stroke="#94A3B8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(160, 140) scale(3.2)">
    <rect x="3" y="3" width="18" height="18" rx="3.5" stroke="#CBD5E1" fill="#FFFFFF" />
    <circle cx="8.5" cy="8.5" r="1.5" fill="#EE2726" stroke="none" />
    <path d="M21 15l-5-5L6 20" stroke="#94A3B8" />
  </g>
  <text x="50%" y="250" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', PingFang SC, sans-serif" font-size="13" font-weight="700" fill="#64748B" text-anchor="middle">
    ${label}
  </text>
</svg>`;
}

export interface FetchedImageResult {
  buf: Buffer;
  contentType: string;
  etag: string;
}

export async function fetchAndProcessImage(
  imageUrl: string,
  trimmedUrl: string,
  cacheKey: string,
  targetWidth: number | null
): Promise<FetchedImageResult | null> {
  let fetchPromise = inFlightImageFetches.get(cacheKey);
  if (!fetchPromise) {
    fetchPromise = (async () => {
      // 🌟 内部对象存储直读：如果属于系统已配置的存储桶（如私有阿里云 OSS），直接通过 S3 Client 授权直读
      const initialStorageKey =
        extractStorageKeyFromUrl(imageUrl) || extractStorageKeyFromUrl(trimmedUrl);
      if (initialStorageKey) {
        const storageRes = await getObjectBufferFromStorage(initialStorageKey);
        if (storageRes) {
          const { buffer, contentType } = storageRes;
          if (targetWidth) {
            try {
              const resizedBuf = await sharp(buffer)
                .resize({ width: targetWidth, withoutEnlargement: true, fit: 'inside' })
                .webp({ quality: 82 })
                .toBuffer();
              const thumbEtag = `W/"${resizedBuf.byteLength.toString(16)}-thumb-${targetWidth}-${Buffer.from(imageUrl.slice(-16)).toString('hex')}"`;
              setCachedImage(cacheKey, resizedBuf, 'image/webp', thumbEtag);
              const origEtag = `W/"${buffer.byteLength.toString(16)}-${Buffer.from(imageUrl.slice(-20)).toString('hex')}"`;
              setCachedImage(imageUrl, buffer, contentType, origEtag);
              return { buf: resizedBuf, contentType: 'image/webp', etag: thumbEtag };
            } catch (sharpErr) {
              console.warn(
                '[proxy-image] sharp resize failed for storage object, fallback to original',
                sharpErr
              );
            }
          }
          const etag = `W/"${buffer.byteLength.toString(16)}-${Buffer.from(imageUrl.slice(-20)).toString('hex')}"`;
          setCachedImage(cacheKey, buffer, contentType, etag);
          return { buf: buffer, contentType, etag };
        }
      }

      // 缩略图抓取超时 8000ms，高清大图 18000ms，全尺寸原图 30000ms，避免高分辨率图片下载轻易超时
      const fetchTimeout = targetWidth ? (targetWidth <= 640 ? 8000 : 18000) : 30000;
      const headers = buildUpstreamHeaders(imageUrl, false);
      let response: Response | null = await fetchRemote(imageUrl, headers, fetchTimeout);

      // 如果清洗后的 URL 失败（常见于京东/淘宝 1440x1440 等高清规格不存在返回 404），立刻尝试原始未清洗 URL
      if ((!response || !response.ok) && imageUrl !== trimmedUrl) {
        try {
          await assertSafeRemoteUrl(trimmedUrl, { requireAllowlist: true });
          const origHeaders = buildUpstreamHeaders(trimmedUrl, false);
          const origResp = await fetchRemote(trimmedUrl, origHeaders, fetchTimeout);
          if (origResp && origResp.ok) {
            response = origResp;
            imageUrl = trimmedUrl; // 成功回退至原始 URL
          }
        } catch {
          // keep previous response
        }
      }

      // 如果不是 404 且有 Referer，去掉 Referer 再尝试一次防盗链绕过
      if ((!response || (!response.ok && response.status !== 404)) && headers.Referer) {
        const retry = { ...headers };
        delete retry.Referer;
        response = await fetchRemote(imageUrl, retry, fetchTimeout);
      }

      // 小红书特殊 CDN 域名降级
      if (!response || !response.ok) {
        if (imageUrl.includes('ci.xiaohongshu.com')) {
          const recovered = imageUrl.replace(
            /^https?:\/\/ci\.xiaohongshu\.com/i,
            'https://sns-img-hw.xhscdn.com'
          );
          try {
            await assertSafeRemoteUrl(recovered, { requireAllowlist: true });
            const recoverHeaders = {
              ...headers,
              Referer: 'https://www.xiaohongshu.com/',
            };
            response = await fetchRemote(recovered, recoverHeaders, fetchTimeout);
          } catch {
            /* keep previous failure */
          }
        }
      }

      if (!response || !response.ok) {
        // 兜底重试：如果前面网络请求失败（如 403 Forbidden），再次尝试内部存储提取
        const fallbackStorageKey =
          extractStorageKeyFromUrl(trimmedUrl) || extractStorageKeyFromUrl(imageUrl);
        if (fallbackStorageKey) {
          const storageRes = await getObjectBufferFromStorage(fallbackStorageKey);
          if (storageRes) {
            const { buffer, contentType } = storageRes;
            if (targetWidth) {
              try {
                const resizedBuf = await sharp(buffer)
                  .resize({ width: targetWidth, withoutEnlargement: true, fit: 'inside' })
                  .webp({ quality: 82 })
                  .toBuffer();
                const thumbEtag = `W/"${resizedBuf.byteLength.toString(16)}-thumb-${targetWidth}-${Buffer.from(imageUrl.slice(-16)).toString('hex')}"`;
                setCachedImage(cacheKey, resizedBuf, 'image/webp', thumbEtag);
                return { buf: resizedBuf, contentType: 'image/webp', etag: thumbEtag };
              } catch {
                // ignore
              }
            }
            const etag = `W/"${buffer.byteLength.toString(16)}-${Buffer.from(imageUrl.slice(-20)).toString('hex')}"`;
            setCachedImage(cacheKey, buffer, contentType, etag);
            return { buf: buffer, contentType, etag };
          }
        }
        return null;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const cl = response.headers.get('content-length');
      if (cl) {
        const len = Number.parseInt(cl, 10);
        if (Number.isFinite(len) && len > MAX_PROXY_BYTES) {
          return null;
        }
      }

      const bodyResult = await readResponseBodyLimited(response, MAX_PROXY_BYTES);
      if (!bodyResult.ok) {
        return null;
      }

      const arrayBuffer = bodyResult.buffer;

      // 🌟 如果请求了缩略图，使用 sharp 极速转为轻量 WebP（13.6MB -> ~60KB）
      if (targetWidth) {
        try {
          const resizedBuf = await sharp(arrayBuffer)
            .resize({ width: targetWidth, withoutEnlargement: true, fit: 'inside' })
            .webp({ quality: 82 })
            .toBuffer();
          const thumbEtag = `W/"${resizedBuf.byteLength.toString(16)}-thumb-${targetWidth}-${Buffer.from(imageUrl.slice(-16)).toString('hex')}"`;
          setCachedImage(cacheKey, resizedBuf, 'image/webp', thumbEtag);
          // 同时也把原图存下（若小于8MB）
          const origEtag = `W/"${arrayBuffer.byteLength.toString(16)}-${Buffer.from(imageUrl.slice(-20)).toString('hex')}"`;
          setCachedImage(imageUrl, arrayBuffer, contentType, origEtag);
          return { buf: resizedBuf, contentType: 'image/webp', etag: thumbEtag };
        } catch (sharpErr) {
          console.warn('[proxy-image] sharp resize failed, fallback to original', sharpErr);
        }
      }

      const etag = `W/"${arrayBuffer.byteLength.toString(16)}-${Buffer.from(imageUrl.slice(-20)).toString('hex')}"`;

      // 存入内存高速缓存
      setCachedImage(cacheKey, arrayBuffer, contentType, etag);
      return { buf: arrayBuffer, contentType, etag };
    })();

    inFlightImageFetches.set(cacheKey, fetchPromise);
    fetchPromise.finally(() => {
      inFlightImageFetches.delete(cacheKey);
    });
  }

  return fetchPromise;
}
