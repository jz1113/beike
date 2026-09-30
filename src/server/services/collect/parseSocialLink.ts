import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { extractUrlFromShareText, parseSocialLinkViaApia } from '@server/infrastructure/collection/apiaScraper';
import { parseSocialLinkViaQiyun } from '@server/infrastructure/collection/qiyunScraper';
import { cleanSocialMedia, socialFailure, socialLinkBodyError } from './socialMediaSupport';

const parseResult = (body: Record<string, unknown>, status = 200) => ({ body, status });
type Attempt = { provider: string; success: boolean; error?: string; upstreamCode?: string | number; httpStatus?: number; status?: number; retryable?: boolean };
type ParseResult = { success: true; media: ReturnType<typeof cleanSocialMedia>; apiUsed: string } | { success: false; error: string; upstreamCode?: string | number; httpStatus?: number };

async function tryProvider(name: string, run: () => Promise<ParseResult>, attempts: Attempt[]): Promise<ParseResult | null> {
  try {
    let result = await run();
    if (result.success) {
      const media = cleanSocialMedia(result.media);
      result = media.images.length || media.video
        ? { ...result, media }
        : { success: false, error: '接口未返回有效图片或视频素材' };
    }
    attempts.push(result.success ? { provider: name, success: true } :
      { provider: name, success: false, error: result.error, upstreamCode: result.upstreamCode, httpStatus: result.httpStatus,
        ...socialFailure(name, result.upstreamCode, result.error, result.httpStatus) });
    return result.success ? { ...result, apiUsed: name } : result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    attempts.push({ provider: name, success: false, error: message, ...socialFailure(name, undefined, message) });
    return { success: false, error: message };
  }
}

export type SocialLinkCredentials = { qAppId: string; qAppKey: string; apiaSecret: string; apiaClient: string };

export async function parseSocialLink(body: Record<string, unknown>, credentials: SocialLinkCredentials, signal: AbortSignal) {
  try {
    const bodyError = socialLinkBodyError(body);
    if (bodyError) return parseResult({ success: false, error: bodyError }, 400);
    const { url, text, link, query, preferredScraper } = body;
    const rawInput = (url || text || link || query || '').toString().trim();
    if (!rawInput) {
      return parseResult({ error: '请输入有效的小红书/抖音/快手/视频号分享链接或图片网址' }, 400);
    }
    const targetUrl = extractUrlFromShareText(rawInput);
    let parsedUrl: URL;
    try { parsedUrl = new URL(targetUrl); }
    catch { return parseResult({ success: false, error: '请输入包含 http(s) 地址的有效分享链接或图片网址' }, 400); }
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
      return parseResult({ success: false, error: '仅支持 http(s) 分享链接或图片网址' }, 400);
    }
    signal.throwIfAborted();
    if (/\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i.test(parsedUrl.pathname)) {
      return parseResult({
        success: true, title: '图片直链素材', cover: targetUrl, images: [targetUrl],
        video: null, videos: [],
        data: { title: '图片直链素材', cover: targetUrl, images: [targetUrl], description: '', author: '', video: null, videos: [] },
      });
    }

    const { qAppId, qAppKey, apiaSecret, apiaClient } = credentials;
    const hasQiyun = Boolean(qAppId && qAppKey);
    const hasApia = Boolean(apiaSecret && apiaClient);
    if (!hasQiyun && !hasApia) {
      return parseResult({ success: false, error: '未配置社媒解析密钥。请前往「设置 -> 服务接口配置」配置「奇云解析 (支持30+主流平台)」或「APIA 解析」。' }, 400);
    }

    const host = parsedUrl.hostname.toLowerCase();
    const isWechatOrWeiboOrBili = ['weixin.qq.com', 'weibo.com', 'weibo.cn', 'bilibili.com', 'b23.tv', 'pipix.com', 'pipixia.com']
      .some(root => host === root || host.endsWith(`.${root}`));
    if (isWechatOrWeiboOrBili && !hasQiyun) {
      return parseResult({ success: false, error: '该平台需要奇云解析，请在「设置 -> 服务接口配置」配置奇云 AppId 和 AppKey' }, 400);
    }
    const attempts: Attempt[] = [];
    const qiyunFirst = preferredScraper === 'qiyun' || isWechatOrWeiboOrBili || (hasQiyun && !hasApia);
    const order: Array<'奇云' | 'APIA'> = qiyunFirst
      ? [...(hasQiyun ? ['奇云' as const] : []), ...(hasApia && !isWechatOrWeiboOrBili ? ['APIA' as const] : [])]
      : [...(hasApia ? ['APIA' as const] : []), ...(hasQiyun ? ['奇云' as const] : [])];

    let result: ParseResult | null = null;
    for (const provider of order) {
      signal.throwIfAborted();
      const next = provider === '奇云'
        ? await tryProvider('奇云', () => parseSocialLinkViaQiyun(rawInput, { appId: qAppId, appKey: qAppKey }, signal), attempts)
        : await tryProvider('APIA', () => parseSocialLinkViaApia(rawInput, { clientId: apiaClient, secretKey: apiaSecret }, signal), attempts);
      signal.throwIfAborted();
      if (next?.success) { result = next; break; }
      result = next;
    }

    if (!result) return parseResult({ success: false, error: '解析调度异常，无可用解析引擎', attempts }, 500);
    if (result.success) {
      const extracted = result.media;
      return parseResult({
        success: true,
        title: extracted.title,
        description: extracted.description,
        author: extracted.author,
        cover: extracted.cover,
        images: extracted.images,
        video: extracted.video,
        videos: extracted.videos,
        apiUsed: result.apiUsed,
        attempts,
        data: extracted,
      });
    }
    const failure = socialFailure(attempts.at(-1)?.provider || '', result.upstreamCode, result.error, result.httpStatus);
    return parseResult({
      success: false,
      error: attempts.map((a) => a.error).filter(Boolean).join('；') || result.error,
      attempts,
      upstreamCode: result.upstreamCode,
      httpStatus: result.httpStatus,
      retryable: failure.retryable,
    }, failure.status);
  } catch (error: unknown) {
    if (signal.aborted) return parseResult({ success: false, error: '采集已取消' }, 499);
    console.error('[ParseLink] 全局异常:', error);
    return parseResult({ error: formatUserError(error, '解析遇到未知错误') }, 500);
  }
}
