import { useAppStore, type GenerationTask } from '@client/store';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders, getModelCredentials } from '@client/shared/api/gatewayClient';
import { imageCapabilities } from '@shared/domain/media/imageCapabilities';
import { normalizeImageUrlToStandardJpg, formatDisplayModel } from '@shared/domain/media/drawing';
import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { prepareImageSubmission } from './prepareImageSubmission';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { prepareVideoReferences } from './prepareVideoReferences';
import { recordMediaTaskUsage } from '@client/shared/utils/modelUsage';
import { logLatencyAudit } from '@shared/domain/core/latencyAudit';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { loadPromptPreferences } from '@client/shared/prompt-bar/promptBarPreferencesTypes';
import { GENERATION_CANCELLED_MESSAGE, isGenerationCancelled, throwIfGenerationAborted } from '@client/shared/api/generation/generationAbort';
import { requiresGenerationRecovery, SUBMISSION_RECOVERY_HINT } from '@client/shared/api/generation/generationRecovery';
import { isImageTaskActive } from '@shared/domain/core/taskStatus';
import {
  clearDepthSubmit,
  peekDepthSubmit,
  resolveDepthSubmit,
  submitDepthImage,
  submitDepthVideo,
} from '@client/shared/api/generation/depthGeneration';
import {
  isDepthVideoTask,
  isDepthImageTask,
  isVideoTask,
  getGatewayBaseUrl,
  type TaskUpdater,
} from './generationTaskTypes';
import { submitAgentTask } from './submitAgentTask';
import { claimSubmissionFlight, releaseSubmissionFlight } from './submissionFlight';

export async function submitSingleGenerationTask(
  t: GenerationTask,
  updateGenerationTask: TaskUpdater,
  pollCounts: Record<string, number>,
  slowPollIds: Set<string>,
  signal?: AbortSignal,
) {
  if (t.submissionRecoveryRequired) return;
  if (signal?.aborted) {
    updateGenerationTask(t.id, {
      status: 'FAILURE',
      failReason: GENERATION_CANCELLED_MESSAGE,
      submissionRecoveryRequired: false,
    });
    return;
  }

  const currentTask = () => {
    const state = useAppStore.getState();
    return state.generationTasks.find(task => task.id === t.id) ||
      state.sessions?.flatMap(session => session.tasks).find(task => task.id === t.id);
  };
  const requireRecovery = () => {
    const current = currentTask();
    // A concurrent receipt query may have already linked or resolved this operation.
    if (current?.taskId || current?.resultUrl ||
      (current?.status === 'FAILURE' && current.submissionRecoveryRequired === false)) return;
    updateGenerationTask(t.id, {
      status: 'IN_PROGRESS', progress: '15%', submissionRecoveryRequired: true,
      failReason: SUBMISSION_RECOVERY_HINT,
    });
  };
  let claimedFlight = false;
  const claimSubmission = () => {
    const current = currentTask();
    if (!current || !isImageTaskActive(current.status) || current.taskId || current.resultUrl || current.submissionRecoveryRequired) return false;
    if (!claimSubmissionFlight(t.id)) return false;
    claimedFlight = true;
    return true;
  };

  try {
  if (t.mediaType === 'agent') {
    await submitAgentTask(t, updateGenerationTask, signal);
    return;
  }

  if (isDepthImageTask(t) || isDepthVideoTask(t)) {
    let payload = peekDepthSubmit(t.id);
    if (!payload) {
      const refUrl = t.referenceImages?.[0] || t.referenceImageUrl;
      payload = await resolveDepthSubmit(t.id, refUrl, {
        style: (t.depthStyle as any) || 'mocap',
        quality: (t.quality as any) || 'standard',
        mode: isDepthVideoTask(t) ? 'depth-video' : 'depth-image',
      }, signal);
    }

    if (!payload) {
      updateGenerationTask(t.id, {
        status: 'FAILURE',
        failReason: '无法读取上传文件，请重新提交',
      });
      return;
    }

    throwIfGenerationAborted(() => Boolean(signal?.aborted));
    if (!claimSubmission()) return;

    try {
      if (isDepthImageTask(t)) {
        const { resultUrl } = await submitDepthImage(payload.file, payload.style, payload.quality, signal, t.id);
        clearDepthSubmit(t.id);
        updateGenerationTask(t.id, {
          status: 'SUCCESS', progress: '100%', resultUrl, submissionRecoveryRequired: false,
        });
      } else {
        const { taskId, recordId } = await submitDepthVideo(payload.file, payload.style, payload.quality, signal, t.id);
        delete pollCounts[t.id];
        slowPollIds.delete(t.id);
        updateGenerationTask(t.id, {
          status: 'IN_PROGRESS', progress: '25%', taskId, dbId: recordId, submissionRecoveryRequired: false,
        });
      }
    } catch (error) {
      if (requiresGenerationRecovery(error)) {
        requireRecovery();
        return;
      }
      updateGenerationTask(t.id, {
        status: 'FAILURE', submissionRecoveryRequired: false,
        failReason: formatUserError(error, '深度任务提交失败'),
      });
    }
    return;
  }

  const localUrl = getGatewayBaseUrl();
  const gatewayHeaders = getGatewayClientHeaders(t.modelRouteKey || t.model);
  const video = isVideoTask(t);
  const isAudio = t.mediaType === 'audio';
  const clientT0 = Date.now();
  const refCount = Array.isArray(t.referenceImages)
    ? t.referenceImages.length
    : Array.isArray((t as any).images)
      ? (t as any).images.length
      : t.referenceImageUrl
        ? 1
        : 0;

  let submissionDispatched = false;
  let res: Response;
  try {
    if (isAudio) {
      throwIfGenerationAborted(() => Boolean(signal?.aborted));
      if (!claimSubmission()) return;
      submissionDispatched = true;
      const audioPrefs = loadPromptPreferences().audio;
      res = await apiFetch('/api/generate/audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': t.id,
          ...gatewayHeaders,
          ...storageConfigHeaders(),
        },
        body: JSON.stringify({
          clientTaskId: t.id,
          prompt: t.prompt,
          text: t.prompt,
          model: t.model || 'speech-2.8-hd',
          format: audioPrefs?.format || 'mp3',
          voice: audioPrefs?.voice || 'zh-female-commercial',
          speed: audioPrefs?.speed || 1,
          customBaseUrl: gatewayHeaders['x-custom-base-url'] || localUrl,
          storageConfig: readClientStorageConfig(),
        }),
        signal,
      });
    } else if (video) {
      const rawRefs: string[] =
        Array.isArray(t.referenceImages) && t.referenceImages.length > 0
          ? t.referenceImages.filter(Boolean)
          : t.referenceImageUrl
            ? [t.referenceImageUrl]
            : [];

      const videoRefs = rawRefs.filter((u) => isVideoMediaUrl(u));
      const imageRefs = rawRefs
        .filter((u) => !isVideoMediaUrl(u))
        .map((img) => normalizeImageUrlToStandardJpg(img))
        .filter(Boolean) as string[];

      const finalVideoRefs = await prepareVideoReferences(videoRefs, signal);

      throwIfGenerationAborted(() => Boolean(signal?.aborted));
      if (!claimSubmission()) return;
      submissionDispatched = true;
      res = await apiFetch('/api/generate/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': t.id,
          ...gatewayHeaders,
          ...storageConfigHeaders(),
        },
        body: JSON.stringify({
          clientTaskId: t.id,
          prompt: t.prompt,
          model: t.model || 'doubao-seedance-2.5',
          duration: t.videoDuration || 5,
          aspect_ratio: t.size || '16:9',
          resolution: resolveVideoResolution(t.videoResolution, getVideoModelById(t.model)?.supportedResolutions),
          ref_mode: t.videoRefMode || 'omni',
          images: imageRefs,
          videos: finalVideoRefs,
          first_frame_image:
            t.videoRefMode === 'first_frame' || t.videoRefMode === 'first_last_frame'
              ? (('firstFrameImage' in t && typeof t.firstFrameImage === 'string' ? t.firstFrameImage : '') || imageRefs[0] || undefined)
              : undefined,
          last_frame_image:
            t.videoRefMode === 'first_last_frame'
              ? (('lastFrameImage' in t && typeof t.lastFrameImage === 'string' ? t.lastFrameImage : '') || (imageRefs.length >= 2 ? imageRefs[imageRefs.length - 1] : undefined))
              : undefined,
          camera_motion: 'cameraMotion' in t && typeof t.cameraMotion === 'string' ? t.cameraMotion : undefined,
          audio: 'generateAudio' in t && typeof t.generateAudio === 'boolean' ? t.generateAudio : undefined,
          watermark: false,
          customBaseUrl: gatewayHeaders['x-custom-base-url'] || localUrl,
          storageConfig: readClientStorageConfig(),
        }),
        signal,
      });
    } else {
      const normalizeRef = (url: string) => normalizeImageUrlToStandardJpg(url) || url;
      const imgList = t.images?.length ? t.images : t.referenceImages?.length ? t.referenceImages : [];
      const refUrl = t.referenceImageUrl ? normalizeRef(t.referenceImageUrl) : undefined;
      // Keep numbered array slots intact; a primary alias must not add a duplicate first slot.
      const combinedImages = imgList.filter(Boolean).map(normalizeRef);
      if (refUrl && !combinedImages.includes(refUrl)) combinedImages.unshift(refUrl);
      const primaryRefUrl = refUrl || combinedImages[0] || undefined;
      const isWorkshop = (t as any).source === 'workshop' || Boolean((t as any).workshopMode);
      const modelCreds = getModelCredentials(t.model);
      const imageCaps = imageCapabilities(t.model, modelCreds.protocol, modelCreds.baseUrl);
      const imgBody: Record<string, unknown> = {
        prompt: t.prompt,
        model: t.model || 'gpt-image-2',
        size: t.size || '2448x3264',
        quality: t.quality || 'medium',
        ...(imageCaps.strength === 'quality' && t.imageQuality ? { imageQuality: t.imageQuality } : {}),
        ...(imageCaps.strength === 'prompt-extend' && t.inferenceStrength ? { inferenceStrength: t.inferenceStrength } : {}),
        referenceImageUrl: primaryRefUrl,
        useReferenceImage: t.useReferenceImage ?? Boolean(primaryRefUrl || combinedImages.length),
        source: 'home',
        customBaseUrl: gatewayHeaders['x-custom-base-url'] || localUrl,
        ...(t.taskType ? { taskType: t.taskType } : {}),
        ...(t.angleName ? { angleName: t.angleName } : {}),
        ...(t.sourceImageUrl ? { sourceImageUrl: t.sourceImageUrl } : {}),
        ...(isWorkshop
          ? { productImageUrl: primaryRefUrl, productTitle: t.title, workshopMode: (t as any).workshopMode }
          : {}),
      };
      if (gatewayHeaders['x-custom-api-key']) {
        imgBody.customApiKey = gatewayHeaders['x-custom-api-key'];
      }
      if (gatewayHeaders['x-custom-protocol']) {
        imgBody.customProtocol = gatewayHeaders['x-custom-protocol'];
      }
      if (gatewayHeaders['x-custom-protocol'] === 'template' && modelCreds.requestTemplate) {
        imgBody.requestTemplate = modelCreds.requestTemplate;
      }
      if (combinedImages.length > 0) {
        imgBody.images = combinedImages;
        // The server accepts images as the canonical array; do not send the same base64 list twice.
      }
      imgBody.clientTaskId = t.id;
      imgBody.storageConfig = readClientStorageConfig();
      const imgBodyStr = await prepareImageSubmission(imgBody, signal);
      throwIfGenerationAborted(() => Boolean(signal?.aborted));
      if (!claimSubmission()) return;
      submissionDispatched = true;
      res = await apiFetch('/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': t.id,
          ...gatewayHeaders,
          ...storageConfigHeaders(),
        },
        body: imgBodyStr,
        signal,
      });
    }
  } catch (networkErr: any) {
    // Once dispatch started, a lost or cancelled response may hide an accepted task.
    if (submissionDispatched) {
      requireRecovery();
      return;
    }
    if (isGenerationCancelled(networkErr, signal)) {
      updateGenerationTask(t.id, {
        status: 'FAILURE',
        failReason: GENERATION_CANCELLED_MESSAGE,
        submissionRecoveryRequired: false,
      });
      return;
    }
    console.warn(`[generationEngine] 网络连接异常:`, networkErr?.message);
    logLatencyAudit({
      hypothesisId: 'H4',
      location: 'useGenerationEngine.ts:submit-network',
      message: 'client submit network error',
      data: {
        taskLocalId: t.id,
        video,
        model: t.model,
        refCount,
        clientMs: Date.now() - clientT0,
        error: String(networkErr?.message || networkErr),
      },
    });
    updateGenerationTask(t.id, {
      status: 'FAILURE',
      failReason: formatUserError(networkErr, '网络连接异常，请检查网络后重试'),
    });
    return;
  }

  if (signal?.aborted) {
    requireRecovery();
    return;
  }

  const clientSubmitMs = Date.now() - clientT0;
  const data = await res.json().catch(() => null);
  if (signal?.aborted) {
    requireRecovery();
    return;
  }
  logLatencyAudit({
    hypothesisId: 'H4',
    location: 'useGenerationEngine.ts:submit-done',
    message: 'client submit roundtrip',
    data: {
      taskLocalId: t.id,
      video,
      model: t.model,
      refCount,
      clientSubmitMs,
      httpStatus: res.status,
      ok: Boolean(data?.success),
      serverTiming: data?.timing || null,
      anomaly: clientSubmitMs > 45000,
    },
  });

  // 服务端明确拒绝（包括参数错误、未配置密钥、上游拒绝）时，直接置为 FAILURE，避免误入恢复死循环
  if (data?.submissionRejected || ((!res.ok || data?.success === false) && data?.error && !data?.taskId && !data?.submissionUnknown)) {
    updateGenerationTask(t.id, {
      status: 'FAILURE',
      submissionRecoveryRequired: false,
      failReason: formatUserError(data?.error || `生成任务已被拒绝 (HTTP ${res.status})`),
    });
    return;
  }

  if (!data?.taskId && !data?.resultUrl && (data?.submissionUnknown || (res.status >= 500 && !data) || (res.ok && !data))) {
    requireRecovery();
    return;
  }
  if ((!res.ok || !data?.success) && !data?.taskId) {
    updateGenerationTask(t.id, {
      status: 'FAILURE', submissionRecoveryRequired: false,
      failReason: formatUserError(data?.error || `生成任务提交失败 (HTTP ${res.status})`),
    });
    return;
  }

  (pollCounts as any)[`_start_${t.id}`] = Date.now();

  const resolvedModelId = data.model || t.model || (video ? 'doubao-seedance-2.5' : isAudio ? 'speech-2.8-hd' : 'gpt-image-2');

  recordMediaTaskUsage({
    taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
    modelId: resolvedModelId,
    modelName: formatDisplayModel(resolvedModelId, video),
    type: isAudio ? 'audio' : video ? 'video' : 'image',
    mediaCount: 1,
    duration: video ? (t.videoDuration || 5) : undefined,
    usage: data.usage,
  });

  const finalResultUrl = data.resultUrl || data.audioUrl;
  if (finalResultUrl) {
    updateGenerationTask(t.id, {
      status: 'SUCCESS',
      progress: '100%',
      resultUrl: finalResultUrl,
      taskId: data.taskId,
      submissionRecoveryRequired: false,
      ...(data.model ? { model: data.model } : {}),
      ...(data.recordId ? { dbId: data.recordId } : {}),
    });
  } else if (data.taskId) {
    delete pollCounts[t.id];
    slowPollIds.delete(t.id);
    updateGenerationTask(t.id, {
      status: 'IN_PROGRESS',
      progress: '25%',
      taskId: data.taskId,
      submissionRecoveryRequired: false,
      ...(data.model ? { model: data.model } : {}),
      ...(data.recordId ? { dbId: data.recordId } : {}),
    });
  } else {
    updateGenerationTask(t.id, {
      status: 'FAILURE',
      failReason: '接口未返回任务 ID 或结果',
    });
  }
  } finally {
    if (claimedFlight) releaseSubmissionFlight(t.id);
  }
}
