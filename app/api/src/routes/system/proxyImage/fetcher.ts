import { extractStorageKeyFromUrl, getObjectBufferFromStorage } from '@beike/shared/storage';
import {
  getCachedVideo,
  setCachedVideo,
} from './cache';

export function parseBytesRange(
  rangeHeader: string | null,
  size: number
): { start: number; end: number } | null {
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

/**
 * 已知防盗链平台的 Referer 白名单（按 hostname 严格匹配，避免子串包含误判）。
 */
export const REFERER_RULES: Array<{ hosts: string[]; referer: string }> = [
  { hosts: ['xhscdn.com', 'xiaohongshu.com'], referer: 'https://www.xiaohongshu.com/' },
  { hosts: ['douyinpic.com', 'snssdk.com', 'bytecdn.cn'], referer: 'https://www.douyin.com/' },
  { hosts: ['360buyimg.com', 'jd.com'], referer: 'https://www.jd.com/' },
  { hosts: ['alicdn.com', 'taobao.com', 'tmall.com'], referer: 'https://www.taobao.com/' },
  { hosts: ['pddpic.com', 'yangkeduo.com'], referer: 'https://mobile.yangkeduo.com/' },
  { hosts: ['kuaishou.com', 'yximgs.com', 'kwimgs.com'], referer: 'https://www.kuaishou.com/' },
];

export function buildUpstreamHeaders(
  imageUrl: string,
  isVideo: boolean,
  rangeHeader?: string | null
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: isVideo ? '*/*' : 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
  if (rangeHeader) headers.Range = rangeHeader;

  // 安全：Referer 注入由 hostname 精确匹配，防御 `https://evil.com/@xiaohongshu.com/` 形式的注入
  let hostname: string | null = null;
  try {
    hostname = new URL(imageUrl).hostname.toLowerCase();
  } catch {
    /* 忽略非合法 URL */
  }
  if (hostname) {
    for (const rule of REFERER_RULES) {
      if (rule.hosts.includes(hostname)) {
        headers.Referer = rule.referer;
        break;
      }
    }
  }

  return headers;
}

export async function fetchRemote(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 25000
): Promise<Response | null> {
  const ctrl = new AbortController();
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      headers,
      signal: ctrl.signal,
      redirect: 'follow',
    });
    return res;
  } catch {
    return null;
  } finally {
    if (t) clearTimeout(t);
  }
}

export function passthroughPartial(response: Response): Response {
  const ct = response.headers.get('content-type') || 'video/mp4';
  const cr = response.headers.get('content-range');
  const cl = response.headers.get('content-length');
  const headers: Record<string, string> = {
    'Content-Type': ct,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  };
  if (cr) headers['Content-Range'] = cr;
  if (cl) headers['Content-Length'] = cl;
  return new Response(response.body, { status: 206, headers });
}

export async function proxyVideo(req: Request, imageUrl: string): Promise<Response> {
  const clientRange = req.headers.get('range');
  const cached = getCachedVideo(imageUrl);

  if (cached) {
    const { buf, contentType } = cached;
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

  // 🌟 内部存储直读支持：若命中系统已配置对象存储（如私有 OSS/R2/S3），直接授权读取
  const storageVideoKey = extractStorageKeyFromUrl(imageUrl);
  if (storageVideoKey) {
    const storageRes = await getObjectBufferFromStorage(storageVideoKey);
    if (storageRes) {
      const { buffer, contentType } = storageRes;
      setCachedVideo(imageUrl, buffer, contentType);
      const parsed = parseBytesRange(clientRange, buffer.byteLength);
      if (parsed) {
        const slice = buffer.subarray(parsed.start, parsed.end + 1);
        return new Response(new Uint8Array(slice), {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(slice.byteLength),
            'Content-Range': `bytes ${parsed.start}-${parsed.end}/${buffer.byteLength}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(buffer.byteLength),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }
  }

  const upstreamHeaders = buildUpstreamHeaders(imageUrl, true, clientRange);
  const timeoutMs = 60000;
  let response: Response | null = await fetchRemote(imageUrl, upstreamHeaders, timeoutMs);

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

  // 🌟 如果上游直接返回 200 OK 且包含数据流，直接流式透传给客户端，支持边下边播，避免大视频整包读入内存
  if (response.body) {
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    };
    if (cl) headers['Content-Length'] = cl;
    return new Response(response.body, { status: 200, headers });
  }

  return new Response('Video unavailable', { status: 404 });
}
