import { readVideoTaskId } from './videoResponse';
import { videoInputError } from '@shared/domain/media/videoCapabilities';
import { gatewayFetch } from '../../gateways/http';
import { generationTaskRepository } from '@server/repositories/generationTasks';
import { convertToStandardJpegDataUrl } from '@server/infrastructure/media/imageConverter';
import { buildVideoRequest } from '@shared/domain/models/modelAdapters';
import { DEFAULT_VIDEO_MODEL_ID, isApprovedModel } from '@shared/domain/models/modelCatalog';
import { createImageConvertCache, logLatencyAudit } from '@shared/domain/core/latencyAudit';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { cleanPromptText } from '@shared/domain/media/drawing';
import { videoTaskEndpointCache, videoTaskQueryTemplateCache } from './videoGenerationTypes';
import { canTryAnotherSubmissionEndpoint } from './submissionPolicy';

/**
 * POST /api/generate/video
 * 提交异步视频生成任务：统一网关 + 模型适配层（Seedance / Veo / Wan / MiniMax / Sora…）
 */
const videoResult = <T>(body: T, status = 200) => ({ body, status });

export async function submitVideoOnce(body: Record<string, any>, credentials: { baseUrl: string; apiKey: string }, t0 = Date.now()) {
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

    const submitUrls = adapted.endpoints(baseUrl).submit;

    let genRes: Response | null = null;
    let genData: any = null;
    let lastErrorMsg = '';
    let usedSubmitUrl = '';

    const tGw0 = Date.now();
    for (const submitUrl of submitUrls) {
      endpointAttempts += 1;
      console.log(`[AI视频-提交] 正在尝试派发任务至: ${submitUrl}`);
      try {
        const attemptTimeout = endpointAttempts === 1 ? 60000 : 20000;
        const requestHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...(adapted.headers || {}),
        };
        if (submitUrl.includes('/video-generation/') || submitUrl.includes('/qwen/')) {
          requestHeaders['X-DashScope-Async'] = 'enable';
        }

        const res = await gatewayFetch(submitUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: payloadJson,
          signal: AbortSignal.timeout(attemptTimeout),
        });

        const data = await res.json().catch(() => null);
        const tId = readVideoTaskId(data, adapted.family);

        if (res.ok && tId) {
          genRes = res;
          genData = data;
          usedSubmitUrl = submitUrl;
          break;
        } else {
          // 深度提取上游错误信息（支持 new-api / one-api / volcengine / qwen 各类格式）
          const errDetail =
            data?.output?.message ||
            data?.error?.message ||
            data?.error?.details ||
            (typeof data?.error === 'string' ? data.error : '') ||
            data?.message ||
            data?.fail_reason ||
            `HTTP ${res.status}`;
          lastErrorMsg = errDetail;
          console.warn(`[AI视频-提交] 端点 ${submitUrl} 未被接受 (HTTP ${res.status}):`, JSON.stringify(data || errDetail));
          if (res.ok || res.status >= 500) {
            return videoResult({
              success: false,
              error: '视频提交结果不确定，请核对上游任务记录后再决定是否重试',
              submissionUnknown: true,
            }, 503);
          }
          // Only an explicit missing endpoint or unsupported media type permits
          // another submission URL. Other responses may follow a billable task.
          if (!canTryAnotherSubmissionEndpoint(res.status)) break;
        }
      } catch (err: any) {
        lastErrorMsg = err.message || String(err);
        console.warn(`[AI视频-提交] 连接 ${submitUrl} 异常: ${err.message}`);
        return videoResult({
          success: false,
          error: formatUserError(err, '视频任务提交结果不确定，请核对上游任务记录后再决定是否重试'),
          submissionUnknown: true,
        }, 503);
      }
    }
    gatewayMs = Date.now() - tGw0;

    if (!genRes || !genData) {
      logLatencyAudit({
        hypothesisId: 'H3',
        location: 'generate-video/route.ts:POST-fail',
        message: 'video submit failed all endpoints',
        data: {
          model: normalizedModel,
          family: adapted.family,
          parseMs,
          convertMs,
          gatewayMs,
          endpointAttempts,
          payloadBytes,
          imageCount: effectiveImages.length,
          convertCacheHits,
          lastErrorMsg,
          totalMs: Date.now() - t0,
        },
      });
      throw new Error(`视频接口错误: ${lastErrorMsg || '网络连接超时或网关拒绝该模型'}`);
    }

    const taskId = readVideoTaskId(genData, adapted.family);
    if (!taskId) return videoResult({ success: false, submissionUnknown: true, error: '视频提交结果不确定，请核对上游任务记录后再决定是否重试' }, 503);
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
    } catch (dbErr: any) {
      console.error(`[AI视频-入库] 数据库记录失败: ${dbErr.message}`);
      return videoResult({
        success: false,
        error: `任务持久化失败: ${dbErr.message}`,
        taskId,
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

  } catch (error: any) {
    console.error('[AI视频] 任务提交发生异常:', error);
    logLatencyAudit({
      hypothesisId: 'H3',
      location: 'generate-video/route.ts:POST-catch',
      message: 'video submit exception',
      data: { error: String(error?.message || error), convertMs, gatewayMs, endpointAttempts, totalMs: Date.now() - t0 },
    });
    return videoResult({
      success: false,
      error: formatUserError(error, '视频生成任务提交失败')
    }, 500);
  }
}
