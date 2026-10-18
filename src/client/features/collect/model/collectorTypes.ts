import { handleImgError, MEDIA_FALLBACK_IMG } from '@client/shared/media/imageError';
import { isKnownSocialImageHost, normalizeImageSource, normalizeRemoteMediaUrl } from '@shared/domain/media/drawing';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

export type DetectedPlatform = 'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social';

/**
 * 从文本中智能识别平台类型。
 * 支持：京东、淘宝/天猫、1688、拼多多、社媒（小红书/抖音/快手）。
 * 纯数字 ID（7~20 位）默认按京东处理；未知域名交由接口校验。
 */
export function detectPlatformFromText(raw: string): DetectedPlatform {
  if (/^\d{7,20}$/.test(raw.trim())) return 'jd';
  const link = extractUrlsFromRawText(raw).find(value => /^https?:\/\//i.test(value));
  if (!link) return 'auto';
  try {
    const host = new URL(link).hostname.toLowerCase();
    const matches = (...domains: string[]) => domains.some(domain => host === domain || host.endsWith(`.${domain}`));
    if (matches('jd.com', '3.cn', '360buy.com')) return 'jd';
    if (matches('taobao.com', 'tmall.com', 'tb.cn')) return 'taobao';
    if (matches('1688.com')) return '1688';
    if (matches('pinduoduo.com', 'yangkeduo.com')) return 'pinduoduo';
    if (matches('xiaohongshu.com', 'xhslink.com', 'douyin.com', 'iesdouyin.com', 'kuaishou.com', 'weibo.com', 't.cn', 'bilibili.com', 'b23.tv')) return 'social';
  } catch { /* Invalid links are rejected before collection. */ }
  return 'auto';
}

/**
 * 从原始文本中批量提取商品链接与纯数字 ID。
 * - 匹配所有 http(s):// 链接
 * - 匹配链接之外独立的 7~20 位纯数字商品 ID（如京东商品编码）
 * - 自动去重
 */
export function extractUrlsFromRawText(text: string): string[] {
  if (!text) return [];
  const urlPattern = /https?:\/\/[^\s,;"'<>()[\]，；。！？、（）【】「」《》]+/gi;
  const inputs: Array<{ value: string; index: number }> = [];
  const outsideLinks = text.replace(urlPattern, (raw, index: number) => {
    const value = raw.replace(/[.!]+$/, '').replace(/&amp;/gi, '&');
    inputs.push({ value, index });
    return ' '.repeat(raw.length);
  });
  for (const match of outsideLinks.matchAll(/(?:^|[\s,;，；])([0-9]{7,20})(?=$|[\s,;，；])/g)) {
    inputs.push({ value: match[1], index: match.index! });
  }
  return [...new Set(inputs.sort((a, b) => a.index - b.index).map(item => item.value))];
}

export interface BatchTaskItem {
  id: string;
  url: string;
  cleanId?: string;
  platform: 'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social';
  platformName?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  title?: string;
  coverImage?: string;
  images?: string[];
  video?: string | null;
  videos?: string[];
  livePhotos?: string[];
  /** 入队序号，下载包与 Excel 清单均以此排序。 */
  importOrder?: number;
  price?: number;
  author?: string;
  error?: string;
  time?: string;
}

export const secondaryBtnClass =
  'h-9 px-3 rounded-xl bg-white/90 hover:bg-white dark:bg-[#202024] dark:hover:bg-[#28282D] border border-slate-200/90 dark:border-white/10 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0';

export const COLLECTOR_FALLBACK_IMG = MEDIA_FALLBACK_IMG;
export const INSPIRATION_FALLBACK_IMG = COLLECTOR_FALLBACK_IMG;
export { handleImgError };

/** 社媒/防盗链图床优先走本站代理与稳定官方 CDN，避免浏览器直链失败 */
export const displayMediaSrc = (rawUrl?: string) => {
  if (!rawUrl) return '';
  const u = normalizeImageSource(rawUrl);
  if (isKnownSocialImageHost(u)) {
    return proxyMediaUrl(u);
  }
  return u;
};

export const displayVideoSrc = (rawUrl?: string | null) => {
  if (!rawUrl) return '';
  const url = normalizeRemoteMediaUrl(rawUrl);
  return url ? proxyMediaUrl(url, { asVideo: true }) : '';
};

export const isLikelyVideoUrl = (rawUrl?: string | null) => {
  if (!rawUrl) return false;
  const source = normalizeRemoteMediaUrl(rawUrl);
  return Boolean(source && /\.(mp4|mov|webm|m4v|avi|flv|m3u8|mpd)(?:!|$)/i.test(new URL(source).pathname));
};

export const collectedVideos = (item: { video?: string | null; videoUrl?: string | null; videos?: string[] } | null | undefined) =>
  [...new Set([...(Array.isArray(item?.videos) ? item.videos : []), item?.video, item?.videoUrl]
    .map(normalizeRemoteMediaUrl).filter(Boolean))];

export const mediaAssetCount = (item: { images?: string[]; video?: string | null; videoUrl?: string | null; videos?: string[] } | null | undefined) =>
  (item?.images?.length || 0) + collectedVideos(item).length;

export interface CollectorAIAssistantImportOptions {
  item: any;
  customPrompt?: string;
  customImages?: string[];
  includeVideo?: boolean;
  selectedVideo?: boolean;
  selectedSingleImages?: string[];
  singleCollectedResultId?: string | null;
  aiAssistantPrompt?: string;
}

export interface CollectorAIAssistantPayload {
  attachments: Array<{ type: 'image' | 'video'; url: string; thumbnailUrl?: string; name?: string }>;
  prompt: string;
  hasVideo: boolean;
}

/**
 * 组装采集素材导入 AI 助手的数据包
 * 彻底解决历史库导入视频被误判丢弃、单条跨条目污染与图视互斥 Bug
 */
export function buildCollectorAIAssistantPayload(opts: CollectorAIAssistantImportOptions): CollectorAIAssistantPayload | null {
  const {
    item,
    customPrompt,
    customImages,
    includeVideo,
    selectedVideo = false,
    selectedSingleImages = [],
    singleCollectedResultId = null,
    aiAssistantPrompt = '',
  } = opts;

  if (!item) return null;
  const isSocial = item.type === 'social' || item.platform === 'social';
  const normalizeImage = normalizeImageSource;

  const videos = collectedVideos(item);
  const rawVideo = videos[0] || '';

  // 1. 确定是否导入视频：显式传参优先；若为历史/详情条目，只要自身带视频则默认导入；仅当在单条采集当前条目下才参考 selectedVideo 复选框
  const isCurrentSingleItem = Boolean(singleCollectedResultId && singleCollectedResultId === item.id);
  const wantVideo = includeVideo !== undefined
    ? Boolean(includeVideo && rawVideo)
    : (isCurrentSingleItem
        ? Boolean(selectedVideo && rawVideo)
        : Boolean(rawVideo));

  // 2. 确定素材图片：显式自选图片优先；仅当单条采集当前条目才采用 selectedSingleImages；否则全量带入
  const targetImages: string[] = customImages !== undefined
    ? customImages
    : isCurrentSingleItem
      ? selectedSingleImages
      : Array.isArray(item.images) && item.images.length > 0
        ? item.images
        : item.coverImage ? [item.coverImage] : [];

  const attachments: Array<{ type: 'image' | 'video'; url: string; thumbnailUrl?: string; name?: string }> = [...new Set(targetImages.map(normalizeImage).filter(Boolean))]
    .map(u => ({
      type: 'image' as const,
      url: normalizeImage(u),
      name: item.title ? `${String(item.title).slice(0, 15)}...` : '采集素材'
    }));

  if (wantVideo && rawVideo) {
    const cover = item.coverImage || (Array.isArray(item.images) ? item.images[0] : undefined);
    for (const video of videos) attachments.push({
      type: 'video',
      url: video,
      thumbnailUrl: normalizeImage(cover) || undefined,
      name: item.title ? `${String(item.title).slice(0, 12)}... (原视频)` : '原视频'
    });
  }

  if (attachments.length === 0) {
    return null;
  }

  const promptToSend = (customPrompt !== undefined ? customPrompt : isCurrentSingleItem ? aiAssistantPrompt : '').trim();
  let finalPrompt = promptToSend;
  if (!finalPrompt) {
    finalPrompt = (wantVideo && rawVideo)
      ? `请分析附带的【${item.title || '社媒作品'}】原视频（将基于多帧画面理解镜头运动、产品露出与氛围），并结合附图给出商业复刻分镜与文案建议。`
      : isSocial
        ? `请分析附带的这组【${item.title || '社媒图集'}】爆款素材，拆解其人像光影、场景构图与画面氛围配方，并给出商业复刻分镜建议。`
        : `请分析附带的【${item.title || '商品实物'}】素材，深度提炼工业材质、核心卖点与光影质感，并规划4套商业买家秀/广告分镜方案。`;
  }

  return {
    attachments,
    prompt: finalPrompt,
    hasVideo: Boolean(wantVideo && rawVideo),
  };
}
