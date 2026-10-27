import type { InspirationItem, InspirationUseOptions } from './inspirationItem';
import { resolveVideoResolution } from '@shared/domain/media/video';

/** 首屏优先加载的灵感条目数量 */
// Keep the first viewport warm without decoding a dozen large assets at once.
export const INSPIRATION_EAGER_COUNT = 6;

/** 将 "3:4" 转为 CSS aspect-ratio 值 */
export function inspirationAspectRatio(item: Pick<InspirationItem, 'aspectRatio'>): string {
  const raw = item.aspectRatio?.trim();
  if (!raw) return '3 / 4';
  const parts = raw.split(':').map((p) => Number(p.trim()));
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n) && n > 0)) {
    return `${parts[0]} / ${parts[1]}`;
  }
  return '3 / 4';
}

export function inspirationVideoUseOptions(item: InspirationItem): InspirationUseOptions {
  return {
    referenceImages: item.referenceImages,
    videoRefMode: item.videoRefMode || 'omni',
    videoDuration: item.videoDuration,
    videoModel: item.model,
    videoAspectId: item.aspectRatio,
    videoResolution: resolveVideoResolution(item.quality),
  };
}
