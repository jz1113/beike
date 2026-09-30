import sharp from 'sharp';
import { normalizeImageUrlToStandardJpg } from '@shared/domain/media/drawing';
import { assertSafeRemoteUrl, resolvePublicPath } from '@server/infrastructure/network/safeUrl';
import { getCachedImage, setCachedImage } from './proxy-image/cache';
import { proxyVideo } from './proxy-image/fetcher';
import {
  getFallbackSvgImage,
  fetchAndProcessImage,
} from './proxy-image/imageProcessor';

export { clearProxyVideoCache } from './proxy-image/cache';

export async function GET(req: Request) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const rawImageUrl = searchParams.get('url');
    const forceVideo = searchParams.get('as') === 'video' || searchParams.get('type') === 'video';

    if (!rawImageUrl || !rawImageUrl.trim()) {
      return new Response('Missing url parameter', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    const trimmedUrl = rawImageUrl.trim();

    if (trimmedUrl.startsWith('/') && !trimmedUrl.startsWith('//')) {
      const local = resolvePublicPath(trimmedUrl);
      if (local) {
        return Response.redirect(new URL(trimmedUrl.split('?')[0], new URL(req.url).origin));
      }
      return new Response(getFallbackSvgImage('非法本地路径'), {
        status: 404,
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
      });
    }

    const isVideo =
      forceVideo ||
      /\.(mp4|mov|webm|avi|m4v)(\?|!|$)/i.test(trimmedUrl) ||
      /video|snssdk\.com|bytecdn\.cn|yximgs|kwaicdn|kwimgs|kwai\.|kuaishou|douyinvod/i.test(
        trimmedUrl
      );

    let imageUrl = isVideo
      ? trimmedUrl
      : normalizeImageUrlToStandardJpg(trimmedUrl) || trimmedUrl;
    if (imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    } else if (
      imageUrl.startsWith('http://') &&
      /360buyimg\.com|alicdn\.com|douyinpic\.com|xhscdn\.com|pddpic\.com|sinaimg\.cn/i.test(imageUrl)
    ) {
      imageUrl = 'https://' + imageUrl.slice(7);
    }

    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      return new Response(getFallbackSvgImage('不支持的地址'), {
        status: 400,
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
      });
    }

    try {
      await assertSafeRemoteUrl(imageUrl, { requireAllowlist: true });
    } catch {
      return new Response(getFallbackSvgImage('地址被安全策略拦截'), {
        status: 403,
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
      });
    }

    if (isVideo) {
      return proxyVideo(req, imageUrl);
    }

    // 🌟 1. 检查是否需要生成快速 WebP 缩略图（极大提速大图套组/文件夹/瀑布流加载）
    const isThumb = searchParams.get('thumb') === '1' || searchParams.get('thumb') === 'true';
    const rawW = searchParams.get('w');
    const targetWidth = rawW
      ? Math.max(80, Math.min(1920, parseInt(rawW, 10) || 640))
      : isThumb
        ? 640
        : null;
    const cacheKey = targetWidth ? `${imageUrl}__thumb_${targetWidth}` : imageUrl;

    const clientEtag = req.headers.get('if-none-match');
    const cachedImg = getCachedImage(cacheKey);

    if (cachedImg) {
      if (clientEtag && clientEtag === cachedImg.etag) {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: cachedImg.etag,
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          },
        });
      }
      return new Response(new Uint8Array(cachedImg.buf), {
        headers: {
          'Content-Type': cachedImg.contentType,
          'Content-Length': String(cachedImg.buf.byteLength),
          ETag: cachedImg.etag,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'Accept-Ranges': 'bytes',
        },
      });
    }

    // 🌟 如果请求了缩略图，但原图已在内存缓存中，可直接秒级从原图转码，无需走网络
    if (targetWidth) {
      const originalCached = getCachedImage(imageUrl);
      if (originalCached) {
        try {
          const resizedBuf = await sharp(originalCached.buf)
            .resize({ width: targetWidth, withoutEnlargement: true, fit: 'inside' })
            .webp({ quality: 82 })
            .toBuffer();
          const thumbEtag = `W/"${resizedBuf.byteLength.toString(16)}-thumb-${targetWidth}-${Buffer.from(imageUrl.slice(-16)).toString('hex')}"`;
          setCachedImage(cacheKey, resizedBuf, 'image/webp', thumbEtag);
          return new Response(new Uint8Array(resizedBuf), {
            headers: {
              'Content-Type': 'image/webp',
              'Content-Length': String(resizedBuf.byteLength),
              ETag: thumbEtag,
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
              'Accept-Ranges': 'bytes',
            },
          });
        } catch {
          // fallback to remote fetch
        }
      }
    }

    // 🌟 2. 远端拉取图片（带飞行请求合并 In-Flight Deduplication）
    const fetchedResult = await fetchAndProcessImage(imageUrl, trimmedUrl, cacheKey, targetWidth);

    if (!fetchedResult) {
      // 🌟 核心兜底 1: 检查是否存在该图片已缓存的其他规格版本（如用户此前在列表页已成功缓存的 640px/1920px 图像），避免显示空白破损占位
      const fallbackCached =
        getCachedImage(`${imageUrl}__thumb_1920`) ||
        getCachedImage(`${imageUrl}__thumb_640`) ||
        getCachedImage(`${trimmedUrl}__thumb_1920`) ||
        getCachedImage(`${trimmedUrl}__thumb_640`) ||
        getCachedImage(imageUrl) ||
        getCachedImage(trimmedUrl);
      if (fallbackCached) {
        return new Response(new Uint8Array(fallbackCached.buf), {
          headers: {
            'Content-Type': fallbackCached.contentType,
            'Cache-Control': 'public, max-age=3600',
            ETag: fallbackCached.etag,
            'X-Proxy-Degraded': 'cached-fallback',
          },
        });
      }

      // 🌟 核心兜底 2: 若完全无可用缓存，返回 502 状态码，允许客户端 <img> 的 onError 正常捕获并回退至源地址直连
      return new Response(getFallbackSvgImage('优质电商素材'), {
        status: 502,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Proxy-Fallback': 'true',
        },
      });
    }

    return new Response(new Uint8Array(fetchedResult.buf), {
      headers: {
        'Content-Type': fetchedResult.contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        ETag: fetchedResult.etag,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(fetchedResult.buf.byteLength),
      },
    });
  } catch {
    return new Response(getFallbackSvgImage('商品素材保护中'), {
      status: 502,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}
