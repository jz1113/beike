import type { ProductVariantMetadata } from '../collection/productVariants';
import type { SalesImageRef } from './imageCatalog';
import type { SalesColorSelection, SalesProductImageView } from './types';

export function emptySalesColorSelection(): SalesColorSelection {
  return { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] };
}

export function eligibleSalesImages(images: SalesImageRef[], selection: SalesColorSelection, metadata?: ProductVariantMetadata): SalesImageRef[] {
  const color = selection.colorLabel.trim();
  const hasColor = Boolean(color) && !['未知', '待确认', 'unknown'].includes(color.toLowerCase());
  const variant = metadata?.variants.find((item) => item.id === selection.variantId);
  const mapped = hasColor && variant?.color?.trim() === color ? variant.imageUrls.filter((url) => metadata!.variants.every((other) => !other.imageUrls.includes(url) || other.color === variant.color)) : [];
  const allowed = new Set([...mapped, ...selection.confirmedImageUrls]);
  const excluded = new Set(selection.excludedImageUrls);
  return images.filter((image) => image.url.trim() && !image.unavailable && allowed.has(image.url) && !excluded.has(image.url));
}

export function selectedProductImageViews(
  images: SalesImageRef[],
  selection: SalesColorSelection,
  metadata?: ProductVariantMetadata,
): { count: number; views: Set<SalesProductImageView>; untaggedCount: number } {
  const selected = eligibleSalesImages(images, selection, metadata);
  const views = new Set<SalesProductImageView>();
  let untaggedCount = 0;
  for (const image of selected) {
    if (image.view) views.add(image.view);
    else untaggedCount += 1;
  }
  return { count: selected.length, views, untaggedCount };
}
