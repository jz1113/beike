import type { GenerationTask } from '@/store';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@/shared/api/apiClient';
import { getGatewayClientHeaders } from '@/shared/api/gatewayClient';
import { normalizeImageUrlToStandardJpg, formatDisplayModel } from '@beike/domain/drawing';
import { prepareImageSubmission } from './prepareImageSubmission';
import { isVideoMediaUrl } from '@/shared/media/mediaHelper';
import { resolveRefMediaFile } from '@/shared/media/refMediaRegistry';
import { recordModelUsage, resolveModelVendor } from '@/shared/utils/usageTracker';
import { logLatencyAudit } from '@beike/domain/latencyAudit';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { GENERATION_CANCELLED_MESSAGE, isGenerationCancelled } from '@/shared/api/generationAbort';
import {
  clearDepthSubmit,
  peekDepthSubmit,
  resolveDepthSubmit,
  submitDepthImage,
  submitDepthVideo,
} from '@/shared/api/depthGeneration';
import {
  isDepthVideoTask,
  isDepthImageTask,
  isVideoTask,
  getGatewayBaseUrl,
  type TaskUpdater,
} from './generationTaskTypes';

export async function submitSingleGenerationTask(
  t: GenerationTask,
  updateGenerationTask: TaskUpdater,
  pollCounts: Record<string, number>,
  slowPollIds: Set<string>,
  signal?: AbortSignal,
) {
  if (signal?.aborted) {
    updateGenerationTask(t.id, {
      status: 'FAILURE',
      failReason: GENERATION_CANCELLED_MESSAGE,
    });
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
      });
    }

    if (!payload) {
      updateGenerationTask(t.id, {
        status: 'FAILURE',
        failReason: '无法读取上传文件，请重新提交',
      });
      return;
    }

    updateGenerationTask(t.id, { progress: '20%', failReason: undefined });

    if (isDepthImageTask(t)) {
      const { resultUrl } = await submitDepthImage(payload.file, payload.style, payload.quality);
      clearDepthSubmit(t.id);
      updateGenerationTask(t.id, {
        status: 'SUCCESS',
        progress: '100%',
        resultUrl,
      });
    } else {
      const { taskId } = await submitDepthVideo(payload.file, payload.style, payload.quality);
      delete pollCounts[t.id];
      slowPollIds.delete(t.id);
      updateGenerationTask(t.id, {
        status: 'IN_PROGRESS',
        progress: '25%',
        taskId,
      });
    }
    return;
  }

  const localUrl = getGatewayBaseUrl();
  const gatewayHeaders = getGatewayClientHeaders();
  const video = isVideoTask(t);
  const clientT0 = Date.now();
  const refCount = Array.isArray(t.referenceImages)
    ? t.referenceImages.length
    : Array.isArray((t as any).images)
      ? (t as any).images.length
      : t.referenceImageUrl
        ? 1
        : 0;

  let res: Response;
  try {
    if (video) {
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

      // 若存在本地上传的参考视频 (blob/本地文件)，通过 /api/generate/upload-ref 转存为公网可用 URL
      const finalVideoRefs: string[] = [];
      for (const u of videoRefs) {
        if (u.startsWith('http://') || u.startsWith('https://')) {
          finalVideoRefs.push(u);
        } else {
          const file = resolveRefMediaFile(u);
          if (file) {
            try {
              const formData = new FormData();
              formData.append('file', file);
              formData.append('storageConfig', JSON.stringify(readClientStorageConfig()));
              const uploadRes = await apiFetch('/api/generate/upload-ref', {
                method: 'POST',
                body: formData,
                headers: storageConfigHeaders(),
                signal,
              });
              const uploadData = await uploadRes.json().catch(() => null);
              if (uploadData?.success && uploadData.url) {
                finalVideoRefs.push(uploadData.url);
              } else {
                throw new Error(uploadData?.error || '参考视频上传失败');
              }
            } catch (uploadErr: any) {
              console.warn('[submitVideo] 上传本地参考视频异常:', uploadErr);
              throw new Error(uploadErr.message || '本地参考视频上传失败，请检查对象存储配置');
            }
          }
        }
      }

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
          resolution: t.videoResolution || '480P',
          ref_mode: t.videoRefMode || 'omni',
          images: imageRefs,
          videos: finalVideoRefs,
          first_frame_image: t.videoRefMode === 'first_last_frame' ? imageRefs[0] || undefined : undefined,
          last_frame_image:
            t.videoRefMode === 'first_last_frame' && imageRefs.length >= 2
              ? imageRefs[imageRefs.length - 1]
              : undefined,
          camera_motion: (t as any).cameraMotion,
          audio: (t as any).generateAudio,
          watermark: false,
          customBaseUrl: localUrl,
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
      const imgBody: Record<string, unknown> = {
        prompt: t.prompt,
        model: t.model || 'gpt-image-2',
        size: t.size || '2448x3264',
        quality: t.quality || 'medium',
        referenceImageUrl: primaryRefUrl,
        useReferenceImage: t.useReferenceImage ?? Boolean(primaryRefUrl || combinedImages.length),
        source: 'home',
        customBaseUrl: localUrl,
        ...(t.taskType ? { taskType: t.taskType } : {}),
        ...(t.angleName ? { angleName: t.angleName } : {}),
        ...(t.sourceImageUrl ? { sourceImageUrl: t.sourceImageUrl } : {}),
        ...(isWorkshop
          ? { productImageUrl: primaryRefUrl, productTitle: t.title, workshopMode: (t as any).workshopMode }
          : {}),
      };
      if (combinedImages.length > 0) {
        imgBody.images = combinedImages;
        // The server accepts images as the canonical array; do not send the same base64 list twice.
      }
      imgBody.clientTaskId = t.id;
      imgBody.storageConfig = readClientStorageConfig();
      const imgBodyStr = await prepareImageSubmission(imgBody, signal);
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
    if (isGenerationCancelled(networkErr, signal)) {
      updateGenerationTask(t.id, {
        status: 'FAILURE',
        failReason: GENERATION_CANCELLED_MESSAGE,
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
    updateGenerationTask(t.id, {
      status: 'FAILURE',
      failReason: GENERATION_CANCELLED_MESSAGE,
    });
    return;
  }

  const clientSubmitMs = Date.now() - clientT0;
  const data = await res.json().catch(() => null);
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

  if ((!res.ok || !data?.success) && !data?.taskId) {
    throw new Error(data?.error || `生成任务提交失败 (HTTP ${res.status})`);
  }

  (pollCounts as any)[`_start_${t.id}`] = Date.now();

  const resolvedModelId = data.model || t.model || (video ? 'doubao-seedance-2.5' : 'gpt-image-2');

  recordModelUsage({
    modelId: resolvedModelId,
    modelName: formatDisplayModel(resolvedModelId, video),
    provider: resolveModelVendor(resolvedModelId),
    type: video ? 'video' : 'image',
    mediaCount: 1,
    duration: video ? (t.videoDuration || 5) : undefined,
    success: true,
  });

  if (data.resultUrl) {
    updateGenerationTask(t.id, {
      status: 'SUCCESS',
      progress: '100%',
      resultUrl: data.resultUrl,
      taskId: data.taskId,
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
      ...(data.model ? { model: data.model } : {}),
      ...(data.recordId ? { dbId: data.recordId } : {}),
    });
  } else {
    updateGenerationTask(t.id, {
      status: 'FAILURE',
      failReason: '接口未返回任务 ID 或结果',
    });
  }
}
