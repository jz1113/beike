import { getVideoModelById } from '@shared/domain/media/video';
import { videoInputError, videoModes } from '@shared/domain/media/videoCapabilities';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { salesActualReferences, salesAssetsReady, type VideoSalesScript } from '@shared/domain/video-sales';
import { assertSalesPlanCurrent, salesFinalInputRevision } from './salesStageRules';
import type { VideoSalesStudioState } from './salesStudioDraft';

export function salesSingleVideoError(state: VideoSalesStudioState, script: VideoSalesScript | undefined, requirePrompt = false): string | null {
  if (!script) return '请先生成口播与视频脚本';
  try {
    const images = assertSalesPlanCurrent(state, script);
    if (!salesAssetsReady(script)) return '请先生成并校验所需素材图片';
    if (!state.selectedVideoModel?.trim()) return '请在视频制作阶段选择视频模型';
    const model = resolveModalityModelRoute('video', state.selectedVideoModel).modelId || '';
    const config = getVideoModelById(model);
    if (!config) return '当前视频模型的能力尚未登记，请选择已登记的模型';
    if (script.shots.some((shot) => shot.voiceover.trim()) && !config.audioSupport) return '当前模型尚未确认支持原生口播，请选择支持声音的视频模型';
    if (!videoModes(model).some((mode) => mode.id === state.videoRefMode)) return '当前视频模型不支持所选参考模式，请明确选择其他模式';
    const references = salesActualReferences(script, images);
    const capabilityError = videoInputError({ model, images: references.map((ref) => ref.url), refMode: state.videoRefMode, duration: state.targetDuration, aspectRatio: state.aspectRatio, resolution: state.videoResolution });
    if (capabilityError) return capabilityError;
    if (requirePrompt && (!script.fullPrompt?.trim() || script.finalizedRevision !== salesFinalInputRevision(state, script, model))) return '图片或参数已变化，请先定稿视频提示词';
    if (requirePrompt && script.renderStatus === 'uncertain' && !script.renderTaskId) return '上次视频提交结果未确认，请先核对生成记录，不要重复提交';
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : '当前方案不可用于视频制作';
  }
}
