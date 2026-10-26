import {
  type SalesImageRef,
  type VideoSalesProductAnalysis,
  type VideoSalesScript,
  type VideoSalesCategory,
  type VideoSalesMode,
  type SalesColorSelection,
  emptySalesColorSelection,
} from '@shared/domain/sales';
import { readProductVariantMetadata, type ProductVariantMetadata } from '@shared/domain/collection/productVariants';
import { salesOpeningProductUrl, type SalesAspectRatio, type SalesVideoRefMode } from './salesWorkspace';
import type { SalesPlanCheckpoint } from './buildSalesPlan';
import { archiveSalesFields, migrateSalesScript } from './salesDraftMigration';
import type { SalesNavigation } from './salesWorkspaceView';

export const SALES_STUDIO_STORAGE_KEY = 'beike.video_sales.draft.v3';

export interface VideoSalesStudioState {
  draftVersion: 3;
  variantMetadata?: ProductVariantMetadata;
  colorSelection: SalesColorSelection;
  productUrl: string;
  productName: string;
  brand: string;
  priceLabel: string;
  category: VideoSalesCategory;
  sellingPoints: string;
  props: Record<string, string>;
  imageCatalog: SalesImageRef[];
  productImages: string[];
  historicalData?: Record<string, unknown>;
  collectionSource?: string;
  fromCache?: boolean;
  detailsMissing?: boolean;
  selectedChatModel?: string;
  selectedImageModel?: string;
  selectedVideoModel?: string;
  videoMode: VideoSalesMode;
  targetDuration: number;
  aspectRatio: SalesAspectRatio;
  videoResolution: string;
  videoRefMode: SalesVideoRefMode;
  scripts: VideoSalesScript[];
  selectedScriptIndex: number;
  analysis: VideoSalesProductAnalysis | null;
  analysisRevision?: string;
  composedResultUrl: string | null;
  planCheckpoint?: SalesPlanCheckpoint & { revision: string };
  workspaceNavigation?: SalesNavigation;
}

export const defaultSalesStudioState: VideoSalesStudioState = {
  draftVersion: 3,
  colorSelection: emptySalesColorSelection(),
  productUrl: '',
  productName: '',
  brand: '',
  priceLabel: '',
  category: 'fashion',
  sellingPoints: '',
  props: {},
  imageCatalog: [],
  productImages: [],
  videoMode: 'live_presenter',
  targetDuration: 15,
  aspectRatio: '9:16',
  videoResolution: '480P',
  videoRefMode: 'omni',
  scripts: [],
  selectedScriptIndex: 0,
  analysis: null,
  composedResultUrl: null,
};

export function hasSalesProductContent(state: VideoSalesStudioState): boolean {
  return Boolean(
    [state.productUrl, state.productName, state.brand, state.priceLabel, state.sellingPoints].some((value) => value.trim())
    || Object.keys(state.historicalData || {}).length || Object.keys(state.props).length || state.imageCatalog.length || state.productImages.length
    || state.scripts.length || state.analysis || state.composedResultUrl || state.selectedScriptIndex
    || state.colorSelection?.colorLabel || state.colorSelection?.variantId
    || state.colorSelection?.confirmedImageUrls.length || state.colorSelection?.excludedImageUrls.length || state.variantMetadata?.variants.length
    || state.collectionSource || state.fromCache !== undefined || state.detailsMissing !== undefined,
  );
}

export function clearSalesProduct(state: VideoSalesStudioState): VideoSalesStudioState {
  return {
    ...defaultSalesStudioState,
    category: 'fashion',
    selectedChatModel: state.selectedChatModel,
    selectedImageModel: state.selectedImageModel,
    selectedVideoModel: state.selectedVideoModel,
    videoMode: state.category === 'fashion' ? state.videoMode : 'live_presenter',
    targetDuration: state.targetDuration,
    aspectRatio: state.aspectRatio,
    videoResolution: state.videoResolution,
    videoRefMode: state.videoRefMode,
    props: {},
    colorSelection: emptySalesColorSelection(),
    imageCatalog: [],
    productImages: [],
    scripts: [],
  };
}

function isSalesAspect(value: unknown): value is SalesAspectRatio {
  return value === '9:16' || value === '3:4' || value === '16:9' || value === '1:1';
}

function readVideoResolution(value: unknown): string {
  return value === '480P' || value === '540P' || value === '720P' || value === '1080P' || value === '2K' || value === '4K' ? value : '480P';
}

function readVideoRefMode(value: unknown): SalesVideoRefMode {
  if (value === 'first_frame' || value === 'first_last_frame' || value === 'text') return value;
  return 'omni';
}

export function writeSalesStudioDraft(state: VideoSalesStudioState): void {
  if (typeof window === 'undefined') return;
  const encoded = JSON.stringify(state);
  window.localStorage.setItem(SALES_STUDIO_STORAGE_KEY, encoded);
  if (window.localStorage.getItem(SALES_STUDIO_STORAGE_KEY) !== encoded) {
    throw new Error('当前项目没有保存成功，已停止提交，避免刷新后重复计费');
  }
}

export function readSalesStudioDraft(): VideoSalesStudioState {
  if (typeof window === 'undefined') return defaultSalesStudioState;
  try {
    const saved = window.localStorage.getItem(SALES_STUDIO_STORAGE_KEY) || window.localStorage.getItem('beike.video_sales.draft.v2');
    if (!saved) return defaultSalesStudioState;
    const parsed = archiveSalesFields(JSON.parse(saved) as Partial<VideoSalesStudioState>, ['fashionRefs']);
    const scripts = normalizeSalesScripts(parsed.scripts, parsed.draftVersion === 3);
    const empty = !scripts.length && !parsed.productName && !parsed.imageCatalog?.length && !parsed.productImages?.length;
    return {
      ...defaultSalesStudioState,
      ...parsed,
      draftVersion: 3,
      category: empty ? 'fashion' : parsed.category || defaultSalesStudioState.category,
      videoMode: empty && parsed.category !== 'fashion' ? 'live_presenter' : parsed.videoMode || defaultSalesStudioState.videoMode,
      colorSelection: readSalesColorSelection(parsed.colorSelection),
      variantMetadata: readProductVariantMetadata(parsed.variantMetadata),
      targetDuration: Number.isInteger(parsed.targetDuration) && parsed.targetDuration! >= 10 && parsed.targetDuration! <= 120 ? parsed.targetDuration! : 15,
      selectedScriptIndex: Number.isInteger(parsed.selectedScriptIndex) && parsed.selectedScriptIndex! >= 0 && parsed.selectedScriptIndex! < scripts.length ? parsed.selectedScriptIndex! : 0,
      aspectRatio: isSalesAspect(parsed.aspectRatio) ? parsed.aspectRatio : '9:16',
      videoResolution: readVideoResolution(parsed.videoResolution),
      videoRefMode: readVideoRefMode(parsed.videoRefMode),
      analysis: parsed.analysis || null,
      composedResultUrl: typeof parsed.composedResultUrl === 'string' ? parsed.composedResultUrl : null,
      scripts,
      imageCatalog: Array.isArray(parsed.imageCatalog) ? parsed.imageCatalog : [],
      productUrl: salesOpeningProductUrl(parsed),
    };
  } catch {
    return defaultSalesStudioState;
  }
}

export function readSalesColorSelection(value: unknown): SalesColorSelection {
  if (!value || typeof value !== 'object') return emptySalesColorSelection();
  const raw = value as Partial<SalesColorSelection>;
  const urls = (items: unknown) => Array.isArray(items) ? [...new Set(items.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())))] : [];
  return {
    variantId: typeof raw.variantId === 'string' ? raw.variantId : undefined,
    colorLabel: typeof raw.colorLabel === 'string' ? raw.colorLabel : '',
    confirmedImageUrls: urls(raw.confirmedImageUrls), excludedImageUrls: urls(raw.excludedImageUrls),
  };
}

export function normalizeSalesScripts(value: unknown, current: boolean): VideoSalesScript[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is VideoSalesScript => Boolean(item && typeof item === 'object' && typeof item.id === 'string'
    && typeof item.title === 'string' && Array.isArray(item.shots) && item.shots.every((shot: unknown) => shot && typeof shot === 'object'
      && 'shotId' in shot && typeof shot.shotId === 'number' && 'duration' in shot && typeof shot.duration === 'number')))
    .map((script) => ({
      ...migrateSalesScript(script),
      assets: Array.isArray(script.assets) ? script.assets.filter((asset) => asset && typeof asset.id === 'string' && typeof asset.prompt === 'string')
        .map((asset) => ({ ...asset, status: asset.status === 'generating' ? 'uncertain' : asset.status })) : undefined,
      ...(current && script.workflowVersion === 3 && script.shots.every((shot) => shot.speechMode === 'on_camera' || shot.speechMode === 'voiceover') && !script.assets?.some((asset) => asset.usesProduct && !asset.productImageIndexes?.length) ? {} : { planStale: true, finalizedRevision: undefined, assetValidation: 'pending' as const }),
      // A browser may close after the request reached the provider but before a receipt arrived.
      ...(script.renderStatus === 'generating' && !script.renderTaskId ? { renderStatus: 'uncertain' as const, renderError: '上次提交结果未确认，请核对服务端生成记录' } : {}),
    }));
}
