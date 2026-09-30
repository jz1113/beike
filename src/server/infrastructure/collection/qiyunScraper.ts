import { extractUrlFromShareText } from './apiaScraper';
import { socialImageUrl, socialRemoteUrl, socialVideoUrl } from './socialMediaUrls';

export type QiyunMediaResult = {
  title: string;
  description: string;
  author: string;
  authorAvatar?: string;
  cover: string;
  images: string[];
  video: string | null;
  /** 作品可能含多个视频或实况视频；video 是首条兼容字段。 */
  videos: string[];
  music?: string;
  livePhotos?: string[];
};

export type QiyunCredentials = {
  appId: string;
  appKey: string;
  endpoint?: string;
};

export type QiyunParseResult =
  | { success: true; media: QiyunMediaResult; apiUsed: string }
  | { success: false; error: string; upstreamCode?: string | number; httpStatus?: number };

const DEFAULT_QIYUN_ENDPOINT = 'https://qyapi.ipaybuy.cn/api/video';
const QIYUN_TIMEOUT_MS = 25_000;

const QIYUN_ERROR_MAP: Record<string | number, string> = {
  '200': '解析成功',
  '204': '暂时不支持解析该平台或作者设置了权限',
  '500': '解析失败，请检查链接是否正确或该作品是否已被删除',
  '1001': '参数错误，请检查请求参数',
  '1005': '奇云商户平台服务账号状态异常，请联系客服',
  '3001': '请求过于频繁，请稍后再试',
  '3002': '奇云解析调用次数不足，请升级套餐或充值',
  '3003': '奇云解析今日调用次数已达上限',
};

export function mapQiyunErrorCode(code: string | number | undefined, fallback?: string): string {
  if (code == null) return fallback || '短视频或图集解析异常';
  return QIYUN_ERROR_MAP[String(code)] || fallback || '短视频或图集解析异常';
}

/**
 * 通过奇云 API 解析多平台短视频 / 图集去水印
 * 支持抖音、快手、小红书、微信视频号、微博、B站、皮皮虾等 30+ 平台
 */
export async function parseSocialLinkViaQiyun(
  rawText: string,
  credentials: QiyunCredentials,
  signal?: AbortSignal,
): Promise<QiyunParseResult> {
  signal?.throwIfAborted();
  const appId = credentials.appId?.trim();
  const appKey = credentials.appKey?.trim();

  if (!appId || !appKey) {
    return { success: false, error: '未配置奇云 AppId 与 AppKey' };
  }

  const targetUrl = extractUrlFromShareText(rawText);
  if (!socialRemoteUrl(targetUrl)) {
    return { success: false, error: '未能从输入中提取有效社媒链接' };
  }

  const endpoint = credentials.endpoint || DEFAULT_QIYUN_ENDPOINT;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        appId,
        appKey,
        url: targetUrl,
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(QIYUN_TIMEOUT_MS)]) : AbortSignal.timeout(QIYUN_TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        success: false,
        error: `奇云网关返回 HTTP ${res.status}: ${res.statusText}`,
        upstreamCode: res.status,
        httpStatus: res.status,
      };
    }

    const data = await res.json();
    signal?.throwIfAborted();
    if (!data) {
      return { success: false, error: '奇云接口返回空响应' };
    }

    if (String(data.code) === '200' && data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      const item = data.data;

      // 静态图片与实况视频分别收集。实况笔记可同时拥有图片和动态流。
      const rawImages: string[] = [];
      const rawVideos: string[] = [];

      if (Array.isArray(item.images)) {
        for (const img of item.images) {
          let imgUrl = '';
          if (typeof img === 'string') {
            imgUrl = img.trim();
          } else if (img && typeof img === 'object') {
            if (img.url && typeof img.url === 'string') {
              imgUrl = img.url.trim();
            }
            const liveUrl = img.live_photo_url || img.livePhotoUrl || img.video_url;
            if (typeof liveUrl === 'string' && liveUrl.trim()) rawVideos.push(liveUrl.trim());
          }

          // 严格剔除可能混入的视频/实况流地址
          const image = socialImageUrl(imgUrl);
          if (image && !rawImages.includes(image)) {
            rawImages.push(image);
          }
        }
      }

      const videoCandidates = [
        ...rawVideos,
        item.video_url,
        item.video,
        ...(Array.isArray(item.videos) ? item.videos : []),
        ...(Array.isArray(item.live_photos) ? item.live_photos : []),
      ].flatMap((entry: unknown) => {
        if (typeof entry === 'string') return entry.trim() ? [entry.trim()] : [];
        if (entry && typeof entry === 'object') {
          const obj = entry as Record<string, unknown>;
          return [obj.video_url, obj.video, obj.url, obj.live_photo_url]
            .filter((url): url is string => typeof url === 'string' && Boolean(url.trim()))
            .map((url) => url.trim());
        }
        return [];
      }).map(socialVideoUrl).filter((url): url is string => Boolean(url));
      const videos = [...new Set(videoCandidates)];

      // 仅在非视频作品且 rawImages 为空但有静态封面图时才备选
      const cover = socialImageUrl(item.cover_url);
      if (videos.length === 0 && rawImages.length === 0 && cover) {
        rawImages.push(cover);
      }

      const media: QiyunMediaResult = {
        title: typeof item.title === 'string' ? item.title.trim() : '',
        description: typeof (item.content || item.title) === 'string' ? (item.content || item.title).trim() : '',
        author: typeof item.author?.name === 'string' ? item.author.name.trim() : '',
        authorAvatar: socialImageUrl(item.author?.avatar),
        cover: cover || rawImages[0] || '',
        images: rawImages,
        video: videos[0] || null,
        videos,
        music: socialRemoteUrl(item.music_url) || undefined,
      };

      return {
        success: true,
        media,
        apiUsed: '⚡ 奇云多平台短视频/图集去水印解析 (30+平台)',
      };
    }

    const errorMsg = mapQiyunErrorCode(data.code, data.msg);
    return {
      success: false,
      error: errorMsg || data.msg || '解析失败',
      upstreamCode: data.code,
    };
  } catch (err: unknown) {
    if (signal?.aborted) throw signal.reason;
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return {
      success: false,
      error: isTimeout ? '请求奇云解析服务超时（25秒）' : (err instanceof Error ? err.message : '连接奇云网关失败'),
    };
  }
}

/**
 * 测试奇云解析接口连通性
 */
export async function testQiyunConnection(
  credentials: QiyunCredentials,
  testUrl = 'https://v.douyin.com/iLrqc12/',
): Promise<{
  success: boolean;
  message: string;
  upstreamCode?: string | number;
}> {
  const res = await parseSocialLinkViaQiyun(testUrl, credentials);
  if (res.success) {
    return {
      success: true,
      message: `奇云接口测试通过！已成功提取《${res.media.title.slice(0, 20) || '作品'}》`,
    };
  }

  // 1001/204 说明密钥有效但测试链接已过期或未公开
  if (!res.httpStatus && ['204', '500'].includes(String(res.upstreamCode))) {
    return {
      success: true,
      message: `奇云 AppId/AppKey 凭证校验通过（测试样本返回状态码: ${res.upstreamCode}）`,
      upstreamCode: res.upstreamCode,
    };
  }

  return {
    success: false,
    message: res.error,
    upstreamCode: res.upstreamCode,
  };
}
