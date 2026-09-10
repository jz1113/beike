import { jsonResponse } from '../../../core/http';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { parseSocialLinkViaApia } from '@beike/server-kit/apiaScraper';
import { parseSocialLinkViaQiyun } from '@beike/server-kit/qiyunScraper';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      url,
      text,
      link,
      query,
      scraperId,
      customScraperId,
      scraperSecret,
      customApiKey,
      qiyunAppId,
      qiyunAppKey,
      customQiyunAppId,
      customQiyunAppKey,
      preferredScraper,
      persistToStorage,
      storageConfig: rawStorageConfig,
    } = body;

    const rawInput = (url || text || link || query || '').toString().trim();

    if (!rawInput) {
      return jsonResponse({ error: '请输入有效的小红书/抖音/快手/视频号分享链接或图片网址' }, 400);
    }

    // 1. 图片直链快速返回
    if (
      /\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|!|$)/i.test(rawInput) &&
      (rawInput.startsWith('http://') || rawInput.startsWith('https://'))
    ) {
      return jsonResponse({
        success: true,
        title: '图片直链素材',
        cover: rawInput,
        images: [rawInput],
        data: {
          title: '图片直链素材',
          cover: rawInput,
          images: [rawInput],
          description: '',
          author: '',
          video: null,
        },
      });
    }

    const qAppId = (qiyunAppId || customQiyunAppId || process.env.QIYUN_APP_ID || '').trim();
    const qAppKey = (qiyunAppKey || customQiyunAppKey || process.env.QIYUN_APP_KEY || '').trim();
    const hasQiyun = Boolean(qAppId && qAppKey);

    const apiaSecret = (scraperSecret || customApiKey || process.env.EXTERNAL_SCRAPER_SECRET || '').trim();
    const apiaClient = (scraperId || customScraperId || process.env.EXTERNAL_SCRAPER_ID || '').trim();
    const hasApia = Boolean(apiaSecret && apiaClient);

    if (!hasQiyun && !hasApia) {
      return jsonResponse(
        {
          success: false,
          error:
            '未配置社媒解析密钥。请前往「设置 -> 服务接口配置」配置「奇云解析 (支持30+主流平台)」或「APIA 解析」。',
        },
        400,
      );
    }

    // 识别微信视频号/微博/B站/皮皮虾等特殊平台
    const isWechatOrWeiboOrBili = /(?:weixin\.qq\.com|weibo\.com|bilibili\.com|b23\.tv|pipixia)/i.test(rawInput);

    let result:
      | { success: true; media: any; apiUsed: string }
      | { success: false; error: string; upstreamCode?: string | number }
      | null = null;

    // 优先奇云策略（奇云支持 30+ 平台，覆盖度更广；或者微信/微博等平台必须走奇云）
    if (hasQiyun && (preferredScraper === 'qiyun' || isWechatOrWeiboOrBili || !hasApia)) {
      result = await parseSocialLinkViaQiyun(rawInput, { appId: qAppId, appKey: qAppKey });
      // 如果奇云失败且配置了 APIA，则无感回退 APIA
      if (!result.success && hasApia && !isWechatOrWeiboOrBili) {
        const apiaRes = await parseSocialLinkViaApia(rawInput, { clientId: apiaClient, secretKey: apiaSecret });
        if (apiaRes.success) result = apiaRes;
      }
    } else if (hasApia) {
      result = await parseSocialLinkViaApia(rawInput, { clientId: apiaClient, secretKey: apiaSecret });
      // 如果 APIA 失败且配置了奇云，则无感回退奇云
      if (!result.success && hasQiyun) {
        const qiyunRes = await parseSocialLinkViaQiyun(rawInput, { appId: qAppId, appKey: qAppKey });
        if (qiyunRes.success) result = qiyunRes;
      }
    } else if (hasQiyun) {
      result = await parseSocialLinkViaQiyun(rawInput, { appId: qAppId, appKey: qAppKey });
    }

    if (!result) {
      return jsonResponse({ success: false, error: '解析调度异常，无可用解析引擎' }, 500);
    }

    if (result.success) {
      const extracted = result.media;

      // 🌟 去掉实况视频，只保留静态图片：如果解析到了图集，过滤视频链接并将 video 置为空，避免实况图被当成视频作品
      if (Array.isArray(extracted.images) && extracted.images.length > 0) {
        extracted.images = extracted.images.filter(
          (img: string) => typeof img === 'string' && !/\.(mp4|mov|m4v|webm|avi|flv)(\?|#|$)/i.test(img)
        );
        extracted.video = null;
        if ('livePhotos' in extracted) {
          delete extracted.livePhotos;
        }
        if (extracted.images[0]) {
          extracted.cover = extracted.images[0];
        }
      }


      return jsonResponse({
        success: true,
        title: extracted.title,
        description: extracted.description,
        author: extracted.author,
        cover: extracted.cover,
        images: extracted.images,
        video: extracted.video,
        data: extracted,
      });
    }

    return jsonResponse(
      {
        success: false,
        error: result.error,
        upstreamCode: result.upstreamCode,
      },
      502,
    );
  } catch (error: unknown) {
    console.error('[ParseLink] 全局异常:', error);
    return jsonResponse(
      {
        error: formatUserError(error, '解析遇到未知错误'),
      },
      500,
    );
  }
}
