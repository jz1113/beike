import { gatewayFetch } from '../../gateways/http';
import { guardSubmission } from '../submissionGuard';
import { jsonResponse } from '../../core/http';
import { prisma } from '../../repositories/db';
import { convertToStandardJpegDataUrl } from '@beike/server-kit/imageConverter';
import { buildVideoRequest } from '@beike/domain/modelAdapters';
import { DEFAULT_VIDEO_MODEL_ID, isApprovedModel } from '@beike/domain/modelCatalog';
import { createImageConvertCache, logLatencyAudit } from '@beike/domain/latencyAudit';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { cleanPromptText } from '@beike/domain/drawing';
import { resolveCredentials } from '../gatewayCredentials';
import { videoTaskEndpointCache } from './videoGenerationTypes';

/**
 * POST /api/generate/video
 * 提交异步视频生成任务：统一网关 + 模型适配层（Seedance / Veo / Wan / MiniMax / Sora…）
 */
async function submit(req: Request) {
  const t0 = Date.now();
  let convertMs = 0;
  let gatewayMs = 0;
  let dbMs = 0;
  let payloadBytes = 0;
  let endpointAttempts = 0;
  let convertCacheHits = 0;
  try {
    const body = await req.json();
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
      return jsonResponse({ success: false, error: '视频提示词不能为空' }, 400);
    }
    if (!isApprovedModel(String(model), 'video')) {
      return jsonResponse({ success: false, error: `模型 ${model} 不在当前生视频白名单中` }, 400);
    }

    const { baseUrl, apiKey } = resolveCredentials(req, body);
    const cleanedPrompt = cleanPromptText(prompt);

    const rawImages: string[] = Array.isArray(images) ? [...images] : [];
    if (first_frame_image && !rawImages.includes(first_frame_image)) {
      rawImages.unshift(first_frame_image);
    }
    if (referenceImageUrl && !rawImages.includes(referenceImageUrl)) {
      rawImages.unshift(referenceImageUrl);
    }
    if (last_frame_image && !rawImages.includes(last_frame_image)) {
      rawImages.push(last_frame_image);
    }

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

    const adapted = buildVideoRequest({
      model,
      prompt: cleanedPrompt,
      duration,
      aspectRatio: aspect_ratio,
      resolution,
      images: effectiveImages,
      videos: Array.isArray(videos) ? videos : [],
      firstFrame: first_frame_image,
      lastFrame: last_frame_image,
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
        const tId = data?.output?.task_id || data?.task_id || data?.data?.task_id || data?.id || (typeof data?.data === 'string' ? data.data : null);

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
        }
      } catch (err: any) {
        lastErrorMsg = err.message || String(err);
        console.warn(`[AI视频-提交] 连接 ${submitUrl} 异常: ${err.message}`);
        if (/timeout|timed out|aborted/i.test(lastErrorMsg)) {
          return jsonResponse({
            success: false,
            error: formatUserError(err, '视频任务提交超时，请查询原任务状态后再决定是否重试'),
            submissionUnknown: true,
          }, 503);
        }
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

    const taskId = genData?.output?.task_id || genData?.task_id || genData?.data?.task_id || genData?.id || (typeof genData?.data === 'string' ? genData.data : null);

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
      let validProductId: string | null = null;
      if (productId) {
        const existProduct = await prisma.product.findUnique({ where: { id: productId } }).catch(() => null);
        if (existProduct) {
          validProductId = productId;
        }
      }

      const taskRecord = await prisma.imageTask.upsert({
        where: { taskId: taskId },
        update: {
          productId: validProductId,
          prompt: cleanedPrompt,
          model: normalizedModel || model || 'doubao-seedance-2.5',
          mediaType: 'video',
          size: normRatio || computedSize || '16:9',
          quality: safeResolution || '720p',
          status: 'IN_PROGRESS'
        },
        create: {
          productId: validProductId,
          prompt: cleanedPrompt,
          taskId: taskId,
          model: normalizedModel || model || 'doubao-seedance-2.5',
          mediaType: 'video',
          size: normRatio || computedSize || '16:9',
          quality: safeResolution || '720p',
          status: 'IN_PROGRESS'
        }
      });
      recordId = taskRecord.id;
    } catch (dbErr: any) {
      console.error(`[AI视频-入库] 数据库记录失败: ${dbErr.message}`);
      return jsonResponse({
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

    return jsonResponse(responsePayload);

  } catch (error: any) {
    console.error('[AI视频] 任务提交发生异常:', error);
    logLatencyAudit({
      hypothesisId: 'H3',
      location: 'generate-video/route.ts:POST-catch',
      message: 'video submit exception',
      data: { error: String(error?.message || error), convertMs, gatewayMs, endpointAttempts, totalMs: Date.now() - t0 },
    });
    return jsonResponse({
      success: false,
      error: formatUserError(error, '视频生成任务提交失败')
    }, 500);
  }
}

export async function POST(req: Request) {
  let body;
  try { body = await req.json(); } catch { return jsonResponse({ success: false, error: '请求格式不正确' }, 400); }
  const replay = () => new Request(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(body) });
  try {
    return await guardSubmission(replay(), 'video', resolveCredentials(replay(), body), () => submit(replay()));
  } catch {
    return jsonResponse({ success: false, error: '任务提交记录保存失败，请核对原任务状态后重试', submissionUnknown: true }, 503);
  }
}
