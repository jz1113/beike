import { readVideoTaskId } from './videoResponse';
import { videoInputError } from '@shared/domain/media/videoCapabilities';
import { submitVideoToGateway } from '../../gateways/videoSubmission';
import type { VideoGenerationBody } from '@shared/contracts/videoGeneration';
import { generationTaskRepository } from '@server/repositories/generationTasks';
import { convertToStandardJpegDataUrl } from '@server/infrastructure/media/imageConverter';
import { buildVideoRequest } from '@shared/domain/models/modelAdapters';
import { DEFAULT_VIDEO_MODEL_ID, isApprovedModel } from '@shared/domain/models/modelCatalog';
import { createImageConvertCache, logLatencyAudit } from '@shared/domain/core/latencyAudit';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { cleanPromptText } from '@shared/domain/media/drawing';
import { videoTaskEndpointCache, videoTaskQueryTemplateCache } from './videoGenerationTypes';

/**
 * POST /api/generate/video
 * 提交异步视频生成任务：统一网关 + 模型适配层（Seedance / Veo / Wan / MiniMax / Sora…）
 */
const videoResult = <T>(body: T, status = 200) => ({ body, status });

export async function submitVideoOnce(body: VideoGenerationBody, credentials: { baseUrl: string; apiKey: string }, t0 = Date.now()) {
  let convertMs = 0;
  let gatewayMs = 0;
  let dbMs = 0;
  let payloadBytes = 0;
  let endpointAttempts = 0;
  let convertCacheHits = 0;
  try {
    const parseMs = Date.now() - t0;
    const {
      prompt,
      model = DEFAULT_VIDEO_MODEL_ID,
      duration = 5,
      aspect_ratio = '16:9',
      resolution = '720P',
      images = [],
      videos = [],
      watermark = false,
      productId,
      referenceImageUrl,
      first_frame_image,
      last_frame_image,
      ref_mode,
      camera_motion,
      camera_control,
      audio,
      fps,
      seed,
      character,
      character_id,
      storyboard,
    } = body;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return videoResult({ success: false, error: '视频提示词不能为空' }, 400);
    }
    if (!isApprovedModel(String(model), 'video')) {
      return videoResult({ success: false, error: `模型 ${model} 不在当前生视频白名单中` }, 400);
    }

    const { baseUrl, apiKey } = credentials;
    const cleanedPrompt = cleanPromptText(prompt);

    const rawImages: string[] = Array.isArray(images) ? [...images] : [];
    if (rawImages.some(value => typeof value !== 'string' || !value.trim()) || (videos !== undefined && (!Array.isArray(videos) || videos.some(value => typeof value !== 'string' || !value.trim())))) {
      return videoResult({ success: false, error: '参考素材必须是有效地址列表' }, 400);
    }
    if (first_frame_image && !rawImages.includes(first_frame_image)) {
      rawImages.unshift(first_frame_image);
    }
    if (referenceImageUrl && !rawImages.includes(referenceImageUrl)) {
      rawImages.unshift(referenceImageUrl);
    }
    if (last_frame_image && !rawImages.includes(last_frame_image)) {
      rawImages.push(last_frame_image);
    }

    const inputError = videoInputError({ model, refMode: ref_mode || (last_frame_image ? 'first_last_frame' : first_frame_image ? 'first_frame' : 'omni'), images: rawImages, videos: Array.isArray(videos) ? videos : [], duration, resolution, aspectRatio: aspect_ratio });
    if (inputError) return videoResult({ success: false, error: inputError }, 400);

    const convertOnce = createImageConvertCache((raw) =>
      convertToStandardJpegDataUrl(raw, { maxDimension: 1024, quality: 75 })
    );
    const seenKeys = new Set<string>();
    const convertTracked = (raw?: string | null) => {
      if (raw && typeof raw === 'string' && raw.trim()) {
        const k = raw.trim();
        if (seenKeys.has(k)) convertCacheHits += 1;
        else seenKeys.add(k);
      }
      return convertOnce(raw);
    };

    const tConvert0 = Date.now();
    const safeImageResults = await Promise.all(
      rawImages.map(img => convertTracked(img))
    );
    convertMs = Date.now() - tConvert0;
    const effectiveImages: string[] = safeImageResults.filter(Boolean) as string[];

    if (effectiveImages.length !== rawImages.length) return videoResult({ success: false, error: '参考图片读取失败，请重新添加素材后提交' }, 400);

    const adapted = buildVideoRequest({
      model,
      prompt: cleanedPrompt,
      duration,
      aspectRatio: aspect_ratio,
      resolution,
      images: effectiveImages,
      videos: Array.isArray(videos) ? videos : [],
      firstFrame: first_frame_image ? await convertTracked(first_frame_image) || undefined : undefined,
      lastFrame: last_frame_image ? await convertTracked(last_frame_image) || undefined : undefined,
      refMode: ref_mode,
      watermark,
      audio,
      fps,
      seed,
      cameraMotion: camera_motion || camera_control,
      character: character || character_id,
      storyboard,
    });

    const videoPayload = adapted.payload;
    const normalizedModel = adapted.modelId;
    const safeDuration = Number(videoPayload.duration) || 5;
    const effectiveRatio = String(videoPayload.aspect_ratio || aspect_ratio || '16:9');
    const safeResolution = String(videoPayload.resolution || '480p');
    const computedSize = String(videoPayload.size || '');
    const normRatio = aspect_ratio || '16:9';
    const payloadJson = JSON.stringify(videoPayload);
    payloadBytes = Buffer.byteLength(payloadJson, 'utf8');

    console.log(`[AI视频-提交] family=${adapted.family} 模型=${normalizedModel}, 时长=${safeDuration}s, 比例=${effectiveRatio}, 分辨率=${safeResolution}, 尺寸=${computedSize}, 参考图数=${effectiveImages.length}`);

    const submission = await submitVideoToGateway({
      endpoints: adapted.endpoints(baseUrl).submit, apiKey, payloadJson, headers: adapted.headers,
      readTaskId: value => readVideoTaskId(value, adapted.family),
    });
    gatewayMs = submission.gatewayMs;
    endpointAttempts = submission.endpointAttempts;
    const usedSubmitUrl = submission.usedSubmitUrl;
    if (submission.outcome !== 'accepted') {
      const unknown = submission.outcome === 'unknown';
      logLatencyAudit({ hypothesisId: 'H3', location: 'generate-video/route.ts:POST-fail', message: 'video submit outcome',
        data: { model: normalizedModel, family: adapted.family, outcome: submission.outcome, gatewayMs, endpointAttempts, upstreamStatus: submission.upstreamStatus } });
      return videoResult({ success: false, submissionOutcome: submission.outcome, submissionUnknown: unknown, retryable: false,
        ...(submission.outcome === 'unknown' && submission.taskId ? { taskId: submission.taskId } : {}),
        error: unknown ? '视频提交结果不确定，请核对上游任务记录' : formatUserError(submission.error, '视频提交被拒绝'),
      }, unknown ? 503 : 400);
    }
    const taskId = submission.taskId;
    const queryTemplate = adapted.endpoints(baseUrl).query[0];
    if (queryTemplate) videoTaskQueryTemplateCache.set(`${baseUrl}:${taskId}`, queryTemplate);

    if (taskId) {
      const taskPrefix = String(taskId).slice(0, 8);
      const cacheKey = `${baseUrl}:${taskPrefix}`;
      if (usedSubmitUrl.includes('/seedance/v3/contents/generations/tasks')) {
        videoTaskEndpointCache.set(cacheKey, `${baseUrl}/seedance/v3/contents/generations/tasks`);
      } else if (usedSubmitUrl.includes('/qwen/api/v1/services/aigc/video-generation/video-synthesis')) {
        videoTaskEndpointCache.set(cacheKey, `${baseUrl}/qwen/api/v1/tasks`);
      } else if (usedSubmitUrl.includes('/api/v1/services/aigc/video-generation/video-synthesis')) {
        videoTaskEndpointCache.set(cacheKey, `${baseUrl}/api/v1/tasks`);
      }
    }

    console.log(`[AI视频-成功] 成功分派视频任务: taskId=${taskId}, 模型=${normalizedModel}`);

    let recordId: string | undefined;
    const tDb0 = Date.now();
    try {
      const taskRecord = await generationTaskRepository.upsertVideoTask({
        productId, prompt: cleanedPrompt, taskId,
        model: normalizedModel || model || 'doubao-seedance-2.5',
        size: normRatio || computedSize || '16:9',
        quality: safeResolution || '720p',
      });
      recordId = taskRecord.id;
    } catch (dbErr: unknown) {
      console.error('[AI视频-入库] 数据库记录失败', dbErr);
      return videoResult({
        success: false,
        error: '任务已提交，但本地记录保存失败，请核对原任务',
        taskId, submissionOutcome: 'accepted', submissionUnknown: true, retryable: false,
      }, 500);
    }
    dbMs = Date.now() - tDb0;

    const totalMs = Date.now() - t0;
    const timing = {
      parseMs,
      convertMs,
      gatewayMs,
      dbMs,
      totalMs,
      payloadKB: Math.round(payloadBytes / 1024),
      imageCount: effectiveImages.length,
      endpointAttempts,
      convertCacheHits,
    };
    logLatencyAudit({
      hypothesisId: 'H3',
      location: 'generate-video/route.ts:POST-ok',
      message: 'video submit timing',
      data: {
        model: normalizedModel,
        family: adapted.family,
        usedSubmitUrl,
        ...timing,
        anomaly: convertMs > 8000 || gatewayMs > 45000 || endpointAttempts > 1 || payloadBytes > 2_500_000,
      },
    });

    const responsePayload = {
      success: true,
      taskId,
      recordId,
      model: normalizedModel,
      family: adapted.family,
      duration: safeDuration,
      aspect_ratio: normRatio,
      resolution: safeResolution,
      size: computedSize,
      status: 'IN_PROGRESS',
      prompt: cleanedPrompt,
      timing,
    };

    return videoResult(responsePayload);

  } catch (error: unknown) {
    console.error('[AI视频] 任务提交发生异常:', error);
    logLatencyAudit({
      hypothesisId: 'H3',
      location: 'generate-video/route.ts:POST-catch',
      message: 'video submit exception',
      data: { error: error instanceof Error ? error.message : String(error), convertMs, gatewayMs, endpointAttempts, totalMs: Date.now() - t0 },
    });
    return videoResult({
      success: false,
      error: formatUserError(error, '视频生成任务提交失败'), retryable: false
    }, 500);
  }
}
