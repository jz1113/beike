import type { SalesImageRef } from '@shared/domain/sales';

export const SALES_IMAGE_DRAG_TYPE = 'application/x-beike-sales-image';
export function salesImageDragData(image: SalesImageRef): string {
  return JSON.stringify({ version: 1, index: image.index, url: image.url });
}

/** Accept only a current, available catalog image, never an arbitrary external URL or file path. */
export function readSalesImageDrag(data: string, catalog: SalesImageRef[]): string | null {
  if (!data || data.length > 16_384) return null;
  try {
    const value = JSON.parse(data);
    if (!value || value.version !== 1 || !Number.isInteger(value.index) || typeof value.url !== 'string') return null;
    return catalog.find((image) => image.index === value.index && image.url === value.url && !image.unavailable)?.url || null;
  } catch { return null; }
}

export function addSalesOCRImages(catalog: SalesImageRef[], selected: string[], candidates: string[]): string[] {
  const allowed = new Set(catalog.filter((image) => !image.unavailable).map((image) => image.url));
  return [...new Set([...selected, ...candidates.filter((url) => allowed.has(url))])];
}
