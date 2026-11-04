import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { resolveVideoMode, videoDurationOptions, videoInputError, videoModeLabel, videoRatioLocked, videoResolutionOptions } from '@shared/domain/media/videoCapabilities';
import { grokPresetVoicesAllowed } from '@shared/domain/media/grokVoices';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import type { SalesReferenceSlot, SalesScriptDomain } from '@shared/domain/sales';
import type { SalesProductionPlanState } from './salesProductionDraft';
import { productFaceReferences } from './salesProductFaces';

/** Use the same capability rules as Agent; retain every material the user has reviewed. */
export function resolveSalesVideoSettings(
  plan: SalesProductionPlanState,
  script: SalesScriptDomain,
  references: readonly SalesReferenceSlot[],
  audios: readonly string[] = [],
  baseUrl = getGatewayClientBaseUrl(plan.videoModel),
) {
  const model = upstreamModalityModelId('video', plan.videoModel);
  const profile = getVideoModelById(model, baseUrl);
  const images = productFaceReferences(references, plan.productFaceEdits).filter((slot) => slot.mediaType !== 'video').map((slot) => slot.url);
  const videos = references.filter((slot) => slot.mediaType === 'video').map((slot) => slot.url);
  const refMode = resolveVideoMode(model, plan.videoRefMode || 'omni', images.length, videos.length);
  const voiceMode = plan.presentationMode === 'clean_visual' ? 'none' : plan.voiceModeOverride || script.voiceMode;
  const voiceIds = grokPresetVoicesAllowed(model) && voiceMode === 'speech' && plan.videoVoiceId ? [plan.videoVoiceId] : [];
  const supportedResolutions = videoResolutionOptions(model, refMode, baseUrl, Boolean(voiceIds.length));
  const resolution = resolveVideoResolution(plan.videoResolution || '720P', supportedResolutions);
  const aspectRatio = videoRatioLocked(model, refMode) ? 'adaptive' : plan.videoAspectRatio || script.visualSpec.aspectRatio;
  const minimumDuration = Math.ceil(script.durationSec);
  const availableDurations = videoDurationOptions(model, resolution, refMode, baseUrl);
  const supportedDurations = availableDurations.filter((duration) => duration >= minimumDuration);
  const durationSec = plan.videoDurationSec || supportedDurations[0] || minimumDuration;
  const durationError = supportedDurations.length ? ''
    : `当前脚本时长 ${script.durationSec} 秒，生成至少需要 ${minimumDuration} 秒；${profile?.name || model} 在 ${resolution}、${videoModeLabel(refMode)} 下最长支持 ${Math.max(...availableDurations)} 秒，请切换支持至少 ${minimumDuration} 秒的模型，或选择更短的参考脚本。`;
  const missingLinkedVideo = plan.imitationMode === 'depth_imitation' && plan.scriptVideoReference === 'depth'
    && !references.some((slot) => slot.kind === 'action' && slot.mediaType === 'video');
  const incompatibleDepthMode = plan.imitationMode === 'depth_imitation' && plan.scriptVideoReference === 'depth' && refMode !== 'omni';
  const missingPersona = script.assetSlots.persona.required && script.assetSlots.persona.presence !== 'none'
    && !references.some((slot) => ['persona_identity', 'persona_body', 'persona_face'].includes(slot.kind) && slot.mediaType !== 'video' && slot.url.trim());
  const missingScene = Boolean(plan.sceneId.trim() || plan.customSceneImageUrl.trim())
    && !references.some((slot) => (slot.kind === 'scene' || slot.roles?.includes('scene')) && slot.mediaType !== 'video' && slot.url.trim());
  const validationError = (missingPersona ? '当前脚本需要人物参考，请先选择出镜人物或上传人物参考图；商品图中的模特和动作视频不能代替出镜人物。'
    : missingScene ? '所选场景的参考图不可用，请重新选择场景或上传场景主图后生成；原场景选择和分镜已保留。'
    : missingLinkedVideo ? '所选脚本的关联深度视频尚未就绪，请回素材库完成处理，或选择「仅按脚本」。'
    : incompatibleDepthMode ? '深度动作模仿仅支持全能参考，请切换生成方式；不要将深度视频作为需要编辑或延长的原片。' : durationError || (durationSec < minimumDuration
    ? `当前脚本需要至少 ${minimumDuration} 秒，请增加时长或选择更短的参考脚本`
    : videoInputError({ model, refMode, images, videos, audios: [...audios], voiceIds, audio: audios.length || voiceIds.length ? true : undefined, duration: durationSec, resolution, aspectRatio, baseUrl }))) || '';
  return { model, baseUrl, refMode, aspectRatio, resolution, durationSec, supportedDurations, supportedResolutions, images, videos, audios: [...audios], durationError, validationError };
}
