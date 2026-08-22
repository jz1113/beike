import React from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';

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

export const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>, rawUrl?: string) => {
  const target = e.currentTarget;
  if (!target.dataset.hasRetried && rawUrl) {
    target.dataset.hasRetried = 'true';
    target.src = proxyMediaUrl(rawUrl);
  } else {
    target.src = '/inspirations/insp_1.jpg';
  }
};

/** 社媒/防盗链图床优先走本站代理，避免浏览器直链失败 */
export const displayMediaSrc = (rawUrl?: string) => {
  if (!rawUrl) return '';
  const u = normalizeImageUrlToStandardJpg(rawUrl) || rawUrl;
  if (/xhscdn\.com|xiaohongshu\.com|douyinpic|byteimg|snssdk|kuaishou|yximgs|kwai/i.test(u)) {
    return proxyMediaUrl(u);
  }
  return u;
};

export const displayVideoSrc = (rawUrl?: string | null) => {
  if (!rawUrl) return '';
  return proxyMediaUrl(rawUrl);
};

export const isLikelyVideoUrl = (rawUrl?: string | null) => {
  if (!rawUrl) return false;
  return /\.(mp4|mov|webm|m4v|avi)(\?|!|$)/i.test(rawUrl)
    || /\/video\//i.test(rawUrl)
    || /snssdk\.com|bytecdn\.cn|v\.kuaishou|yximgs\.com.*video/i.test(rawUrl);
};

export const mediaAssetCount = (item: { images?: string[]; video?: string | null } | null | undefined) =>
  (item?.images?.length || 0) + (item?.video ? 1 : 0);
