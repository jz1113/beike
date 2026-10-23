import type { ProductVariantMetadata } from '../collection/productVariants';
import type { SalesImageRef } from './imageCatalog';
import type { VideoSalesScript, SalesActualReference, SalesColorSelection, SalesCreativeAsset } from './types';

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

export function salesAssetsReady(script?: VideoSalesScript): boolean {
  return Boolean(script?.deliveryMode === 'single' && !script.planStale && Array.isArray(script.assets)
    && script.assets.every((asset) => (!asset.required && !asset.url) || (asset.status === 'done' && Boolean(asset.url) && asset.validation === 'passed'))
    && script.assetValidation === 'passed');
}

export function salesAssetsGenerated(script?: VideoSalesScript): boolean {
  return Boolean(script?.deliveryMode === 'single' && !script.planStale && Array.isArray(script.assets)
    && script.assets.every((asset) => (!asset.required && !asset.url) || (asset.status === 'done' && Boolean(asset.url))));
}

export function salesActualReferences(script: VideoSalesScript, images: SalesImageRef[]): SalesActualReference[] {
  const chosen = [...new Set(script.shots.map((shot) => shot.imageIndex))];
  const product = chosen.map((index) => images.find((image) => image.index === index));
  if (!product.length || product.some((image) => !image)) throw new Error('方案引用的商品图未被选中或已不可用，请更新方案');
  const refs: SalesActualReference[] = product.map((image) => ({ id: `product-${image!.index}`, kind: 'product', label: `商品参考 ${image!.index + 1}`, url: image!.url }));
  for (const asset of script.assets || []) {
    if (!asset.url?.trim()) {
      if (asset.required) throw new Error(`${asset.label}尚未生成`);
      continue;
    }
    refs.push({ id: asset.id, kind: asset.kind, label: asset.label, url: asset.url });
  }
  if (new Set(refs.map((ref) => ref.id)).size !== refs.length) throw new Error('参考图片编号重复，请更新素材计划');
  return refs;
}

/** A content signature, not a security hash. Stored with stage outputs to detect stale inputs. */
export function salesContentRevision(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return `${text.length}-${hash.toString(16)}`;
}

export function validateSalesAssetPlan(assets: SalesCreativeAsset[], images?: SalesImageRef[]): void {
  if (assets.length < 1 || assets.length > 4) throw new Error('素材计划必须按需提供 1 至 4 张创作图片');
  const seen = new Map<string, SalesCreativeAsset>();
  for (const asset of assets) {
    if (!asset.id?.trim() || seen.has(asset.id) || asset.id.startsWith('product-')) throw new Error('素材编号缺失或重复');
    if (!['person', 'face', 'scene', 'keyframe'].includes(asset.kind) || !asset.prompt?.trim() || !asset.label?.trim()) throw new Error('素材生成计划不完整');
    if (asset.productImageIndexes !== undefined && (!Array.isArray(asset.productImageIndexes)
      || asset.productImageIndexes.some((index) => !Number.isInteger(index) || index < 0)
      || new Set(asset.productImageIndexes).size !== asset.productImageIndexes.length
      || (!asset.usesProduct && asset.productImageIndexes.length > 0)
      || (asset.usesProduct && asset.productImageIndexes.length === 0))) throw new Error('素材商品参考编号无效');
    if (images && asset.productImageIndexes?.some((index) => !images.some((image) => image.index === index && image.url.trim() && !image.unavailable))) throw new Error('素材引用的商品图未被选中或已不可用');
    if (asset.referenceAssetIds?.some((id) => !seen.has(id))) throw new Error('素材依赖必须引用前面已规划的图片');
    if (asset.kind === 'face' && !asset.referenceAssetIds?.some((id) => seen.get(id)?.kind === 'person')) throw new Error('人脸特写必须继承同一出镜人物');
    seen.set(asset.id, asset);
  }
}
