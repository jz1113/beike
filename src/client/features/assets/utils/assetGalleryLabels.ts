import { appearanceAudience } from '@shared/domain/assets/appearanceAudience';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';

export type GalleryAtomType = 'persona' | 'outfit' | 'scene';

export function compareAssetGalleryOrder(
  left: Pick<AssetLibrarySlim, 'createdAt' | 'id'>,
  right: Pick<AssetLibrarySlim, 'createdAt' | 'id'>,
): number {
  const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
  const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
  return leftTime - rightTime || left.id.localeCompare(right.id);
}

function labelPrefix(type: GalleryAtomType, item: AssetLibrarySlim): string {
  if (type === 'outfit') return '穿搭';
  if (type === 'scene') return '场景';
  const audience = appearanceAudience(item);
  if (audience.endsWith('_female')) return '女';
  if (audience.endsWith('_male')) return '男';
  return '人物';
}

/** Gallery numbers follow creation order, so filtering, favorites and usage sorting do not rename cards. */
export function buildAssetGalleryLabels(type: GalleryAtomType, items: AssetLibrarySlim[]): Map<string, string> {
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  const chronological = [...items].sort(compareAssetGalleryOrder);
  for (const item of chronological) {
    const prefix = labelPrefix(type, item);
    const number = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, number);
    labels.set(item.id, `${prefix}${number}`);
  }
  return labels;
}
