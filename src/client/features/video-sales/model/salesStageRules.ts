import { eligibleSalesImages, salesContentRevision, type SalesImageRef, type VideoSalesScript } from '@shared/domain/video-sales';
import type { VideoSalesStudioState } from './salesStudioDraft';

export function salesPlanInputRevision(state: VideoSalesStudioState): string {
  return salesContentRevision({
    productName: state.productName, brand: state.brand, category: state.category, sellingPoints: state.sellingPoints,
    priceLabel: state.priceLabel, props: state.props, targetDuration: state.targetDuration, aspectRatio: state.aspectRatio,
    selectedColor: { variantId: state.colorSelection.variantId, colorLabel: state.colorSelection.colorLabel }, videoMode: state.videoMode,
    images: eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata),
  });
}

export function salesFinalInputRevision(state: VideoSalesStudioState, script: VideoSalesScript, model: string): string {
  return salesContentRevision({
    plan: salesPlanInputRevision(state), shots: script.shots.map(({ shotId, duration, description, camera, voiceover, imageIndex }) => ({ shotId, duration, description, camera, voiceover, imageIndex })),
    assets: script.assets?.map(({ id, url, prompt, validation }) => ({ id, url, prompt, validation })),
    model, resolution: state.videoResolution, refMode: state.videoRefMode,
  });
}

export function invalidateSalesState(previous: VideoSalesStudioState, patch: Partial<VideoSalesStudioState>): VideoSalesStudioState {
  const next = { ...previous, ...patch };
  const planChanged = salesPlanInputRevision(next) !== salesPlanInputRevision(previous);
  const videoChanged = next.selectedVideoModel !== previous.selectedVideoModel || next.videoRefMode !== previous.videoRefMode || next.videoResolution !== previous.videoResolution;
  if (!planChanged && !videoChanged) return next;
  return {
    ...next,
    scripts: next.scripts.map((script) => ({
      ...script, finalizedRevision: undefined,
      ...(planChanged ? {
        planStale: true, assetValidation: 'pending' as const,
        personFrameUrl: undefined, sceneFrameUrl: undefined,
        shots: script.shots.map((shot) => ({ ...shot, promptStale: true, referenceFrameUrl: undefined })),
      } : {}),
    })),
  };
}

export function assertSalesPlanCurrent(state: VideoSalesStudioState, script: VideoSalesScript): SalesImageRef[] {
  if (script.deliveryMode !== 'single' || script.planStale || script.planRevision !== salesPlanInputRevision(state)) throw new Error('商品、颜色或创作参数已变化，请先更新创作方案');
  if (script.totalDuration !== state.targetDuration || script.shots.reduce((sum, shot) => sum + shot.duration, 0) !== state.targetDuration) throw new Error('分镜时长与目标不一致，请更新脚本');
  const images = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  if (!images.length || script.shots.some((shot) => !images.some((image) => image.index === shot.imageIndex))) throw new Error('方案包含不属于当前颜色的商品参考图');
  return images;
}
