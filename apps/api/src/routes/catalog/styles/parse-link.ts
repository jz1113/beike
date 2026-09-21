import { jsonResponse } from '../../../core/http';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { parseSocialLinkViaApia } from '@beike/server-kit/apiaScraper';
import { parseSocialLinkViaQiyun } from '@beike/server-kit/qiyunScraper';

type Attempt = { provider: string; success: boolean; error?: string };
type ParseResult = { success: true; media: any; apiUsed: string } | { success: false; error: string; upstreamCode?: string | number };

function cleanMedia(extracted: any) {
  const images = Array.isArray(extracted.images)
    ? extracted.images.filter((img: string) => typeof img === 'string' && !/\.(mp4|mov|m4v|webm|avi|flv)(\?|#|$)/i.test(img))
    : [];
  const video = typeof extracted.video === 'string' && extracted.video.trim() ? extracted.video.trim() : null;
  const videos = Array.from(new Set([
    ...(Array.isArray(extracted.videos) ? extracted.videos : []),
    video,
  ].filter((url): url is string => typeof url === 'string' && Boolean(url.trim()))));
  extracted.images = images;
  extracted.videos = videos;
  extracted.video = videos[0] || null;
  if (!extracted.cover && images[0]) extracted.cover = images[0];
  return extracted;
}

async function tryProvider(name: string, run: () => Promise<ParseResult>, attempts: Attempt[]): Promise<ParseResult | null> {
  try {
    const result = await run();
    attempts.push({ provider: name, success: result.success, error: result.success ? undefined : result.error });
    return result.success ? { ...result, apiUsed: name } : result;
  } catch (error) {
    attempts.push({ provider: name, success: false, error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      url, text, link, query, scraperId, customScraperId, scraperSecret, customApiKey,
      qiyunAppId, qiyunAppKey, customQiyunAppId, customQiyunAppKey, preferredScraper,
    } = body;
    const rawInput = (url || text || link || query || '').toString().trim();
    if (!rawInput) {
      return jsonResponse({ error: '请输入有效的小红书/抖音/快手/视频号分享链接或图片网址' }, 400);
    }
    if (/\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|!|$)/i.test(rawInput) && /^https?:\/\//i.test(rawInput)) {
      return jsonResponse({
        success: true, title: '图片直链素材', cover: rawInput, images: [rawInput],
        data: { title: '图片直链素材', cover: rawInput, images: [rawInput], description: '', author: '', video: null },
      });
    }

    const qAppId = (qiyunAppId || customQiyunAppId || req.headers.get('x-qiyun-appid') || process.env.QIYUN_APP_ID || '').trim();
    const qAppKey = (qiyunAppKey || customQiyunAppKey || req.headers.get('x-qiyun-appkey') || process.env.QIYUN_APP_KEY || '').trim();
    const apiaSecret = (scraperSecret || customApiKey || req.headers.get('x-apia-secret-key') || process.env.EXTERNAL_SCRAPER_SECRET || '').trim();
    const apiaClient = (scraperId || customScraperId || req.headers.get('x-apia-client-id') || process.env.EXTERNAL_SCRAPER_ID || '').trim();
    const hasQiyun = Boolean(qAppId && qAppKey);
    const hasApia = Boolean(apiaSecret && apiaClient);
    if (!hasQiyun && !hasApia) {
      return jsonResponse({ success: false, error: '未配置社媒解析密钥。请前往「设置 -> 服务接口配置」配置「奇云解析 (支持30+主流平台)」或「APIA 解析」。' }, 400);
    }

    const isWechatOrWeiboOrBili = /(?:weixin\.qq\.com|weibo\.com|bilibili\.com|b23\.tv|pipixia)/i.test(rawInput);
    const attempts: Attempt[] = [];
    const qiyunFirst = preferredScraper === 'qiyun' || isWechatOrWeiboOrBili || (hasQiyun && !hasApia);
    const order: Array<'奇云' | 'APIA'> = qiyunFirst
      ? [...(hasQiyun ? ['奇云' as const] : []), ...(hasApia && !isWechatOrWeiboOrBili ? ['APIA' as const] : [])]
      : [...(hasApia ? ['APIA' as const] : []), ...(hasQiyun ? ['奇云' as const] : [])];

    let result: ParseResult | null = null;
    for (const provider of order) {
      const next = provider === '奇云'
        ? await tryProvider('奇云', () => parseSocialLinkViaQiyun(rawInput, { appId: qAppId, appKey: qAppKey }), attempts)
        : await tryProvider('APIA', () => parseSocialLinkViaApia(rawInput, { clientId: apiaClient, secretKey: apiaSecret }), attempts);
      if (next?.success) { result = next; break; }
      result = next;
    }

    if (!result) return jsonResponse({ success: false, error: '解析调度异常，无可用解析引擎', attempts }, 500);
    if (result.success) {
      const extracted = cleanMedia(result.media);
      return jsonResponse({
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
    return jsonResponse({
      success: false,
      error: attempts.map((a) => a.error).filter(Boolean).join('；') || result.error,
      attempts,
      upstreamCode: result.upstreamCode,
    }, 502);
  } catch (error: unknown) {
    console.error('[ParseLink] 全局异常:', error);
    return jsonResponse({ error: formatUserError(error, '解析遇到未知错误') }, 500);
  }
}
