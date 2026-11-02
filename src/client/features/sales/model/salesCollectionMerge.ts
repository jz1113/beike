import { resolveSalesProductClassification } from '@shared/domain/sales';
import type { CollectedSalesProduct } from './productLink';
import { emptySalesCollection, type SalesCollectionState } from './salesCollectionDraft';
import { emptySalesProductionPlan } from './salesProductionDraft';

/** Refreshing the same source keeps manual facts, uploads, stable IDs and OCR edits. */
export function mergeSalesCollection(previous: SalesCollectionState, product: CollectedSalesProduct, sourceURL: string): SalesCollectionState {
  if (!previous.collectedProductUrl || previous.collectedProductUrl !== sourceURL) {
    const classification = resolveSalesProductClassification(
      { productName: product.productName, brand: product.brand, sellingPoints: product.sellingPoints, props: product.props, category: product.category },
      { categorySource: 'auto', audienceSource: 'auto' },
    );
    return {
      ...emptySalesCollection(),
      ...product,
      ...classification,
      activeProductId: '',
      collectedProductUrl: sourceURL,
      summaryModel: previous.summaryModel,
      selectedScriptId: previous.selectedScriptId,
      productionPlan: {
        ...emptySalesProductionPlan(),
        videoModel: previous.productionPlan.videoModel,
        voiceModel: previous.productionPlan.voiceModel,
      },
    };
  }
  const returned = new Map(product.imageCatalog.map((image) => [image.url, image]));
  const imageCatalog = previous.imageCatalog.map((image) => returned.has(image.url) ? { ...image, role: returned.get(image.url)!.role, unavailable: undefined } : image);
  const existing = new Set(imageCatalog.map((image) => image.url));
  let index = Math.max(-1, ...imageCatalog.map((image) => image.index)) + 1;
  for (const image of product.imageCatalog) if (!existing.has(image.url)) { imageCatalog.push({ ...image, index: index++ }); existing.add(image.url); }
  const mergedName = previous.productName || product.productName;
  const mergedBrand = previous.brand || product.brand;
  const mergedSelling = previous.sellingPoints || product.sellingPoints;
  const mergedProps = { ...product.props, ...previous.props };
  const classification = resolveSalesProductClassification(
    { productName: mergedName, brand: mergedBrand, sellingPoints: mergedSelling, props: mergedProps, category: product.category },
    {
      category: previous.category,
      categorySource: previous.categorySource,
      audience: previous.audience,
      audienceSource: previous.audienceSource,
    },
  );
  return {
    ...product,
    ...previous,
    ...classification,
    props: mergedProps,
    productUrl: product.productUrl,
    collectedProductUrl: sourceURL,
    collectionSource: product.collectionSource,
    fromCache: product.fromCache,
    detailsMissing: product.detailsMissing,
    variantMetadata: product.variantMetadata || previous.variantMetadata,
    imageCatalog,
    productImages: imageCatalog.map((image) => image.url),
  };
}
