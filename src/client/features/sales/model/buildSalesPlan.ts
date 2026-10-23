import {
  applyStrictImageAssignments, omitSalesPriceClauses, omitSalesPriceProps, validateSalesAssetPlan, type FashionRefs, type SalesImageRef,
  type VideoSalesCategory, type VideoSalesMode, type VideoSalesProductAnalysis, type VideoSalesScript,
} from '@shared/domain/sales';
import type { SalesRouteHeaders } from './salesRoute';

export interface SalesPlanApi {
  analyzeProductMedia(input: object): Promise<VideoSalesProductAnalysis>;
  generateSalesScripts(input: object): Promise<VideoSalesScript[]>;
  selectSalesImages(input: object): Promise<Array<{ shotId: number; imageIndex: number; reason?: string }>>;
}

export type SalesPlanPhase = 'analyze' | 'script' | 'select' | 'prompt';
export interface SalesPlanCheckpoint { analysis?: VideoSalesProductAnalysis; script?: VideoSalesScript }

export async function buildSalesPlan(input: {
  productName: string;
  brand: string;
  category: VideoSalesCategory;
  sellingPoints: string;
  productProps?: Record<string, string>;
  imageCatalog: SalesImageRef[];
  fashionRefs?: FashionRefs;
  targetDuration: number;
  aspectRatio?: string;
  selectedColor?: string;
  videoMode: VideoSalesMode;
  route: SalesRouteHeaders;
  onPhase: (phase: SalesPlanPhase) => void;
  checkpoint?: SalesPlanCheckpoint;
  onCheckpoint?: (checkpoint: SalesPlanCheckpoint) => void;
}, api: SalesPlanApi): Promise<{ analysis: VideoSalesProductAnalysis; script: VideoSalesScript }> {
  const images = input.imageCatalog.filter((image) => image.url.trim() && !image.unavailable);
  if (!images.length) throw new Error('请先选择至少一张用于生成的商品图');
  if (!Number.isInteger(input.targetDuration) || input.targetDuration < 10 || input.targetDuration > 120) throw new Error('目标时长需为 10–120 秒的整数');
  const productDescription = JSON.stringify({ suppliedSellingPoints: omitSalesPriceClauses(input.sellingPoints), originalProductProperties: omitSalesPriceProps(input.productProps || {}) });
  const context = { workflowVersion: 3 as const, eligibleImageIndexes: images.map((image) => image.index), selectedColor: input.selectedColor, aspectRatio: input.aspectRatio || '9:16' };
  input.onPhase('analyze');
  const checkAbort = () => { if (input.route.signal?.aborted) throw new DOMException('已停止脚本生成', 'AbortError'); };
  checkAbort();
  const analysis = input.checkpoint?.analysis || await api.analyzeProductMedia({
    imageCatalog: images, productName: input.productName, brand: input.brand,
    productDescription, category: input.category,
    ...context, ...input.route,
  });
  if (!analysis.sellingPoints?.some((point) => point.trim())) throw new Error('商品分析没有返回卖点');
  checkAbort();
  input.onCheckpoint?.({ analysis });
  input.onPhase('script');
  const scripts = input.checkpoint?.script ? [input.checkpoint.script] : await api.generateSalesScripts({
    productName: input.productName, brand: input.brand, category: input.category,
    productDescription, productImages: images.map((image) => image.url), imageCatalog: images,
    productAnalysis: JSON.stringify(analysis), videoMode: input.videoMode, targetDuration: input.targetDuration,
    targetAudience: analysis.targetAudience, ...context, ...input.route,
  });
  const selected = scripts[0];
  if (!selected?.shots?.length) throw new Error('没有生成可用脚本，请调整商品信息后重试');
  const total = selected.shots.reduce((sum, shot) => sum + shot.duration, 0);
  if (selected.shots.some((shot) => !Number.isInteger(shot.duration) || shot.duration <= 0) || total !== input.targetDuration) {
    throw new Error(`分镜合计 ${total} 秒，与目标 ${input.targetDuration} 秒不一致，请重新生成方案`);
  }
  if (!Array.isArray(selected.assets)) throw new Error('脚本没有返回自动素材计划，请重新生成');
  validateSalesAssetPlan(selected.assets, images);
  checkAbort();
  input.onCheckpoint?.({ analysis, script: selected });
  input.onPhase('select');
  const assignments = images.length === 1
    ? selected.shots.map((shot) => ({ shotId: shot.shotId, imageIndex: images[0].index, reason: '使用唯一已选商品图' }))
    : await api.selectSalesImages({ shots: selected.shots, imageCatalog: images, ...context, ...input.route });
  checkAbort();
  const shots = applyStrictImageAssignments(selected.shots, assignments, images);
  return {
    analysis,
    script: {
      ...selected, shots, totalDuration: total, deliveryMode: 'single', workflowVersion: 3, planStale: false,
      assets: selected.assets.map((asset) => ({
        ...asset, usesProduct: asset.usesProduct ?? (input.category === 'fashion' && asset.kind === 'person'),
        url: undefined, status: 'pending', validation: 'pending',
      })),
      fullPrompt: undefined, finalizedRevision: undefined, assetValidation: 'pending',
      renderTaskId: undefined, renderStatus: 'pending', renderSnapshot: undefined,
    },
  };
}
