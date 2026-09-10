import React from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { normalizeImageUrlToStandardJpg } from '@beike/domain/drawing';

export type DetectedPlatform = 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social';

/**
 * 从文本中智能识别平台类型。
 * 支持：京东、淘宝/天猫、1688、拼多多、社媒（小红书/抖音/快手）。
 * 纯数字 ID（8~16 位）默认按京东处理。
 */
export function detectPlatformFromText(raw: string): DetectedPlatform {
  const text = raw.toLowerCase();
  if (text.includes('jd.com') || text.includes('3.cn') || text.includes('jingdong')) return 'jd';
  if (text.includes('taobao.com') || text.includes('tmall.com') || text.includes('tb.cn')) return 'taobao';
  if (text.includes('1688.com')) return '1688';
  if (text.includes('pinduoduo.com') || text.includes('yangkeduo.com')) return 'pinduoduo';
  if (
    text.includes('xiaohongshu.com') || text.includes('xhslink.com') ||
    text.includes('douyin.com') || text.includes('kuaishou.com') ||
    text.includes('weibo.com') || text.includes('bilibili.com')
  ) return 'social';
  // 纯数字 ID 默认按京东处理
  if (/^\d{8,16}$/.test(raw.trim())) return 'jd';
  return 'jd';
}

/**
 * 从原始文本中批量提取商品链接与纯数字 ID。
 * - 匹配所有 http(s):// 链接
 * - 匹配独立的 8~16 位纯数字商品 ID（如京东商品编码）
 * - 自动去重
 */
export function extractUrlsFromRawText(text: string): string[] {
  if (!text) return [];
  const urlMatches = text.match(/https?:\/\/[^\s,;"'<>()[\]]+/gi) || [];
  const numMatches = text.match(/\b\d{8,16}\b/g) || [];
  return Array.from(new Set([...urlMatches, ...numMatches]))
    .map(u => u.trim())
    .filter(Boolean);
}

export const COLLECTOR_STORAGE_KEY = 'universal_collector_exclusive_vault';

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
  price?: number;
  author?: string;
  error?: string;
  time?: string;
}

export const secondaryBtnClass =
  'h-9 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0';

export const COLLECTOR_FALLBACK_IMG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" rx="16" fill="#F8FAFC"/>
  <rect x="2" y="2" width="396" height="396" rx="14" stroke="#E2E8F0" stroke-width="2"/>
  <path d="M140 260L180 200L210 240L250 180L280 260H140Z" fill="#CBD5E1"/>
  <circle cx="175" cy="165" r="18" fill="#CBD5E1"/>
  <text x="200" y="300" text-anchor="middle" fill="#94A3B8" font-size="14" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-weight="600">素材加载失败</text>
</svg>
`)}`;

export const INSPIRATION_FALLBACK_IMG = COLLECTOR_FALLBACK_IMG;

const isRemoteMediaUrl = (url: string) =>
  url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');

/** 图片加载失败：远程走代理 / 自动纠错 xhscdn / 本地 cache-bust 重试，再失败回退优雅占位 */
export const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>, rawUrl?: string) => {
  const target = e.currentTarget;
  if (!rawUrl) {
    target.src = COLLECTOR_FALLBACK_IMG;
    return;
  }
  if (!target.dataset.hasRetried) {
    target.dataset.hasRetried = 'true';
    let fixed = rawUrl;
    if (/ci\.xiaohongshu\.com/i.test(fixed)) {
      fixed = fixed.replace(/https?:\/\/ci\.xiaohongshu\.com/i, 'https://sns-img-hw.xhscdn.com');
    }
    if (isRemoteMediaUrl(fixed)) {
      target.src = proxyMediaUrl(fixed);
    } else {
      const sep = fixed.includes('?') ? '&' : '?';
      target.src = `${fixed}${sep}retry=${Date.now()}`;
    }
  } else {
    target.src = COLLECTOR_FALLBACK_IMG;
  }
};

/** 社媒/防盗链图床优先走本站代理与稳定官方 CDN，避免浏览器直链失败 */
export const displayMediaSrc = (rawUrl?: string) => {
  if (!rawUrl) return '';
  let u = normalizeImageUrlToStandardJpg(rawUrl) || rawUrl;
  if (/ci\.xiaohongshu\.com/i.test(u)) {
    u = u.replace(/https?:\/\/ci\.xiaohongshu\.com/i, 'https://sns-img-hw.xhscdn.com');
  }
  if (/xhscdn\.com|xiaohongshu\.com|douyinpic|byteimg|snssdk|kuaishou|yximgs|kwai/i.test(u)) {
    return proxyMediaUrl(u);
  }
  return u;
};

export const displayVideoSrc = (rawUrl?: string | null) => {
  if (!rawUrl) return '';
  return proxyMediaUrl(rawUrl, { asVideo: true });
};

export const isLikelyVideoUrl = (rawUrl?: string | null) => {
  if (!rawUrl) return false;
  return /\.(mp4|mov|webm|m4v|avi)(\?|!|$)/i.test(rawUrl)
    || /\/video\//i.test(rawUrl)
    || /snssdk\.com|bytecdn\.cn|kwaicdn|kwimgs|v\.kuaishou|yximgs\.com.*video/i.test(rawUrl);
};

export const mediaAssetCount = (item: { images?: string[]; video?: string | null; videoUrl?: string | null } | null | undefined) =>
  (item?.images?.length || 0) + (item?.video || item?.videoUrl ? 1 : 0);

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

  const rawVideo = item.video || item.videoUrl || (Array.isArray(item.videos) && item.videos.length > 0 ? item.videos[0] : null);

  // 1. 确定是否导入视频：显式传参优先；若为历史/详情条目，只要自身带视频则默认导入；仅当在单条采集当前条目下才参考 selectedVideo 复选框
  const isCurrentSingleItem = Boolean(singleCollectedResultId && singleCollectedResultId === item.id);
  const wantVideo = includeVideo !== undefined
    ? Boolean(includeVideo && rawVideo)
    : (isCurrentSingleItem
        ? Boolean(selectedVideo && rawVideo)
        : Boolean(rawVideo));

  // 2. 确定素材图片：显式自选图片优先；仅当单条采集当前条目才采用 selectedSingleImages；否则全量带入
  const hasExplicitImages = Boolean(customImages && customImages.length > 0);
  const hasGridSelection = isCurrentSingleItem && selectedSingleImages.length > 0;

  let targetImages = hasExplicitImages
    ? customImages!
    : (hasGridSelection ? selectedSingleImages : []);

  if (targetImages.length === 0) {
    targetImages = (Array.isArray(item.images) && item.images.length > 0)
      ? item.images
      : (item.coverImage ? [item.coverImage] : []);
  }

  const attachments: Array<{ type: 'image' | 'video'; url: string; thumbnailUrl?: string; name?: string }> = targetImages
    .filter(Boolean)
    .map(u => ({
      type: 'image' as const,
      url: normalizeImageUrlToStandardJpg(u) || u,
      name: item.title ? `${String(item.title).slice(0, 15)}...` : '采集素材'
    }));

  if (wantVideo && rawVideo) {
    const cover = item.coverImage || (Array.isArray(item.images) ? item.images[0] : undefined);
    attachments.push({
      type: 'video',
      url: rawVideo,
      thumbnailUrl: normalizeImageUrlToStandardJpg(cover) || cover || undefined,
      name: item.title ? `${String(item.title).slice(0, 12)}... (原视频)` : '原视频'
    });
  }

  if (attachments.length === 0) {
    return null;
  }

  const promptToSend = (customPrompt !== undefined ? customPrompt : aiAssistantPrompt).trim();
  let finalPrompt = promptToSend;
  if (!finalPrompt) {
    const isSocial = item.type === 'social' || item.platform === 'social';
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
