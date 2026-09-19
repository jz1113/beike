import type { InspirationItem } from '../components/inspiration/InspirationModal';

/** 首屏优先加载的灵感条目数量 */
export const INSPIRATION_EAGER_COUNT = 12;

/** 将 "3:4" 转为 CSS aspect-ratio 值 */
export function inspirationAspectRatio(item: Pick<InspirationItem, 'aspectRatio'>): string {
  const raw = item.aspectRatio?.trim();
  if (!raw) return '3 / 4';
  const parts = raw.split(':').map((p) => Number.parseFloat(p.trim()));
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n) && n > 0)) {
    return `${parts[0]} / ${parts[1]}`;
  }
  return '3 / 4';
}
