import type React from 'react';
import { proxyMediaUrl } from '@/shared/api/apiClient';

export const MEDIA_FALLBACK_IMG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" rx="16" fill="#F8FAFC"/>
  <rect x="2" y="2" width="396" height="396" rx="14" stroke="#E2E8F0" stroke-width="2"/>
  <path d="M140 260L180 200L210 240L250 180L280 260H140Z" fill="#CBD5E1"/>
  <circle cx="175" cy="165" r="18" fill="#CBD5E1"/>
  <text x="200" y="300" text-anchor="middle" fill="#94A3B8" font-size="14" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-weight="600">素材加载失败</text>
</svg>
`)}`;

const isRemoteMediaUrl = (url: string) =>
  url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');

export const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>, rawUrl?: string) => {
  const target = e.currentTarget;
  if (!rawUrl) {
    target.src = MEDIA_FALLBACK_IMG;
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
    target.src = MEDIA_FALLBACK_IMG;
  }
};
