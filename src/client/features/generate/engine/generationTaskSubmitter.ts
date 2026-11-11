import { isDepthQuality } from '@shared/domain/media/depthVideo';
import { useAppStore, type GenerationTask } from '@client/store';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders, getGatewayClientOverrides, getModelCredentials } from '@client/shared/api/gatewayClient';
import { imageCapabilities } from '@shared/domain/media/imageCapabilities';
import { normalizeImageUrlToStandardJpg, getAspectRatioFromSize, formatDisplayModel } from '@shared/domain/media/drawing';
import { compressImageForSubmission } from '@client/shared/media/image-utils';
import { resolveRefMediaFile } from '@client/shared/media/refMediaRegistry';
import { isTaskVideoReference } from '@client/shared/media/mediaHelper';
import { isDepthImageTask, isDepthVideoTask, isGenerationVideoTask } from '@client/shared/media/generationAttempt';
import { claimGenerationDispatch, finishGenerationDispatch, isGenerationDispatching } from '@client/shared/api/generation/generationDispatch';
import { createUsageScope, operationUsageScope } from '@client/shared/utils/usageScope';
import { logLatencyAudit } from '@shared/domain/core/latencyAudit';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
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
import { submitAgentTask } from './submitAgentTask';
import type { TaskUpdater } from './recoverAgentTurn';
import { readReportedUsage, recordMediaTaskUsage } from '@client/shared/utils/modelUsage';
import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { videoInputError } from '@shared/domain/media/videoCapabilities';
import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { isVeoNativeBase } from '@shared/domain/media/veoChannels';
import { isMetasoH3 } from '@shared/domain/media/videoChannels';

export const SLOW_POLL_HINT = '生成较慢，后台继续等待…';

export { isDepthImageTask, isDepthVideoTask };

export function isVideoTask(t: GenerationTask): boolean {
  return isGenerationVideoTask(t);
}

export function getMaxPollCount(t: GenerationTask): number {
  if (isDepthVideoTask(t)) return 300;
  if (isVideoTask(t)) return 300;
  const q = (t.quality || '').toLowerCase();
  const size = (t.size || '').toLowerCase();
  const model = (t.model || '').toLowerCase();
  const is4K =
    q === 'high' ||
    model.includes('4k') ||
    /4k|2448|3264|4096|3840|2160/.test(size);
  if (is4K) return 450;
  if (q === 'medium' || /2k|1632|2048/.test(size)) return 300;
  return 180;
}

export function getGatewayBaseUrl(): string | undefined {
  return getGatewayClientOverrides().customBaseUrl;
}

/** 同一本地任务在原请求返回前只能占一个名额，避免刷新或重渲染再交一次。 */
export function claimSubmissionFlight(taskId: string): boolean {
  return claimGenerationDispatch(taskId);
}

export function releaseSubmissionFlight(taskId: string): void {
  finishGenerationDispatch(taskId);
}

export function isSubmissionInFlight(taskId: string): boolean {
  return isGenerationDispatching(taskId);
}

/** 原请求还在飞时不能把「还没有记录」当成提交失败。 */
export function shouldAbandonSubmissionRecovery(count: number, inFlight: boolean): boolean {
  return !inFlight && count > 5;
}

export const SUBMISSION_RECOVERY_TIMEOUT =
  '原任务核对超时：未在服务端找到记录，任务可能已被拒绝或网络中断。请检查服务接口配置后重试。';

const submissionRequestErrors = new Map<string, string>();

export function rememberSubmissionRequestError(taskId: string, message: string): void {
  const text = message.trim();
  if (text) submissionRequestErrors.set(taskId, text);
}

export function submissionRequestError(taskId: string): string | undefined {
  return submissionRequestErrors.get(taskId);
}

export function forgetSubmissionRequestError(taskId: string): void {
  submissionRequestErrors.delete(taskId);
}

export type SubmissionRecoveryObservation = 'inflight' | 'pending' | 'missing';

/** 服务端还在提交时不累计核对次数；只有确认没有记录才熔断，并保留本次请求的真实错误。 */
export function nextSubmissionRecovery(
  count: number,
  observation: SubmissionRecoveryObservation,
  requestError?: string,
): { count: number; abandon: boolean; reason?: string } {
  if (observation === 'inflight' || observation === 'pending') {
    return { count: 0, abandon: false };
  }
  const next = count + 1;
  if (next > 5) {
    const reason = requestError?.trim() || SUBMISSION_RECOVERY_TIMEOUT;
    return { count: next, abandon: true, reason };
  }
  return { count: next, abandon: false };
}

// Leave headroom below the API/gateway's approximately 8 MB request boundary.
export const IMAGE_SUBMISSION_MAX_BYTES = 6_000_000;
const MAX_REFERENCE_CHARS = 800_000;
const IMAGE_FIELDS = ['referenceImageUrl', 'productImageUrl', 'sourceImageUrl', 'anchorFaceImageUrl', 'sceneAnchorImageUrl', 'socialReferenceImageUrl', 'first_frame_image', 'last_frame_image'] as const;
const ARRAY_FIELDS = ['images', 'referenceImages'] as const;
const isLocalImage = (value: unknown): value is string => typeof value === 'string' && /^(data:image\/|blob:)/i.test(value);

function mapImageFields(body: Record<string, unknown>, transform: (value: string) => string) {
  const next = { ...body };
  for (const key of IMAGE_FIELDS) if (typeof body[key] === 'string') next[key] = transform(body[key] as string);
  for (const key of ARRAY_FIELDS) {
    if (Array.isArray(body[key])) next[key] = (body[key] as string[]).map(transform);
  }
  return next;
}

/** Budget all occurrences, including the primary and source image aliases, without removing any slots. */
export async function prepareImageSubmission(body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const occurrences: string[] = [];
  const skeleton = mapImageFields(body, (value) => {
    if (!isLocalImage(value)) return value;
    occurrences.push(value);
    return '';
  });
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const overhead = bytes(skeleton);
  const budget = IMAGE_SUBMISSION_MAX_BYTES - overhead - 1024;
  if (budget <= 0) throw new Error('提示词或附加数据超过提交上限，请缩短内容后重试');
  const allowance = Math.min(MAX_REFERENCE_CHARS, Math.floor(budget / Math.max(1, occurrences.length)));
  const converted = new Map<string, string>();
  // Sequential decoding prevents many large reference images filling browser memory at once.
  for (const [index, source] of [...new Set(occurrences)].entries()) {
    signal?.throwIfAborted();
    try {
      const input = source.startsWith('blob:') ? resolveRefMediaFile(source) || source : source;
      converted.set(source, await compressImageForSubmission(input, allowance, signal));
    } catch (error) {
      signal?.throwIfAborted();
      throw new Error(`第 ${index + 1} 张本地参考图处理失败：${error instanceof Error ? error.message : '无法读取图片'}。请重新载入此图后重试`);
    }
  }
  signal?.throwIfAborted();
  const prepared = mapImageFields(body, (value) => converted.get(value) || value);
  const payload = JSON.stringify(prepared);
  if (new TextEncoder().encode(payload).byteLength > IMAGE_SUBMISSION_MAX_BYTES) {
    throw new Error('参考图自动压缩后仍超过提交上限，请重新载入原图后重试');
  }
  return payload;
}

function isLocalReference(url: string) {
  if (!/^https?:\/\//i.test(url)) return true;
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  return parsed.origin === window.location.origin || host === 'localhost' || host.endsWith('.localhost')
    || host === '[::1]' || host === '[::]'
    || /^(?:(?:127|0|10)\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+)$/.test(host);
}

function workspaceReference(url: string) {
  if (!/^https?:\/\//i.test(url)) return url;
  const parsed = new URL(url);
  return parsed.origin === window.location.origin && parsed.pathname.startsWith('/storage/')
    ? parsed.pathname + parsed.search + parsed.hash : url;
}

/** A local canvas URL is readable by the browser, but not by a video provider. */
export function prepareVideoReferences(urls: string[], signal?: AbortSignal, backendReadable = false): Promise<string[]> {
  return prepareMediaReferences(urls, signal, backendReadable, 'video');
}

export function prepareAudioReferences(urls: string[], signal?: AbortSignal): Promise<string[]> {
  return prepareMediaReferences(urls, signal, true, 'audio');
}

export function prepareMotionImageReferences(urls: string[], signal?: AbortSignal): Promise<string[]> {
  return prepareMediaReferences(urls, signal, false, 'image');
}

async function prepareMediaReferences(urls: string[], signal: AbortSignal | undefined, backendReadable: boolean, kind: 'video' | 'audio' | 'image'): Promise<string[]> {
  const label = kind === 'image' ? '角色图' : kind === 'audio' ? '参考音频' : '参考视频';
  const result: string[] = [];
  for (const source of urls) {
    const url = workspaceReference(source);
    if (!isLocalReference(url) || (backendReadable && url.startsWith('/storage/'))) { result.push(url); continue; }
    let file = resolveRefMediaFile(source) || (source !== url ? resolveRefMediaFile(url) : undefined);
    if (!file && (url.startsWith('blob:') || url.startsWith('data:' + kind + '/') || url.startsWith('/storage/') || (kind === 'image' && url.startsWith('/') && !url.startsWith('//')) || /^https?:\/\//.test(url))) {
      const response = url.startsWith('/storage/') ? await apiFetch(url, { signal }) : await fetch(url, { signal });
      if (!response.ok) throw new Error(label + '读取失败，请重新添加素材');
      const blob = await response.blob();
      file = new File([blob], kind === 'video' ? 'reference.mp4' : 'reference.' + (blob.type.split('/')[1]?.split(';')[0]?.replace(/^mpeg$/, 'mp3').replace(/^x-/, '') || (kind === 'image' ? 'png' : 'wav')), { type: blob.type || (kind === 'audio' ? 'application/octet-stream' : 'video/mp4') });
    }
    if (!file) throw new Error(label + '已失效，请重新添加素材');
    const form = new FormData();
    form.append('file', file);
    if (backendReadable) {
      form.append('category', kind === 'audio' ? 'refs/audio' : 'refs/videos');
      form.append('customConfig', JSON.stringify({ persistResults: false }));
    } else form.append('storageConfig', JSON.stringify(readClientStorageConfig()));
    const response = await apiFetch(backendReadable ? '/api/assets/storage/upload' : '/api/generate/upload-ref', {
      method: 'POST', body: form, headers: storageConfigHeaders(), signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success || typeof data.url !== 'string' || (!backendReadable && isLocalReference(data.url))) {
      throw new Error(data?.error || (backendReadable ? label + '暂时无法保存，请检查工作区存储' : label + '需要公网可访问链接，请检查对象存储配置'));
    }
    result.push(data.url);
  }
  return result;
}

/** Resolve the selected channel before uploads and the submission flight claim. */
export function prepareVideoSubmissionInput(task: GenerationTask, baseUrl: string | undefined, images: string[], videos: string[]) {
  const model = task.model || 'doubao-seedance-2.5';
  const selectedResolution = task.videoResolution?.trim().toUpperCase();
  const resolution = isMetasoH3(model, baseUrl) && selectedResolution === '720P' ? '768P'
    : selectedResolution || resolveVideoResolution(undefined, getVideoModelById(model, baseUrl)?.supportedResolutions);
  const error = videoInputError({
    model, baseUrl, refMode: task.videoRefMode || 'omni', images, videos, audios:task.referenceAudioUrls, audio:task.generateAudio,
    duration: task.videoDuration || 5, resolution, aspectRatio: task.size || '16:9',
  });
  if (error) throw new Error(error);
  return { resolution, ...(/^veo3\.1/i.test(canonicalModelId(model)) && (task.videoRefMode === 'extend' || isVeoNativeBase(baseUrl)) ? { backendReadable: true } : {}), ...(isMetasoH3(model, baseUrl) ? { context_ir_enabled: task.videoContextIrEnabled ?? true } : {}) };
}

/** A received usage report belongs to the local operation, even when its result is unknown. */
export function recordSubmissionUsage(task: GenerationTask, data: { model?: unknown; taskId?: unknown; recordId?: unknown; usage?: unknown; resultUrl?: unknown; audioUrl?: unknown; submissionUnknown?: unknown; status?: unknown }, complete = false) {
  if (!task.usageScope) return;
  complete = complete && data.submissionUnknown !== true && data.status !== 'FAILURE';
  if (!complete && !readReportedUsage(data.usage)) return;
  const video = isVideoTask(task);
  const audio = task.mediaType === 'audio';
  const model = typeof data.model === 'string' && data.model || task.model || (video ? 'doubao-seedance-2.5' : audio ? 'speech-2.8-hd' : 'gpt-image-2');
  recordMediaTaskUsage({
    localTaskId: task.id,
    recordId: typeof data.recordId === 'string' ? data.recordId : task.dbId,
    scope: task.usageScope,
    taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
    modelId: model,
    modelName: formatDisplayModel(model, video),
    type: audio ? 'audio' : video ? 'video' : 'image',
    mediaCount: complete ? 1 : 0,
    success: complete,
    billableCount: 1,
    duration: video ? (task.videoDuration || 5) : undefined,
    resolution: video ? task.videoResolution : undefined,
    usage: data.usage,
  });
}

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
  const requireRecovery = (cause?: unknown) => {
    const current = currentTask();
    // A concurrent receipt query may have already linked or resolved this operation.
    if (current?.taskId || current?.resultUrl ||
      (current?.status === 'FAILURE' && current.submissionRecoveryRequired === false)) return;
    if (cause !== undefined && !isGenerationCancelled(cause, signal)) {
      rememberSubmissionRequestError(t.id, formatUserError(cause, '网络连接异常，请检查网络后重试'));
    }
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
    updateGenerationTask(t.id, { usageScope: t.usageScope || operationUsageScope(t.id, isDepthVideoTask(t) ? 'depth-video' : 'depth-image', t.model) });
    let payload = peekDepthSubmit(t.id);
    if (!payload) {
      const refUrl = t.referenceImages?.[0] || t.referenceImageUrl;
      payload = await resolveDepthSubmit(t.id, refUrl, {
        style: t.depthStyle || 'mocap',
        quality: isDepthQuality(t.quality) ? t.quality : 'standard',
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
        const resolution = t.size === '480p' || t.size === '720p' ? t.size : undefined;
        const { taskId, recordId } = await submitDepthVideo(payload.file, payload.style, payload.quality, signal, t.id, resolution);
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
  const usageScope = t.usageScope || createUsageScope(t.mediaType || (isVideoTask(t) ? 'video' : 'image'), t.modelRouteKey || t.model, gatewayHeaders);
  updateGenerationTask(t.id, { usageScope });
  const video = isVideoTask(t);
  const isAudio = t.mediaType === 'audio';
  const clientT0 = Date.now();
  const refCount = Array.isArray(t.referenceImages)
    ? t.referenceImages.length
    : Array.isArray(t.images)
      ? t.images.length
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
          format: t.audioFormat || 'mp3',
          voice: t.audioVoice || 'zh-female-commercial',
          speed: t.audioSpeed ?? 1,
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

      const videoRefs = rawRefs.filter((u) => isTaskVideoReference(t, u));
      const imageRefs = rawRefs
        .filter((u) => !isTaskVideoReference(t, u))
        .map((img) => normalizeImageUrlToStandardJpg(img))
        .filter(Boolean) as string[];

      const videoBaseUrl = gatewayHeaders['x-custom-base-url'] || localUrl;
      const { backendReadable, ...videoInput } = prepareVideoSubmissionInput(t, videoBaseUrl, imageRefs, videoRefs);
      const finalVideoRefs = await prepareVideoReferences(videoRefs, signal, backendReadable);
      const finalImageRefs = t.videoRefMode === 'motion_control' ? await prepareMotionImageReferences(imageRefs, signal) : imageRefs;

      const videoBody = await prepareImageSubmission({
          clientTaskId: t.id,
          prompt: t.prompt,
          model: t.model || 'doubao-seedance-2.5',
          duration: t.videoDuration || 5,
          aspect_ratio: t.size || '16:9',
          ...videoInput,
          ref_mode: t.videoRefMode || 'omni',
          images: finalImageRefs,
          videos: finalVideoRefs,
          ...(t.referenceAudioUrls?.length ? {audios:await prepareAudioReferences(t.referenceAudioUrls, signal)} : {}),
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
        }, signal);

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
        body: videoBody,
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
      const isWorkshop = t.source === 'workshop' || Boolean(t.workshopMode);
      const modelCreds = getModelCredentials(t.modelRouteKey || t.model);
      const imageCaps = imageCapabilities(t.model, modelCreds.protocol, gatewayHeaders['x-custom-base-url'] || localUrl);
      const imgBody: Record<string, unknown> = {
        prompt: t.prompt,
        model: t.model || 'gpt-image-2',
        size: t.size || '2448x3264',
        aspectRatio: t.size === 'auto' || t.size === 'smart' ? 'auto' : getAspectRatioFromSize(t.size),
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
          ? { productImageUrl: primaryRefUrl, productTitle: t.title, workshopMode: t.workshopMode }
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
  } catch (networkErr: unknown) {
    // Once dispatch started, a lost or cancelled response may hide an accepted task.
    if (submissionDispatched) {
      requireRecovery(networkErr);
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
    console.warn(`[generationEngine] 网络连接异常:`, (networkErr instanceof Error ? networkErr.message : String(networkErr)));
    logLatencyAudit({
      hypothesisId: 'H4',
      location: 'useGenerationEngine.ts:submit-network',
      message: 'client submit network error',
      data: { taskLocalId: t.id, video, model: t.model, refCount, clientMs: Date.now() - clientT0, error: String((networkErr instanceof Error ? networkErr.message : String(networkErr)) || networkErr) },
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
  if (data?.usage) recordSubmissionUsage({ ...t, usageScope }, data);
  if (signal?.aborted) {
    requireRecovery();
    return;
  }
  logLatencyAudit({
    hypothesisId: 'H4',
    location: 'useGenerationEngine.ts:submit-done',
    message: 'client submit roundtrip',
    data: { taskLocalId: t.id, video, model: t.model, refCount, clientSubmitMs, httpStatus: res.status, ok: Boolean(data?.success), serverTiming: data?.timing || null, anomaly: clientSubmitMs > 45000 },
  });

  if (!data?.taskId && !data?.resultUrl && (data?.submissionUnknown === true || (res.ok && !data) || (res.status >= 500 && data?.submissionRejected !== true))) {
    requireRecovery(typeof data?.error === 'string' ? data.error : undefined);
    return;
  }

  // 服务端明确拒绝（包括参数错误、未配置密钥、上游拒绝）时，直接置为 FAILURE，避免误入恢复死循环
  if (data?.submissionRejected || ((!res.ok || data?.success === false) && data?.error && !data?.taskId && !data?.submissionUnknown)) {
    updateGenerationTask(t.id, {
      status: 'FAILURE',
      submissionRecoveryRequired: false,
      failReason: formatUserError(data?.error || `生成任务已被拒绝 (HTTP ${res.status})`),
    });
    return;
  }

  if ((!res.ok || !data?.success) && !data?.taskId) {
    updateGenerationTask(t.id, {
      status: 'FAILURE', submissionRecoveryRequired: false,
      failReason: formatUserError(data?.error || `生成任务提交失败 (HTTP ${res.status})`),
    });
    return;
  }

  pollCounts[`_start_${t.id}`] = Date.now();

  const finalResultUrl = data.resultUrl || data.audioUrl;
  recordSubmissionUsage({ ...t, usageScope }, data, Boolean(finalResultUrl));
  if (isAudio && data.submissionUnknown && !finalResultUrl) {
    requireRecovery(typeof data.error === 'string' ? data.error : '音频提交结果待核对，不会重新生成');
    return;
  }
  if (finalResultUrl) {
    delete pollCounts[`_start_${t.id}`];
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
    requireRecovery('接口未返回任务 ID 或结果');
  }
  } finally {
    if (claimedFlight) releaseSubmissionFlight(t.id);
  }
}
