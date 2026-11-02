import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { resolveVideoMode, videoDurationOptions, videoInputError, videoRatioLocked } from '@shared/domain/media/videoCapabilities';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import type { SalesReferenceSlot, SalesScriptDomain } from '@shared/domain/sales';
import type { SalesProductionPlanState } from './salesProductionDraft';

/** Use the same capability rules as Agent; retain every material the user has reviewed. */
export function resolveSalesVideoSettings(
  plan: SalesProductionPlanState,
  script: SalesScriptDomain,
  references: readonly SalesReferenceSlot[],
) {
  const model = upstreamModalityModelId('video', plan.videoModel);
  const profile = getVideoModelById(model);
  const images = references.filter((slot) => slot.mediaType !== 'video').map((slot) => slot.url);
  const videos = references.filter((slot) => slot.mediaType === 'video').map((slot) => slot.url);
  const refMode = resolveVideoMode(model, plan.videoRefMode || 'omni', images.length, videos.length);
  const resolution = resolveVideoResolution(plan.videoResolution || '720P', profile?.supportedResolutions);
  const aspectRatio = videoRatioLocked(model, refMode) ? 'adaptive' : plan.videoAspectRatio || script.visualSpec.aspectRatio;
  const minimumDuration = Math.ceil(script.durationSec);
  const supportedDurations = videoDurationOptions(model, resolution, refMode).filter((duration) => duration >= minimumDuration);
  const durationSec = plan.videoDurationSec || supportedDurations[0] || minimumDuration;
  const missingLinkedVideo = plan.imitationMode === 'depth_imitation' && plan.scriptVideoReference === 'depth'
    && !references.some((slot) => slot.kind === 'action' && slot.mediaType === 'video');
  const missingPersona = script.assetSlots.persona.required && script.assetSlots.persona.presence !== 'none'
    && !references.some((slot) => ['persona_identity', 'persona_body', 'persona_face'].includes(slot.kind) && slot.mediaType !== 'video' && slot.url.trim());
  const missingScene = Boolean(plan.sceneId.trim() || plan.customSceneImageUrl.trim())
    && !references.some((slot) => (slot.kind === 'scene' || slot.roles?.includes('scene')) && slot.mediaType !== 'video' && slot.url.trim());
  const validationError = (missingPersona ? '当前脚本需要人物参考，请先选择出镜人物或上传人物参考图；商品图中的模特和动作视频不能代替出镜人物。'
    : missingScene ? '所选场景的参考图不可用，请重新选择场景或上传场景主图后生成；原场景选择和分镜已保留。'
    : missingLinkedVideo ? '所选脚本的关联深度视频尚未就绪，请回素材库完成处理，或选择「仅按脚本」。' : durationSec < minimumDuration
    ? `当前脚本需要至少 ${minimumDuration} 秒，请增加时长或选择更短的参考脚本`
    : videoInputError({ model, refMode, images, videos, duration: durationSec, resolution, aspectRatio })) || '';
  return { model, refMode, aspectRatio, resolution, durationSec, supportedDurations, images, videos, validationError };
}
