import { assertSafeRemoteUrl } from './safeUrl';

export type ApiaMediaResult = {
  title: string;
  description: string;
  author: string;
  cover: string;
  images: string[];
  video: string | null;
  /** 全量视频/实况流；video 保留首条以兼容旧调用方。 */
  videos: string[];
};

export type ApiaCredentials = {
  clientId: string;
  secretKey: string;
};

export type ApiaParseResult =
  | { success: true; media: ApiaMediaResult; apiUsed: string }
  | { success: false; error: string; upstreamCode?: string | number };

const APIA_BASE = 'https://apia.vip/api/dsp';
const APIA_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 1_500;

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const APIA_ERROR_MAP: Record<string, string> = {
  '103': '请输入正确的作品链接',
  '104': '该解析接口已暂停使用',
  '110': '解析次数不足，请稍后再试',
  '113': '解析失败，该作品可能为私密或需要登录',
  '114': 'APIA 暂时无法解析该笔记，请稍后重试或换用 App 分享短链',
  '155': '接口密钥配置错误',
};

const SHORT_LINK_RE = /(?:v\.douyin\.com|xhslink\.com|v\.kuaishou\.com|b23\.tv|t\.cn)/i;

export function mapApiaErrorCode(code: string | number | undefined, fallback?: string): string {
  if (code == null) return fallback || '作品链接解析异常';
  return APIA_ERROR_MAP[String(code)] || fallback || '作品链接解析异常';
}

/** 从分享文案中提取首个 http(s) 链接 */
export function extractUrlFromShareText(rawText: string): string {
  const match = rawText.match(/https?:\/\/[^\s"'<>，。；）)]+/i);
  return match ? match[0].replace(/[，。；）)]+$/, '') : rawText.trim();
}

/** 从小红书/抖音各形式链接中提取 URL 与 noteId */
export function normalizeSocialMediaUrl(rawText: string): {
  originalUrl: string;
  cleanUrl: string;
  discoveryUrl?: string;
  noteId?: string;
} {
  const rawUrl = extractUrlFromShareText(rawText);

  let cleanUrl = rawUrl;
  let discoveryUrl: string | undefined;
  let noteId: string | undefined;

  const xhsMatch = rawUrl.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/i);
  if (xhsMatch) {
    noteId = xhsMatch[1];
    cleanUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
    if (/discovery\/item/i.test(rawUrl)) {
      discoveryUrl = `https://www.xiaohongshu.com/discovery/item/${noteId}`;
    }
  }

  const dyMatch = rawUrl.match(/douyin\.com\/(?:video|note)\/([0-9]+)/i);
  if (dyMatch) {
    noteId = dyMatch[1];
  }

  return { originalUrl: rawUrl, cleanUrl, discoveryUrl, noteId };
}

/** 根据链接特征选择 User-Agent */
export function pickUserAgentForUrl(url: string): string {
  if (/xsec_source=pc_user/i.test(url) || /www\.xiaohongshu\.com/i.test(url)) {
    return DESKTOP_UA;
  }
  if (SHORT_LINK_RE.test(url)) {
    return MOBILE_UA;
  }
  return DESKTOP_UA;
}

/** 自动尝试解析短链重定向 */
export async function resolveShortUrlRedirect(shortUrl: string): Promise<string> {
  if (!SHORT_LINK_RE.test(shortUrl)) {
    return shortUrl;
  }
  try {
    await assertSafeRemoteUrl(shortUrl, { requireAllowlist: true });
    const res = await fetch(shortUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': MOBILE_UA },
      signal: AbortSignal.timeout(4000),
    });
    const loc = res.headers.get('location');
    if (loc && loc.startsWith('http')) {
      await assertSafeRemoteUrl(loc, { requireAllowlist: true });
      console.log(`[ApiaScraper] 短链自动展开: ${shortUrl} -> ${loc}`);
      return loc;
    }
  } catch (e) {
    console.warn('[ApiaScraper] 短链展开被安全策略拦截或失败:', (e as Error)?.message);
  }
  return shortUrl;
}

/** 生成 APIA 候选 URL 列表（按优先级） */
export async function buildApiaCandidateUrls(rawText: string): Promise<string[]> {
  const { originalUrl, cleanUrl, discoveryUrl } = normalizeSocialMediaUrl(rawText);
  const expandedUrl = await resolveShortUrlRedirect(originalUrl);

  const candidates: string[] = [];
  const add = (u?: string) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };

  add(expandedUrl);
  add(originalUrl);
  if (discoveryUrl) add(discoveryUrl);
  add(cleanUrl);

  // 短链展开后可能得到新 URL，再尝试 explore 格式
  const xhsFromExpanded = expandedUrl.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/i);
  if (xhsFromExpanded) {
    add(`https://www.xiaohongshu.com/explore/${xhsFromExpanded[1]}`);
    if (/discovery\/item/i.test(expandedUrl)) {
      add(`https://www.xiaohongshu.com/discovery/item/${xhsFromExpanded[1]}`);
    }
  }

  return candidates;
}

/** 深度提取 APIA 响应中的图片、封面与视频 */
export function extractMediaFromApiaData(data: unknown): ApiaMediaResult {
  if (!data || typeof data !== 'object') {
    return { title: '', description: '', author: '', cover: '', images: [], video: null, videos: [] };
  }

  const payload = data as Record<string, unknown>;
  const root =
    payload.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : payload;

  const rawTitle = String(root.title || payload.title || '');
  const rawDesc = String(root.desc || root.text || payload.desc || payload.text || '');
  const msgText = String(root.msg || payload.msg || root.message || payload.message || '');

  const fullTextCheck = `${rawTitle} ${rawDesc} ${msgText}`;
  if (/请求次数频繁|请勿使用盗版|操作过于频繁|请稍后再试|验证码|安全验证|风控拦截/i.test(fullTextCheck)) {
    throw new Error('小红书解析接口触发上游频控/风控拦截（提示：请求次数频繁，请稍后再试或降低并发）');
  }

  const authorRaw =
    (root.author as { nickname?: string } | string | undefined) ??
    root.user_name ??
    root.nickname ??
    payload.author ??
    '';
  const author =
    typeof authorRaw === 'object' && authorRaw !== null
      ? String((authorRaw as { nickname?: string }).nickname || '')
      : String(authorRaw || '');

  let cleanTitle = rawTitle;
  let cleanDesc = rawDesc;

  if (rawTitle.includes('||')) {
    const parts = rawTitle.split('||').map((p) => p.trim()).filter(Boolean);
    cleanTitle = parts[0] || '社媒精选爆款素材';
    cleanDesc = parts.slice(1).join('\n\n') || cleanDesc;
  } else if (!cleanTitle && cleanDesc) {
    const lines = cleanDesc.split(/[\n\r]+/);
    cleanTitle = lines[0]?.slice(0, 50) || '社媒精选爆款素材';
    if (lines.length > 1) cleanDesc = lines.slice(1).join('\n');
  }

  cleanTitle = cleanTitle.replace(/^[📌📱🔴🔥✨\s]+/u, '').trim() || '社媒精选爆款素材';

  let cover = String(
    root.cover ||
      root.download_image ||
      root.image ||
      root.cover_url ||
      root.video_cover ||
      payload.cover ||
      payload.download_image ||
      '',
  );
  if (typeof root.cover === 'object' && root.cover !== null) {
    const c = root.cover as { url?: string; url_list?: string[] };
    cover = c.url || c.url_list?.[0] || cover;
  }

  const isVideoUrl = (url: string) => /\.(mp4|mov|m4v|webm|avi|flv|m3u8)(?:[?#/]|$)/i.test(url);
  const staticUrls = (value: unknown, depth = 0): string[] => {
    if (depth > 8 || value == null) return [];
    if (typeof value === 'string') {
      const url = value.trim().replace(/^\/\//, 'https://');
      return /^https?:\/\//i.test(url) && !isVideoUrl(url) ? [url] : [];
    }
    if (Array.isArray(value)) return value.flatMap((entry) => staticUrls(entry, depth + 1));
    if (typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    // Live 的 image/images 是静态图；url 可能是视频，不得优先于静态字段。
    for (const field of ['images', 'image', 'download_image', 'pic', 'origin_url', 'url_list', 'download_url', 'url']) {
      if (item[field] != null) {
        const urls = staticUrls(item[field], depth + 1);
        if (urls.length) return urls;
      }
    }
    return [];
  };
  const rawList: unknown[] = [];
  const sources = root === payload ? [root] : [root, payload];
  for (const source of sources) {
    if (Array.isArray(source)) rawList.push(...source);
    for (const field of ['images', 'pics', 'img_list', 'live_photos', 'livePhotos', 'live', 'image']) {
      if (source[field]) rawList.push(source[field]);
    }
    if (source.photo) rawList.push(typeof source.photo === 'string' ? source.photo.split(/[\n\r,;\s]+/) : source.photo);
  }
  // 使用精确 URL 去重，不能去掉查询参数：部分接口用同一路径的不同参数标识不同图片。
  const cleanImages = [...new Set(rawList.flatMap((entry) => staticUrls(entry)))];
  cover = staticUrls(root.cover || root.download_image || root.cover_url || root.video_cover || payload.cover || payload.download_image)[0] || cleanImages[0] || '';

  const VIDEO_CDN_RE = /kwaicdn|kwai|yximgs|snssdk|bytecdn|xhscdn|douyinvod/i;
  const looksLikeVideoUrl = (u: string) =>
    u.includes('.mp4') || u.includes('video') || VIDEO_CDN_RE.test(u);

  const videoUrls = (value: unknown, depth = 0): string[] => {
    if (depth > 8 || value == null) return [];
    if (typeof value === 'string') {
      const url = value.trim().replace(/^\/\//, 'https://');
      return /^https?:\/\//i.test(url) && (isVideoUrl(url) || looksLikeVideoUrl(url)) ? [url] : [];
    }
    if (Array.isArray(value)) return value.flatMap((entry) => videoUrls(entry, depth + 1));
    if (typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    return ['videos', 'video', 'down', 'download_video', 'download_url', 'play_url', 'url']
      .flatMap((field) => videoUrls(item[field], depth + 1));
  };

  // 实况作品同时包含静态封面与多段动态流，不能因存在图片而丢掉视频。
  const rawVideos = sources.flatMap((source) => [
    source.videos, source.video, source.down, source.download_video,
    source.live, source.live_photos, source.livePhotos,
  ].flatMap(videoUrls));
  const fallbackVideos = videoUrls([root.url, payload.url]);
  const cleanVideos = [...new Set([...rawVideos, ...fallbackVideos])];

  if (cleanImages.length === 0 && cover) {
    const cleanCover = cover.startsWith('//') ? 'https:' + cover : cover;
    if (cleanCover) cleanImages.push(cleanCover);
  }

  const coverOut =
    cover && cover.startsWith('//') ? 'https:' + cover : cover || cleanImages[0] || '';

  return {
    title: cleanTitle,
    description: cleanDesc,
    author,
    cover: coverOut,
    images: cleanImages,
    video: cleanVideos[0] || null,
    videos: cleanVideos,
  };
}

type ApiaFetchAttempt = {
  method: 'GET' | 'POST';
  bodyType?: 'json' | 'form';
  includeText?: boolean;
};

const FETCH_ATTEMPTS: ApiaFetchAttempt[] = [
  { method: 'GET' },
  { method: 'POST', bodyType: 'json' },
  { method: 'POST', bodyType: 'form' },
  { method: 'POST', bodyType: 'json', includeText: true },
];

async function fetchApiaOnce(
  secretKey: string,
  clientId: string,
  targetUrl: string,
  shareText: string,
  attempt: ApiaFetchAttempt,
  userAgent: string,
): Promise<{ data: Record<string, unknown> | null; httpOk: boolean }> {
  const endpoint = `${APIA_BASE}/${secretKey}/${clientId}/`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), APIA_TIMEOUT_MS);

  try {
    let res: Response;
    if (attempt.method === 'GET') {
      const apiUrl = `${endpoint}?url=${encodeURIComponent(targetUrl)}`;
      console.log(`[ApiaScraper] GET url=${targetUrl}`);
      res = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'User-Agent': userAgent },
        signal: controller.signal,
      });
    } else {
      const body: Record<string, string> = { url: targetUrl };
      if (attempt.includeText && shareText.trim()) {
        body.text = shareText.trim();
      }
      console.log(
        `[ApiaScraper] POST ${attempt.bodyType} url=${targetUrl}${attempt.includeText ? ' +text' : ''}`,
      );
      if (attempt.bodyType === 'form') {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'User-Agent': userAgent,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(body).toString(),
          signal: controller.signal,
        });
      } else {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'User-Agent': userAgent,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      }
    }

    if (!res.ok) return { data: null, httpOk: false };
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { data, httpOk: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ApiaScraper] 请求异常 (${attempt.method}):`, msg);
    return { data: null, httpOk: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isApiaSuccess(data: Record<string, unknown> | null): boolean {
  if (!data) return false;
  const code = data.code;
  if (code === 200 || code === '200') return true;
  if (data.data && typeof data.data === 'object') return true;
  return false;
}

function getApiaErrorCode(data: Record<string, unknown> | null): string | number | undefined {
  if (!data) return undefined;
  return data.code as string | number | undefined;
}

async function tryCredentialOrder(
  credentials: ApiaCredentials,
  targetUrl: string,
  shareText: string,
  userAgent: string,
  retryOnTransient: boolean,
): Promise<{ media: ApiaMediaResult | null; lastCode?: string | number; lastMsg: string }> {
  let lastCode: string | number | undefined;
  let lastMsg = '';
  let useSwapped = false;

  for (let round = 0; round < 2; round++) {
    const secretKey = useSwapped ? credentials.clientId : credentials.secretKey;
    const clientId = useSwapped ? credentials.secretKey : credentials.clientId;

    for (const attempt of FETCH_ATTEMPTS) {
      const run = async (): Promise<ApiaMediaResult | 'auth_error' | null> => {
        const { data, httpOk } = await fetchApiaOnce(
          secretKey,
          clientId,
          targetUrl,
          shareText,
          attempt,
          userAgent,
        );
        if (!httpOk || !data) return null;

        const code = getApiaErrorCode(data);
        console.log('[ApiaScraper] 接口响应:', code, data.msg || data.title);

        if (code === 155 || code === '155') {
          lastCode = 155;
          lastMsg = mapApiaErrorCode(155);
          return 'auth_error';
        }

        if (!isApiaSuccess(data)) {
          lastCode = code;
          lastMsg = mapApiaErrorCode(code, String(data.msg || ''));
          return null;
        }

        const media = extractMediaFromApiaData(data);
        if (media.images.length > 0 || media.video) {
          return media;
        }
        return null;
      };

      let result = await run();

      if (result === 'auth_error') {
        if (!useSwapped && round === 0) {
          useSwapped = true;
          break;
        }
        return { media: null, lastCode, lastMsg };
      }

      if (
        result === null &&
        retryOnTransient &&
        (lastCode === 114 || lastCode === '114' || lastCode === 110 || lastCode === '110')
      ) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        result = await run();
      }

      if (result && result !== 'auth_error') {
        return { media: result, lastCode, lastMsg };
      }
    }

    if (lastCode === 155 || lastCode === '155') {
      if (!useSwapped) {
        useSwapped = true;
        continue;
      }
      break;
    }

    if (!useSwapped) break;
  }

  return { media: null, lastCode, lastMsg };
}

/** 使用 APIA 解析社媒链接（多 URL 候选 + GET/POST + 重试） */
export async function parseSocialLinkViaApia(
  rawText: string,
  credentials: ApiaCredentials,
): Promise<ApiaParseResult> {
  const candidateUrls = await buildApiaCandidateUrls(rawText);
  if (candidateUrls.length === 0) {
    return { success: false, error: '未能从输入中提取有效链接' };
  }

  let lastCode: string | number | undefined;
  let lastMsg = '';

  for (const targetUrl of candidateUrls) {
    const userAgent = pickUserAgentForUrl(targetUrl);
    const { media, lastCode: code, lastMsg: msg } = await tryCredentialOrder(
      credentials,
      targetUrl,
      rawText,
      userAgent,
      true,
    );

    if (media) {
      return { success: true, media, apiUsed: '⚡ APIA 社媒全网无水印解析专线' };
    }

    lastCode = code;
    lastMsg = msg;
    if (code === 155 || code === '155') break;
  }

  return {
    success: false,
    error: lastMsg || '未能提取到该作品的图集或视频',
    upstreamCode: lastCode,
  };
}

/** 测试 APIA 凭证与小红书解析能力 */
export async function testApiaConnection(
  credentials: ApiaCredentials,
  testUrl = 'https://www.xiaohongshu.com/explore/661234567890abcdef123456',
): Promise<{
  success: boolean;
  authOk: boolean;
  parseOk: boolean;
  latencyMs: number;
  message: string;
  upstreamCode?: string | number;
}> {
  const start = Date.now();
  const result = await parseSocialLinkViaApia(testUrl, credentials);
  const latencyMs = Date.now() - start;

  if (result.success) {
    return {
      success: true,
      authOk: true,
      parseOk: true,
      latencyMs,
      message: `APIA 密钥有效且小红书解析成功（${result.media.images.length} 张图）！延迟 ${latencyMs}ms`,
    };
  }

  const code = result.upstreamCode;
  const authOk = code !== 155 && code !== '155';

  return {
    success: authOk,
    authOk,
    parseOk: false,
    latencyMs,
    upstreamCode: code,
    message: authOk
      ? `APIA 密钥连通正常，但测试笔记未能解析 [${code ?? '?'}]: ${result.error}（延迟 ${latencyMs}ms）`
      : `APIA 密钥或 ID 配置错误 [155]: ${result.error}`,
  };
}
