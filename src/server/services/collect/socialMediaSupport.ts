import { socialImageUrl, socialVideoUrl } from '@server/infrastructure/collection/socialMediaUrls';

type Media = {
  title: string; description: string; author: string; cover: string; images: string[]; video: string | null; videos: string[];
};

/** 保留签名参数与原始图集顺序；只保留远程静态图及完整的视频素材列表。 */
export function cleanSocialMedia(value: unknown): Media {
  const media = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const text = (field: string) => typeof media[field] === 'string' ? (media[field] as string).trim() : '';
  const images = Array.isArray(media.images) ? [...new Set(media.images.map(socialImageUrl).filter(Boolean))] : [];
  const videos = [...new Set([...(Array.isArray(media.videos) ? media.videos : []), media.video].map(socialVideoUrl).filter((url): url is string => Boolean(url)))];
  const video = videos[0] || null;
  const cover = socialImageUrl(media.cover) || images[0] || '';
  if (!images.length && !video && cover) images.push(cover);
  return { ...media, title: text('title'), description: text('description'), author: text('author'), cover, images, video, videos };
}

/** Keep provider business errors distinct from temporary network failures. */
export function socialFailure(provider: string, code: string | number | undefined, error: string, httpStatus?: number): { status: number; retryable: boolean } {
  const value = String(code);
  if (httpStatus !== undefined) {
    if (httpStatus === 429) return { status: 429, retryable: false };
    if ([401, 403].includes(httpStatus)) return { status: 400, retryable: false };
    if ([408, 504].includes(httpStatus)) return { status: 504, retryable: true };
    return { status: httpStatus >= 500 ? 502 : 400, retryable: httpStatus >= 500 };
  }
  if (value === '429' || (provider === '奇云' && value === '3001') || /频繁|频控|验证码|风控|请求受限|rate.?limit|too many requests/i.test(error)) {
    return { status: 429, retryable: false };
  }
  if ((provider === '奇云' && ['3002', '3003'].includes(value)) || (provider === 'APIA' && value === '110')) {
    return { status: 402, retryable: false };
  }
  if (['401', '403'].includes(value) || (provider === '奇云' && ['1001', '1005'].includes(value)) ||
    (provider === 'APIA' && ['107', '108', '109', '115', '155'].includes(value))) return { status: 400, retryable: false };
  if ((provider === '奇云' && ['204', '500'].includes(value)) || (provider === 'APIA' && ['103', '113', '114'].includes(value))) {
    return { status: 422, retryable: false };
  }
  if (provider === 'APIA' && value === '104') return { status: 503, retryable: false };
  return { status: value === '504' || /超时|timeout/i.test(error) ? 504 : 502, retryable: true };
}

const SOCIAL_BODY_FIELDS = ['url', 'text', 'link', 'query', 'scraperId', 'customScraperId', 'scraperSecret', 'customApiKey',
  'qiyunAppId', 'qiyunAppKey', 'customQiyunAppId', 'customQiyunAppKey', 'preferredScraper'] as const;

export function socialLinkBodyError(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '请求体必须为 JSON 对象';
  const input = body as Record<string, unknown>;
  if (SOCIAL_BODY_FIELDS.some(key => input[key] !== undefined &&
    (typeof input[key] !== 'string' || (input[key] as string).length > 8192))) {
    return '链接、解析配置必须为有效文本（最多 8192 字符）';
  }
}
