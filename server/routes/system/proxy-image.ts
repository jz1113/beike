import { jsonResponse } from '../../adapters/http';
import { readResponseBodyLimited } from '../../lib/readBodyLimited';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { assertSafeRemoteUrl, MAX_PROXY_BYTES, resolvePublicPath } from '@/lib/safeUrl';

const MAX_VIDEO_PROXY_BYTES = 80 * 1024 * 1024; // 80MB，支持预览拖动进度条
const videoBufferCache = new Map<string, { buf: Buffer; contentType: string; at: number }>();
const VIDEO_CACHE_TTL_MS = 5 * 60 * 1000;
const VIDEO_CACHE_MAX = 4;

export function clearProxyVideoCache(): number {
  const n = videoBufferCache.size;
  videoBufferCache.clear();
  return n;
}

function getCachedVideo(url: string) {
  const hit = videoBufferCache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.at > VIDEO_CACHE_TTL_MS) {
    videoBufferCache.delete(url);
    return null;
  }
  return hit;
}

function setCachedVideo(url: string, buf: Buffer, contentType: string) {
  if (videoBufferCache.size >= VIDEO_CACHE_MAX) {
    const oldest = [...videoBufferCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) videoBufferCache.delete(oldest[0]);
  }
  videoBufferCache.set(url, { buf, contentType, at: Date.now() });
}

function getFallbackSvgImage(label = '商品素材加载中'): string {
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

function parseBytesRange(rangeHeader: string | null, size: number): { start: number; end: number } | null {
  if (!rangeHeader || size <= 0) return null;
  const m = rangeHeader.match(/bytes=(\d*)-(\d*)/i);
  if (!m) return null;
  let start = m[1] === '' ? NaN : Number(m[1]);
  let end = m[2] === '' ? NaN : Number(m[2]);
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) {
    const suffix = end;
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

function buildUpstreamHeaders(imageUrl: string, isVideo: boolean, rangeHeader?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: isVideo ? '*/*' : 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
  if (rangeHeader) headers.Range = rangeHeader;

  if (/xhscdn\.com|xiaohongshu\.com|fengkongcloud/i.test(imageUrl)) {
    headers.Referer = 'https://www.xiaohongshu.com/';
  } else if (/douyinpic\.com|byteimg\.com|douyin\.com|pstatp\.com|snssdk\.com|bytecdn\.cn|tos-cn-/i.test(imageUrl)) {
    headers.Referer = 'https://www.douyin.com/';
  } else if (/kuaishou\.com|yximgs\.com|kwai\.net/i.test(imageUrl)) {
    headers.Referer = 'https://www.kuaishou.com/';
  } else if (/360buyimg\.com|jd\.com/i.test(imageUrl)) {
    headers.Referer = 'https://item.jd.com/';
  } else if (/alicdn\.com|taobaocdn\.com|taobao\.com|tmall\.com/i.test(imageUrl)) {
    headers.Referer = 'https://item.taobao.com/';
  } else if (/pddpic\.com|yangkeduo\.com|pinduoduo\.com/i.test(imageUrl)) {
    headers.Referer = 'https://mobile.yangkeduo.com/';
  } else if (/sinaimg\.cn|weibo\.com/i.test(imageUrl)) {
    headers.Referer = 'https://weibo.com/';
  } else if (/hdslb\.com|bilibili\.com/i.test(imageUrl)) {
    headers.Referer = 'https://www.bilibili.com/';
  }

  return headers;
}

async function fetchRemote(imageUrl: string, headers: Record<string, string>, timeoutMs: number): Promise<Response | null> {
  try {
    let response = await fetch(imageUrl, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location');
      if (loc) {
        const next = new URL(loc, imageUrl);
        await assertSafeRemoteUrl(next.toString(), { requireAllowlist: true });
        response = await fetch(next.toString(), {
          headers,
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
      }
    }
    return response;
  } catch {
    return null;
  }
}

function passthroughPartial(response: Response): Response {
  const out = new Headers();
  out.set('Content-Type', response.headers.get('content-type') || 'video/mp4');
  out.set('Accept-Ranges', 'bytes');
  out.set('Cache-Control', 'private, max-age=3600');
  const cr = response.headers.get('content-range');
  const cl = response.headers.get('content-length');
  if (cr) out.set('Content-Range', cr);
  if (cl) out.set('Content-Length', cl);
  return new Response(response.body, { status: 206, headers: out });
}

async function proxyVideo(req: Request, imageUrl: string): Promise<Response> {
  const clientRange = req.headers.get('range');
  const timeoutMs = 90000;

  // 本地缓存命中：直接按 Range 切片（拖动进度条不二次拉流）
  const cached = getCachedVideo(imageUrl);
  if (cached) {
    const parsed = parseBytesRange(clientRange, cached.buf.byteLength);
    if (parsed) {
      const slice = cached.buf.subarray(parsed.start, parsed.end + 1);
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          'Content-Type': cached.contentType,
          'Content-Length': String(slice.byteLength),
          'Content-Range': `bytes ${parsed.start}-${parsed.end}/${cached.buf.byteLength}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }
    return new Response(new Uint8Array(cached.buf), {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        'Content-Length': String(cached.buf.byteLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  const headers = buildUpstreamHeaders(imageUrl, true, clientRange);
  let response = await fetchRemote(imageUrl, headers, timeoutMs);

  // 上游直接支持 Range：透传 206（不缓存分片）
  if (response && response.status === 206 && response.body) {
    return passthroughPartial(response);
  }

  // 失败时去掉 Referer / Range 再试全量
  if (!response || (!response.ok && response.status !== 206)) {
    const retry = buildUpstreamHeaders(imageUrl, true, null);
    delete retry.Referer;
    response = await fetchRemote(imageUrl, retry, timeoutMs);
  } else if (!response.ok) {
    const fullHeaders = buildUpstreamHeaders(imageUrl, true, null);
    response = await fetchRemote(imageUrl, fullHeaders, timeoutMs);
    if ((!response || !response.ok) && fullHeaders.Referer) {
      const retry = { ...fullHeaders };
      delete retry.Referer;
      response = await fetchRemote(imageUrl, retry, timeoutMs);
    }
  }

  if (response && response.status === 206 && response.body) {
    return passthroughPartial(response);
  }

  if (!response || !response.ok) {
    return new Response('Video unavailable', { status: 404 });
  }

  const contentType = response.headers.get('content-type') || 'video/mp4';
  const cl = response.headers.get('content-length');
  if (cl) {
    const len = Number.parseInt(cl, 10);
    if (Number.isFinite(len) && len > MAX_VIDEO_PROXY_BYTES) {
      return new Response('Video too large', { status: 413 });
    }
  }

  const bodyResult = await readResponseBodyLimited(response, MAX_VIDEO_PROXY_BYTES);
  if (!bodyResult.ok) {
    return new Response(bodyResult.reason === 'too_large' ? 'Video too large' : 'Video unavailable', {
      status: bodyResult.reason === 'too_large' ? 413 : 404,
    });
  }

  const buf = bodyResult.buffer;
  setCachedVideo(imageUrl, buf, contentType);
  const parsed = parseBytesRange(clientRange, buf.byteLength);

  if (parsed) {
    const slice = buf.subarray(parsed.start, parsed.end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(slice.byteLength),
        'Content-Range': `bytes ${parsed.start}-${parsed.end}/${buf.byteLength}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buf.byteLength),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function GET(req: Request) {
  try {
    const rawImageUrl = new URL(req.url).searchParams.get('url');

    if (!rawImageUrl || !rawImageUrl.trim()) {
      return new Response(getFallbackSvgImage('缺少图片地址'), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' }
      });
    }

    const trimmedUrl = rawImageUrl.trim();

    if (trimmedUrl.startsWith('/') && !trimmedUrl.startsWith('//')) {
      const local = resolvePublicPath(trimmedUrl);
      if (local) {
        return Response.redirect(new URL(trimmedUrl.split('?')[0], new URL(req.url).origin));
      }
      return new Response(getFallbackSvgImage('非法本地路径'), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
      });
    }

    const isVideo = /\.(mp4|mov|webm|avi|m4v)(\?|!|$)/i.test(trimmedUrl) || /video|snssdk\.com|bytecdn\.cn/i.test(trimmedUrl);

    let imageUrl = isVideo ? trimmedUrl : (normalizeImageUrlToStandardJpg(trimmedUrl) || trimmedUrl);
    if (imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    }

    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      return new Response(getFallbackSvgImage('不支持的地址'), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
      });
    }

    try {
      await assertSafeRemoteUrl(imageUrl, { requireAllowlist: true });
    } catch {
      return new Response(getFallbackSvgImage('地址被安全策略拦截'), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
      });
    }

    if (isVideo) {
      return proxyVideo(req, imageUrl);
    }

    const headers = buildUpstreamHeaders(imageUrl, false);

    let response: Response | null = await fetchRemote(imageUrl, headers, 10000);

    if ((!response || !response.ok) && headers.Referer) {
      const retry = { ...headers };
      delete retry.Referer;
      response = await fetchRemote(imageUrl, retry, 10000);
    }

    if (!response || !response.ok) {
      const ciMatch = imageUrl.match(/^https?:\/\/ci\.xiaohongshu\.com\/([a-zA-Z0-9]+)(\?.*)?$/i);
      if (ciMatch) {
        const recovered = `https://sns-img-hw.xhscdn.com/notes_pre_post/${ciMatch[1]}${ciMatch[2] || '?imageView2/2/w/0/format/jpg'}`;
        try {
          await assertSafeRemoteUrl(recovered, { requireAllowlist: true });
          const recoverHeaders = {
            ...headers,
            Referer: 'https://www.xiaohongshu.com/',
          };
          response = await fetchRemote(recovered, recoverHeaders, 10000);
          if (response?.ok) {
            imageUrl = recovered;
          }
        } catch {
          /* keep previous failure */
        }
      }
    }

    if (!response || !response.ok) {
      return new Response(getFallbackSvgImage('优质电商素材'), {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const cl = response.headers.get('content-length');
    if (cl) {
      const len = Number.parseInt(cl, 10);
      if (Number.isFinite(len) && len > MAX_PROXY_BYTES) {
        return new Response(getFallbackSvgImage('文件过大'), {
          headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
        });
      }
    }

    const bodyResult = await readResponseBodyLimited(response, MAX_PROXY_BYTES);
    if (!bodyResult.ok) {
      return new Response(getFallbackSvgImage(bodyResult.reason === 'too_large' ? '文件过大' : '优质电商素材'), {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    const arrayBuffer = bodyResult.buffer;
    return new Response(new Uint8Array(arrayBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(arrayBuffer.byteLength),
      },
    });
  } catch {
    return new Response(getFallbackSvgImage('商品素材保护中'), {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}
