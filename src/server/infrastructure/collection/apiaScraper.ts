import { assertSafeRemoteUrl } from '../network/safeUrl';
import { socialRemoteUrl } from './socialMediaUrls';

import { extractMediaFromApiaData, type ApiaMediaResult } from './apiaMedia';
export { extractMediaFromApiaData } from './apiaMedia';
export type { ApiaMediaResult } from './apiaMedia';

export type ApiaCredentials = {
  clientId: string;
  secretKey: string;
};

export type ApiaParseResult =
  | { success: true; media: ApiaMediaResult; apiUsed: string }
  | { success: false; error: string; upstreamCode?: string | number };

const APIA_BASE = 'https://apia.vip/api/dsp';
const APIA_TIMEOUT_MS = 30_000;
const MAX_APIA_REQUESTS = 6;
const TERMINAL_APIA_CODES = new Set(['104', '107', '108', '109', '110', '115', '155', '401', '403', '429']);

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const APIA_ERROR_MAP: Record<string, string> = {
  '103': '请输入正确的作品链接',
  '104': '该解析接口已暂停使用',
  '110': '解析次数不足，请稍后再试',
  '113': '解析失败，该作品可能为私密或需要登录',
  '107': 'APIA 数据结构异常，请检查服务接口配置',
  '108': 'APIA 会员接口不存在，请检查服务接口配置',
  '109': 'APIA 会员接口已关闭，请检查账号权限',
  '114': '作品不存在或当前链接不受支持，请检查作品是否公开或换用 App 分享短链',
  '115': 'APIA 会员等级不足，请检查账号权限',
  '155': '接口密钥配置错误',
};

function isShortLink(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ['v.douyin.com', 'xhslink.com', 'v.kuaishou.com', 'b23.tv', 't.cn']
      .some(root => host === root || host.endsWith(`.${root}`));
  } catch { return false; }
}

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
  if (isShortLink(url)) {
    return MOBILE_UA;
  }
  return DESKTOP_UA;
}

/** 自动尝试解析短链重定向 */
export async function resolveShortUrlRedirect(shortUrl: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (!isShortLink(shortUrl)) {
    return shortUrl;
  }
  try {
    await assertSafeRemoteUrl(shortUrl, { requireAllowlist: true });
    signal?.throwIfAborted();
    const res = await fetch(shortUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': MOBILE_UA },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000),
    });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      const expanded = new URL(loc, shortUrl).href;
      await assertSafeRemoteUrl(expanded, { requireAllowlist: true });
      signal?.throwIfAborted();
      return expanded;
    }
  } catch (e) {
    if (signal?.aborted) throw signal.reason;
    console.warn('[ApiaScraper] 短链展开被安全策略拦截或失败:', (e as Error)?.message);
  }
  return shortUrl;
}

/** 生成 APIA 候选 URL 列表（按优先级） */
export async function buildApiaCandidateUrls(rawText: string, signal?: AbortSignal): Promise<string[]> {
  const { originalUrl, cleanUrl, discoveryUrl } = normalizeSocialMediaUrl(rawText);
  const expandedUrl = await resolveShortUrlRedirect(originalUrl, signal);

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
  signal?: AbortSignal,
): Promise<{ data: Record<string, unknown> | null; httpStatus?: number; error?: string }> {
  signal?.throwIfAborted();
  const endpoint = `${APIA_BASE}/${encodeURIComponent(secretKey)}/${encodeURIComponent(clientId)}/`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), APIA_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    let res: Response;
    if (attempt.method === 'GET') {
      const apiUrl = `${endpoint}?url=${encodeURIComponent(targetUrl)}`;
      console.log(`[ApiaScraper] GET url=${targetUrl}`);
      res = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'User-Agent': userAgent },
        signal: requestSignal,
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
          signal: requestSignal,
        });
      } else {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'User-Agent': userAgent,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: requestSignal,
        });
      }
    }

    if (!res.ok) return { data: null, httpStatus: res.status, error: `APIA 网关返回 HTTP ${res.status}` };
    const raw = await res.json().catch(() => null);
    const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
    return { data, httpStatus: res.status };
  } catch (err) {
    if (signal?.aborted) throw signal.reason;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ApiaScraper] 请求异常 (${attempt.method}):`, msg);
    const timeout = controller.signal.aborted;
    return { data: null, httpStatus: timeout ? 504 : undefined, error: timeout ? '请求 APIA 解析服务超时（30秒）' : '连接 APIA 解析网关失败' };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isApiaSuccess(data: Record<string, unknown> | null): boolean {
  if (!data) return false;
  const code = data.code;
  if (code === 200 || code === '200') return true;
  // 部分版本省略 code，但显式的失败码必须先于 data 判断。
  return code == null && Boolean(data.data && typeof data.data === 'object');
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
  budget: { remaining: number },
  signal?: AbortSignal,
): Promise<{ media: ApiaMediaResult | null; lastCode?: string | number; lastMsg: string }> {
  let lastCode: string | number | undefined;
  let lastMsg = '';
  let useSwapped = false;

  for (let round = 0; round < 2; round++) {
    const secretKey = useSwapped ? credentials.clientId : credentials.secretKey;
    const clientId = useSwapped ? credentials.secretKey : credentials.clientId;

    for (const attempt of FETCH_ATTEMPTS) {
      signal?.throwIfAborted();
      if (budget.remaining <= 0) return { media: null, lastCode, lastMsg };
      const run = async (): Promise<ApiaMediaResult | 'auth_error' | null> => {
        budget.remaining--;
        lastCode = undefined; lastMsg = '';
        const { data, httpStatus, error } = await fetchApiaOnce(
          secretKey,
          clientId,
          targetUrl,
          shareText,
          attempt,
          userAgent,
          signal,
        );
        signal?.throwIfAborted();
        if (!data) { lastCode = httpStatus; lastMsg = error || 'APIA 接口返回无效响应'; return null; }

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

      const result = await run();

      // 暂停服务与额度耗尽无法通过换请求方法或重试恢复。
      if (TERMINAL_APIA_CODES.has(String(lastCode)) && String(lastCode) !== '155') {
        return { media: null, lastCode, lastMsg };
      }

      if (result === 'auth_error') {
        if (!useSwapped && round === 0) {
          useSwapped = true;
          break;
        }
        return { media: null, lastCode, lastMsg };
      }

      if (result) {
        return { media: result, lastCode, lastMsg };
      }
      // 业务错误不能通过改 HTTP 方法恢复；114 官方定义为作品不存在/不支持。
      // HTTP 405 才允许尝试 POST，网络/其他网关错误直接交给备用渠道。
      if (lastCode !== undefined && !['200', '405'].includes(String(lastCode))) return { media: null, lastCode, lastMsg };
      if (lastCode === undefined && lastMsg) return { media: null, lastCode, lastMsg };
    }

    if (String(lastCode) === '155' && useSwapped && round === 0) continue;
    if (!useSwapped) break;
  }

  return { media: null, lastCode, lastMsg };
}

/** 使用 APIA 解析社媒链接；候选 URL 与 GET/POST 兼容尝试共用请求上限。 */
export async function parseSocialLinkViaApia(
  rawText: string,
  credentials: ApiaCredentials,
  signal?: AbortSignal,
): Promise<ApiaParseResult> {
  signal?.throwIfAborted();
  const trimmed = { clientId: credentials.clientId?.trim(), secretKey: credentials.secretKey?.trim() };
  if (!trimmed.clientId || !trimmed.secretKey) return { success: false, error: '未配置 APIA 接口 ID 与密钥' };
  if (!socialRemoteUrl(extractUrlFromShareText(rawText))) return { success: false, error: '未能从输入中提取有效链接' };
  const candidateUrls = await buildApiaCandidateUrls(rawText, signal);
  if (candidateUrls.length === 0) {
    return { success: false, error: '未能从输入中提取有效链接' };
  }

  let lastCode: string | number | undefined;
  let lastMsg = '';
  const budget = { remaining: MAX_APIA_REQUESTS };

  for (const targetUrl of candidateUrls) {
    signal?.throwIfAborted();
    const userAgent = pickUserAgentForUrl(targetUrl);
    const { media, lastCode: code, lastMsg: msg } = await tryCredentialOrder(
      trimmed,
      targetUrl,
      rawText,
      userAgent,
      budget,
      signal,
    );

    if (media) {
      return { success: true, media, apiUsed: '⚡ APIA 社媒全网无水印解析专线' };
    }

    lastCode = code;
    lastMsg = msg;
    if (TERMINAL_APIA_CODES.has(String(code)) || budget.remaining <= 0 ||
      (Number(code) >= 400 && String(code) !== '405') || (code === undefined && msg)) break;
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
  const authOk = ['103', '104', '110', '113', '114'].includes(String(code));

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
