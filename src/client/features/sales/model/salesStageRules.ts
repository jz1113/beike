import { getVideoDurationBounds, getVideoModelById } from '@shared/domain/media/video';
import { videoInputError, videoModes } from '@shared/domain/media/videoCapabilities';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { eligibleSalesImages, salesActualReferences, salesAssetsReady, salesContentRevision, type SalesImageRef, type VideoSalesScript } from '@shared/domain/sales';
import type { VideoSalesStudioState } from './salesStudioDraft';
import { salesResolveRefMode, salesResolveResolution } from './salesWorkspace';

export function salesVideoPreflightError(state: VideoSalesStudioState): string | null {
  if (!state.selectedVideoModel) return null;
  const model = resolveModalityModelRoute('video', state.selectedVideoModel).modelId || '';
  const config = getVideoModelById(model);
  if (!config) return '已选视频模型的能力未登记，请在生图前核对或更换模型';
  const bounds = getVideoDurationBounds(model);
  if (state.targetDuration < bounds.min || state.targetDuration > bounds.max || config.supportedDurations?.length && !config.supportedDurations.includes(state.targetDuration)) return `已选视频模型不支持 ${state.targetDuration} 秒，请提前调整时长或模型`;
  if (!config.supportedAspectRatios.includes(state.aspectRatio)) return `已选视频模型不支持 ${state.aspectRatio}，请提前调整画幅或模型`;
  if (!config.audioSupport) return '已选视频模型尚未确认支持原生口播，请提前选择支持声音的模型';
  return null;
}

export function salesPlanReason(state: VideoSalesStudioState, chatModelId?: string): string | null {
  if (!state.productName.trim()) return '请先采集或填写商品名称';
  if (!eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata).length) return '请先选择至少一张用于生成的商品图';
  if (!Number.isInteger(state.targetDuration) || state.targetDuration < 10 || state.targetDuration > 120) return '目标时长必须为 10–120 秒整数';
  if (!chatModelId) return '请配置多模态模型';
  return null;
}

export function salesPlanInputRevision(state: VideoSalesStudioState): string {
  return salesContentRevision({
    productName: state.productName, brand: state.brand, category: state.category, sellingPoints: state.sellingPoints,
    priceLabel: state.priceLabel, props: state.props, targetDuration: state.targetDuration, aspectRatio: state.aspectRatio,
    selectedColor: { variantId: state.colorSelection.variantId, colorLabel: state.colorSelection.colorLabel }, videoMode: state.videoMode,
    images: eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata),
  });
}

function salesPromptModelKey(value?: string): string {
  const raw = value?.trim() || '';
  if (!raw) return '';
  return resolveModalityModelRoute('chat', raw).modelId || raw;
}

function salesVideoParamKey(model: string | undefined, resolution: string | undefined, mode: string | undefined): string {
  return `${salesResolveRefMode(model, mode)}|${salesResolveResolution(model, resolution)}`;
}

export function salesFinalInputRevision(state: VideoSalesStudioState, script: VideoSalesScript): string {
  return salesContentRevision({
    plan: salesPlanInputRevision(state), shots: script.shots.map(({ shotId, duration, description, camera, voiceover, speechMode, imageIndex }) => ({ shotId, duration, description, camera, voiceover, speechMode, imageIndex })),
    assets: script.assets?.map(({ id, url, prompt, validation, productImageIndexes }) => ({ id, url, prompt, validation, productImageIndexes })),
    chatModel: salesPromptModelKey(state.selectedChatModel),
    resolution: salesResolveResolution(state.selectedVideoModel, state.videoResolution),
    refMode: salesResolveRefMode(state.selectedVideoModel, state.videoRefMode),
  });
}

export function invalidateSalesState(previous: VideoSalesStudioState, patch: Partial<VideoSalesStudioState>): VideoSalesStudioState {
  const next = { ...previous, ...patch };
  const planChanged = salesPlanInputRevision(next) !== salesPlanInputRevision(previous);
  const videoChanged = salesVideoParamKey(next.selectedVideoModel, next.videoResolution, next.videoRefMode) !== salesVideoParamKey(previous.selectedVideoModel, previous.videoResolution, previous.videoRefMode);
  const promptModelChanged = salesPromptModelKey(next.selectedChatModel) !== salesPromptModelKey(previous.selectedChatModel);
  if (!planChanged && !videoChanged && !promptModelChanged) return next;
  if (!planChanged) return {
    ...next,
    scripts: next.scripts.map((script) => {
      // Model and delivery settings do not rewrite approved creative content.
      // Rebase only a genuinely current prompt; never revive an outdated draft.
      const current = !script.planStale && script.planRevision === salesPlanInputRevision(previous)
        && script.fullPrompt?.trim() && script.finalizedRevision === salesFinalInputRevision(previous, script);
      return current ? { ...script, finalizedRevision: salesFinalInputRevision(next, script), finalStaleReason: undefined } : script;
    }),
  };
  return {
    ...next,
    scripts: next.scripts.map((script) => ({
      ...script, finalizedRevision: undefined, finalStaleReason: '商品或创作内容已变化，请先生成视频提示词',
      planStale: true, assetValidation: 'pending' as const,
      personFrameUrl: undefined, sceneFrameUrl: undefined,
      shots: script.shots.map((shot) => ({ ...shot, promptStale: true, referenceFrameUrl: undefined })),
    })),
  };
}

export function assertSalesPlanCurrent(state: VideoSalesStudioState, script: VideoSalesScript): SalesImageRef[] {
  if (script.deliveryMode !== 'single' || script.planStale || script.planRevision !== salesPlanInputRevision(state)) throw new Error('商品、颜色或创作参数已变化，请先更新创作方案');
  if (script.totalDuration !== state.targetDuration || script.shots.reduce((sum, shot) => sum + shot.duration, 0) !== state.targetDuration) throw new Error('分镜时长与目标不一致，请更新脚本');
  const images = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  if (!images.length || script.shots.some((shot) => !images.some((image) => image.index === shot.imageIndex))) throw new Error('方案包含未选中或已不可用的商品参考图');
  return images;
}

export function salesSingleVideoError(state: VideoSalesStudioState, script: VideoSalesScript | undefined, requirePrompt = false): string | null {
  if (!script) return '请先生成口播与视频脚本';
  try {
    const images = assertSalesPlanCurrent(state, script);
    if (!salesAssetsReady(script)) return '请先生成所需素材并确认图片';
    if (!state.selectedChatModel?.trim()) return '请选择用于合成视频提示词的多模态模型';
    if (!state.selectedVideoModel?.trim()) return '请在视频制作阶段选择视频模型';
    const model = resolveModalityModelRoute('video', state.selectedVideoModel).modelId || '';
    const config = getVideoModelById(model);
    if (!config) return '当前视频模型的能力尚未登记，请选择已登记的模型';
    if (script.shots.some((shot) => shot.voiceover.trim()) && !config.audioSupport) return '当前模型尚未确认支持原生口播，请选择支持声音的视频模型';
    if (!videoModes(model).some((mode) => mode.id === state.videoRefMode)) return '当前视频模型不支持所选参考模式，请明确选择其他模式';
    const references = salesActualReferences(script, images);
    const capabilityError = videoInputError({ model, images: references.map((ref) => ref.url), refMode: state.videoRefMode, duration: state.targetDuration, aspectRatio: state.aspectRatio, resolution: state.videoResolution });
    if (capabilityError) return capabilityError;
    if (requirePrompt && (!script.fullPrompt?.trim() || script.finalizedRevision !== salesFinalInputRevision(state, script))) return script.finalStaleReason || (script.fullPrompt?.trim() ? '创作内容已变化，请先更新视频提示词' : '请先生成视频提示词');
    if (requirePrompt && script.renderStatus === 'uncertain' && !script.renderTaskId && !script.renderSubmissionKey) return '上次视频提交结果未确认，请先核对生成记录，不要重复提交';
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : '当前方案不可用于视频制作';
  }
}
