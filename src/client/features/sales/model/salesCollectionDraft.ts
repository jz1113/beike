import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { readProductVariantMetadata } from '@shared/domain/collection/productVariants';
import {
  buildSalesImageCatalog,
  emptySalesColorSelection,
  isSalesProductAudience,
  isSalesProductCategory,
  isSalesProductImageView,
  omitSalesPriceProps,
  resolveSalesProductClassification,
  type AppearanceAudience,
  type SalesClassificationSource,
  type SalesColorSelection,
  type SalesImageRef,
} from '@shared/domain/sales';
import type { CollectedSalesProduct } from './productLink';
import { emptySalesOCR, parseSalesOCR, type SalesOCRState } from './salesOCR';
import { parseSavedSalesSummary, type SavedSalesSummary } from './salesSummary';
import { emptySalesProductionPlan, parseSalesProductionPlan, type SalesProductionPlanState } from './salesProductionDraft';

export const SALES_COLLECTION_STORAGE_KEY = 'beike.video_sales.collection.v1';
const LEGACY_KEYS = ['beike.video_sales.draft.v4', 'beike.video_sales.draft.v3', 'beike.video_sales.draft.v2'];

export interface SalesCollectionState extends CollectedSalesProduct, SalesOCRState {
  /** 当前关联的商品库记录 ID（空字符串表示尚未同步入库或新商品） */
  activeProductId: string;
  categorySource: SalesClassificationSource;
  audience: AppearanceAudience;
  audienceSource: SalesClassificationSource;
  colorSelection: SalesColorSelection;
  collectedProductUrl: string;
  productSummary?: SavedSalesSummary;
  summaryModel: string;
  /** Reference script chosen in the script library; kept with the product draft. */
  selectedScriptId: string;
  productionPlan: SalesProductionPlanState;
}

export function emptySalesCollection(): SalesCollectionState {
  return {
    activeProductId: '',
    collectedProductUrl: '',
    productUrl: '',
    productName: '',
    brand: '',
    priceLabel: '',
    category: 'other',
    categorySource: 'auto',
    audience: 'unknown',
    audienceSource: 'auto',
    summaryModel: '',
    selectedScriptId: '',
    productionPlan: emptySalesProductionPlan(),
    sellingPoints: '',
    props: {},
    imageCatalog: [],
    productImages: [],
    colorSelection: emptySalesColorSelection(),
    ...emptySalesOCR(),
  };
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];

/** Read only collection fields; leave the original creative draft untouched in storage. */
export function parseSalesCollection(value: unknown): SalesCollectionState {
  const saved = record(value);
  const initial = emptySalesCollection();
  const images: SalesImageRef[] = [];
  const indexes = new Set<number>();
  const urls = new Set<string>();
  if (Array.isArray(saved.imageCatalog)) for (const raw of saved.imageCatalog) {
    const item = record(raw);
    if (typeof item.index !== 'number' || !Number.isInteger(item.index) || item.index < 0 || !text(item.url).trim()
      || !['main', 'sku', 'detail'].includes(text(item.role)) || indexes.has(item.index) || urls.has(text(item.url))) continue;
    indexes.add(item.index);
    urls.add(text(item.url));
    images.push({ index: item.index, url: text(item.url), role: item.role as SalesImageRef['role'], ...(isSalesProductImageView(item.view) ? { view: item.view } : {}), ...(item.unavailable === true ? { unavailable: true } : {}) });
  }
  const imageCatalog = images.length ? images : buildSalesImageCatalog({ mainImages: strings(saved.productImages) });
  const selection = record(saved.colorSelection);
  const props = omitSalesPriceProps(Object.fromEntries(Object.entries(record(saved.props)).filter((entry): entry is [string, string] => typeof entry[1] === 'string')));
  const rawCategory = isSalesProductCategory(saved.category) ? saved.category : initial.category;
  const categorySource: SalesClassificationSource = saved.categorySource === 'manual' ? 'manual' : 'auto';
  const audienceSource: SalesClassificationSource = saved.audienceSource === 'manual' ? 'manual' : 'auto';
  const rawAudience = isSalesProductAudience(saved.audience) ? saved.audience : initial.audience;
  const productName = text(saved.productName);
  const brand = text(saved.brand);
  const sellingPoints = text(saved.sellingPoints);
  const resolved = resolveSalesProductClassification(
    { productName, brand, sellingPoints, props, category: rawCategory },
    { category: rawCategory, categorySource, audience: rawAudience, audienceSource },
  );
  const audience = audienceSource !== 'manual' && rawAudience !== 'unknown' ? rawAudience : resolved.audience;
  return {
    ...parseSalesOCR(saved, imageCatalog),
    activeProductId: text(saved.activeProductId).slice(0, 120),
    productSummary: parseSavedSalesSummary(saved.productSummary),
    summaryModel: text(saved.summaryModel).slice(0, 500),
    selectedScriptId: text(saved.selectedScriptId).slice(0, 120),
    productionPlan: parseSalesProductionPlan(saved.productionPlan),
    collectedProductUrl: typeof saved.collectedProductUrl === 'string' ? saved.collectedProductUrl : imageCatalog.length ? text(saved.productUrl) : '',
    productUrl: text(saved.productUrl), productName, brand, priceLabel: '',
    category: resolved.category,
    categorySource: resolved.categorySource,
    audience,
    audienceSource: resolved.audienceSource,
    sellingPoints, props, imageCatalog, productImages: imageCatalog.map((image) => image.url),
    variantMetadata: readProductVariantMetadata(saved.variantMetadata) || undefined,
    colorSelection: {
      variantId: text(selection.variantId) || undefined, colorLabel: text(selection.colorLabel),
      confirmedImageUrls: strings(selection.confirmedImageUrls), excludedImageUrls: strings(selection.excludedImageUrls),
    },
    ...(typeof saved.collectionSource === 'string' ? { collectionSource: saved.collectionSource } : {}),
    ...(typeof saved.fromCache === 'boolean' ? { fromCache: saved.fromCache } : {}),
    ...(typeof saved.detailsMissing === 'boolean' ? { detailsMissing: saved.detailsMissing } : {}),
  };
}

// Keep the legacy unscoped draft in place. Only the first local workspace that
// opens it may migrate it; changing workspace must never reopen the other draft.
function collectionStorage() {
  const storage = window.localStorage;
  const workspace = getWorkspaceSecret();
  const ownerKey = SALES_COLLECTION_STORAGE_KEY + '.legacy-owner';
  let owner = storage.getItem(ownerKey);
  if (!owner) { storage.setItem(ownerKey, workspace); owner = workspace; }
  return { storage, key: SALES_COLLECTION_STORAGE_KEY + '.' + workspace, allowLegacy: owner === workspace };
}

export function readSalesCollection(): SalesCollectionState {
  if (typeof window === 'undefined') return emptySalesCollection();
  try {
    const {storage, key, allowLegacy} = collectionStorage();
    for (const candidate of [key, ...(allowLegacy ? [SALES_COLLECTION_STORAGE_KEY, ...LEGACY_KEYS] : [])]) {
      try {
        const raw = storage.getItem(candidate);
        if (raw) return parseSalesCollection(JSON.parse(raw));
      } catch { /* Continue to the next eligible local version. */ }
    }
  } catch { /* A restricted browser can still edit in memory. */ }
  return emptySalesCollection();
}

export function writeSalesCollection(state: SalesCollectionState): void {
  const {storage, key} = collectionStorage();
  storage.setItem(key, JSON.stringify(parseSalesCollection(state)));
}

export function hasSalesCollection(state: SalesCollectionState): boolean {
  return Boolean(state.productUrl.trim() || state.productName.trim() || state.brand.trim() || state.sellingPoints.trim()
    || state.productSummary || state.imageCatalog.length || state.ocrImages.length || state.ocrImageUrls.length || Object.keys(state.props).length || state.variantMetadata
    || state.collectionSource !== undefined || state.fromCache !== undefined || state.detailsMissing !== undefined
    || state.colorSelection.variantId || state.colorSelection.colorLabel || state.colorSelection.confirmedImageUrls.length || state.colorSelection.excludedImageUrls.length);
}
