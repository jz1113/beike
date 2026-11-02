import type { SalesColorSelection, SalesImageRef } from '@shared/domain/sales';

export type SalesGalleryGroup = 'all' | 'main' | 'sku' | 'detail' | 'selected';
export function galleryImages(images: SalesImageRef[], selected: Set<string>, group: SalesGalleryGroup) {
  return images.filter((image) => group === 'all' || (group === 'selected' ? selected.has(image.url) : image.role === group));
}

/** Bulk changes affect only the visible group; the other group's choices remain intact. */
export function selectGalleryImages(images: SalesImageRef[], selected: Set<string>, targets: string[], select: boolean): SalesColorSelection {
  const allowed = new Set(images.filter((image) => !image.unavailable).map((image) => image.url));
  const next = new Set([...selected].filter((url) => allowed.has(url)));
  for (const url of targets) if (allowed.has(url)) { if (select) next.add(url); else next.delete(url); }
  return { colorLabel: '', confirmedImageUrls: [...next], excludedImageUrls: images.filter((image) => !next.has(image.url)).map((image) => image.url) };
}

/**
 * Distributes images left-to-right into shortest-height columns so each image
 * automatically backfills vertical gaps left by shorter images above it.
 */
export function packMasonryColumns<T extends { url: string }>(
  items: readonly T[],
  columnCount: number,
  aspectRatios?: Readonly<Record<string, number>>,
): T[][] {
  const count = Math.max(1, Math.floor(columnCount) || 1);
  const columns: T[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);

  for (const item of items) {
    let targetCol = 0;
    for (let col = 1; col < count; col += 1) {
      if (heights[col] < heights[targetCol] - 0.01) {
        targetCol = col;
      }
    }
    columns[targetCol].push(item);
    const ratio = aspectRatios?.[item.url];
    const normalizedRatio = typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0
      ? Math.min(Math.max(ratio, 0.2), 2.2)
      : 1;
    heights[targetCol] += normalizedRatio + 0.08;
  }

  return columns;
}
