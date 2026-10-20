import { collectedProductImageIdentity, parseCollectedProductImage } from '../media/productImageUrls';

export type ProductColorVariant = {
  id: string;
  label: string;
  color?: string;
  skuIds: string[];
  imageUrls: string[];
};

export type ProductVariantMetadata = {
  version: 1;
  variants: ProductColorVariant[];
  requestedSkuId?: string;
  selectedVariantId?: string;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some(item => !text(item))) return undefined;
  return [...new Set(value.map(item => String(item).trim()))];
}

/** Parse untrusted response/cache/draft data without inferring a color or current SKU. */
export function readProductVariantMetadata(input: unknown): ProductVariantMetadata | undefined {
  if (typeof input === 'string') {
    try { input = JSON.parse(input) as unknown; } catch { return undefined; }
  }
  const source = record(input);
  if (!source || source.version !== 1 || !Array.isArray(source.variants)) return undefined;
  const variants: ProductColorVariant[] = [];
  const ids = new Set<string>();
  for (const item of source.variants) {
    const variant = record(item);
    if (!variant) return undefined;
    const id = text(variant.id);
    const label = text(variant.label);
    const skuIds = strings(variant.skuIds);
    const imageUrls = strings(variant.imageUrls);
    const color = variant.color === undefined ? undefined : text(variant.color);
    if (!id || !label || !skuIds || !imageUrls || ids.has(id) || (variant.color !== undefined && !color)) return undefined;
    ids.add(id);
    variants.push({ id, label, ...(color ? { color } : {}), skuIds, imageUrls: [...new Set(imageUrls.flatMap(url => {
      // A thumbnail may still prove association with a catalog's full-size copy.
      const image = parseCollectedProductImage(url);
      return image ? [image.url] : [];
    }))] });
  }
  const requestedSkuId = text(source.requestedSkuId);
  const selectedVariantId = text(source.selectedVariantId);
  if ((source.requestedSkuId !== undefined && !requestedSkuId) || (source.selectedVariantId !== undefined && !selectedVariantId)) return undefined;
  if (selectedVariantId && !ids.has(selectedVariantId)) return undefined;
  return { version: 1, variants, ...(requestedSkuId ? { requestedSkuId } : {}), ...(selectedVariantId ? { selectedVariantId } : {}) };
}

/** Resolve aliases to URLs actually present in the complete, deduplicated image catalog. */
export function alignProductVariantImages(metadata: ProductVariantMetadata, imageUrls: string[]): ProductVariantMetadata {
  const catalog = new Map(imageUrls.map(url => [collectedProductImageIdentity(url), url]));
  return { ...metadata, variants: metadata.variants.map(variant => ({
    ...variant,
    imageUrls: [...new Set(variant.imageUrls.flatMap(url => {
      const actual = catalog.get(collectedProductImageIdentity(url));
      return actual ? [actual] : [];
    }))],
  })) };
}
