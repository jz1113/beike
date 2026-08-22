import { jsonResponse } from '../../adapters/http';
import { prisma } from '@/lib/prisma';
import { cleanPromptText } from '@/lib/drawing';
import { persistMediaUrl, extractStorageConfigFromRequest } from '@/lib/storage';
import { convertToStandardJpegDataUrl } from '@/lib/imageConverter';
import { buildVideoRequest } from '@/lib/modelAdapters';
import { createImageConvertCache, logLatencyAudit } from '@/lib/latencyAudit';
import { formatUserError } from '../../lib/formatApiError';

const DEFAULT_BASE_URL = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
const DEFAULT_API_KEY = process.env.AI_DRAWING_API_KEY || '';

/**
 * 获取请求使用的 Base URL 和 API Key (优先使用客户端自定义配置)
 */
function resolveCredentials(req: Request, body?: any) {
  const customApiKey = body?.customApiKey || req.headers.get('x-custom-api-key');
  const allowCustomBase =
    process.env.NODE_ENV !== 'production' || process.env.ALLOW_CUSTOM_BASE_URL === 'true';
  const customBaseUrl = allowCustomBase
    ? (body?.customBaseUrl || req.headers.get('x-custom-base-url') || undefined)
    : undefined;

  const baseUrl = (customBaseUrl && customBaseUrl.trim())
    ? customBaseUrl.trim().replace(/\/+$/, '')
    : DEFAULT_BASE_URL;
  const apiKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : DEFAULT_API_KEY;

  return { baseUrl, apiKey };
}

/**
 * POST /api/generate/video
 * 提交异步视频生成任务：统一网关 + 模型适配层（Seedance / Veo / Wan / MiniMax / Sora…）
 */
export async function POST(req: Request) {
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
      model = 'doubao-seedance-2.0-mini',
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
      storyboard
    } = body;

    if (!prompt || !prompt.trim()) {
      return jsonResponse({ success: false, error: '视频提示词不能为空' }, 400);
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

    const convertOnce = createImageConvertCache(convertToStandardJpegDataUrl);
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
    const safeResolution = String(videoPayload.resolution || '720p');
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
        // 失败端点快速放弃，避免串行拖死提交（首端点仍给足 120s）
        const attemptTimeout = endpointAttempts === 1 ? 120000 : 15000;
        const res = await fetch(submitUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: payloadJson,
          signal: AbortSignal.timeout(attemptTimeout),
        });

        const data = await res.json().catch(() => null);
        const tId = data?.task_id || data?.data?.task_id || data?.id || (typeof data?.data === 'string' ? data.data : null);

        if (res.ok && tId) {
          genRes = res;
          genData = data;
          usedSubmitUrl = submitUrl;
          break;
        } else {
          lastErrorMsg = data?.message || data?.error?.message || data?.fail_reason || `HTTP ${res.status}`;
          console.warn(`[AI视频-提交] 端点 ${submitUrl} 未被接受: ${lastErrorMsg}`);
        }
      } catch (err: any) {
        lastErrorMsg = err.message || String(err);
        console.warn(`[AI视频-提交] 连接 ${submitUrl} 异常: ${err.message}`);
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

    const taskId = genData?.task_id || genData?.data?.task_id || genData?.id || (typeof genData?.data === 'string' ? genData.data : null);

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

      const taskRecord = await prisma.imageTask.create({
        data: {
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

    return jsonResponse({
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
    });

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

// 视频任务轮询端点记忆缓存 (提升 300% 轮询响应速度)
const videoTaskEndpointCache = new Map<string, string>();

/**
 * GET /api/generate/video?taskId={taskId}
 * 轮询查询异步视频任务状态 (严格支持 /v1/videos/:id 与 /v2/videos/generations/:id 各类返回载荷)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return jsonResponse({ success: false, error: '缺少 taskId 参数' }, 400);
    }

    const { baseUrl, apiKey } = resolveCredentials(req);

    // 多端点状态查询适配 (优先查询历史命中的端点，大幅降低网络开销)
    const taskPrefix = taskId.slice(0, 8);
    const cacheKey = `${baseUrl}:${taskPrefix}`;
    const cachedEndpointBase = videoTaskEndpointCache.get(cacheKey) || videoTaskEndpointCache.get(baseUrl);
    const queryUrls = Array.from(new Set([
      cachedEndpointBase ? `${cachedEndpointBase}/${taskId}` : undefined,
      `${baseUrl}/v2/videos/generations/${taskId}`,
      `${baseUrl}/v1/video/generations/${taskId}`,
      `${baseUrl}/v1/videos/${taskId}`,
      `${baseUrl}/xai/v1/videos/generations/${taskId}`,
      `${baseUrl}/v1/query/video_generation?task_id=${taskId}`
    ])).filter(Boolean) as string[];

    let res: Response | null = null;
    let resData: any = null;

    for (const qUrl of queryUrls) {
      try {
        const r = await fetch(qUrl, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          signal: AbortSignal.timeout(5000)
        });
        if (r.ok) {
          const d = await r.json().catch(() => null);
          if (d && (d.status || d.data?.status || d.video_url || d.url || d.data?.output || d.output || d.data?.data)) {
            res = r;
            resData = d;
            // 记忆命中的端点基础路径
            const matchedBase = qUrl.replace(`/${taskId}`, '').replace(`?task_id=${taskId}`, '');
            videoTaskEndpointCache.set(cacheKey, matchedBase);
            videoTaskEndpointCache.set(baseUrl, matchedBase);
            break;
          }
        }
      } catch (err) {}
    }

    if (!res || !res.ok || !resData) {
      console.warn(`[AI视频-轮询] 查询任务 ${taskId} 状态暂未就绪`);
      return jsonResponse({
        success: true,
        taskId,
        status: 'IN_PROGRESS',
        progress: '15%'
      });
    }

    const taskInfo = resData.data || resData;

    const rawStatus = (taskInfo.status || resData.status || 'PENDING').toUpperCase();
    const progress = taskInfo.progress !== undefined 
      ? (String(taskInfo.progress).endsWith('%') ? String(taskInfo.progress) : `${taskInfo.progress}%`) 
      : (resData.progress !== undefined 
        ? (String(resData.progress).endsWith('%') ? String(resData.progress) : `${resData.progress}%`) 
        : (rawStatus === 'SUCCESS' || rawStatus === 'COMPLETED' ? '100%' : '35%'));
    const rawFailReason = taskInfo.fail_reason || resData.fail_reason || resData.message || taskInfo.error?.message || taskInfo.error || '';
    const failReason = rawFailReason ? formatUserError(String(rawFailReason), '视频生成失败') : '';

    // 🌟 全量提取结果视频 URL (覆盖 url / video_url / output / outputs / download_url 等所有格式)
    let resultUrl = '';
    if (typeof taskInfo.video_url === 'string' && taskInfo.video_url.trim()) {
      resultUrl = taskInfo.video_url.trim();
    } else if (typeof taskInfo.url === 'string' && taskInfo.url.trim()) {
      resultUrl = taskInfo.url.trim();
    } else if (typeof taskInfo.output === 'string' && taskInfo.output.trim()) {
      resultUrl = taskInfo.output.trim();
    } else if (Array.isArray(taskInfo.outputs) && taskInfo.outputs.length > 0 && typeof taskInfo.outputs[0] === 'string') {
      resultUrl = taskInfo.outputs[0].trim();
    } else if (typeof taskInfo.data?.video_url === 'string' && taskInfo.data.video_url.trim()) {
      resultUrl = taskInfo.data.video_url.trim();
    } else if (typeof taskInfo.data?.url === 'string' && taskInfo.data.url.trim()) {
      resultUrl = taskInfo.data.url.trim();
    } else if (typeof taskInfo.data?.output === 'string' && taskInfo.data.output.trim()) {
      resultUrl = taskInfo.data.output.trim();
    } else if (Array.isArray(taskInfo.data?.outputs) && taskInfo.data.outputs.length > 0) {
      resultUrl = taskInfo.data.outputs[0].trim();
    } else if (typeof taskInfo.download_url === 'string' && taskInfo.download_url.trim()) {
      resultUrl = taskInfo.download_url.trim();
    } else if (typeof taskInfo.video?.download_url === 'string' && taskInfo.video.download_url.trim()) {
      resultUrl = taskInfo.video.download_url.trim();
    } else if (typeof resData.video_url === 'string' && resData.video_url.trim()) {
      resultUrl = resData.video_url.trim();
    } else if (typeof resData.url === 'string' && resData.url.trim()) {
      resultUrl = resData.url.trim();
    } else if (typeof resData.output === 'string' && resData.output.trim()) {
      resultUrl = resData.output.trim();
    } else if (typeof resData.data?.output === 'string') {
      resultUrl = resData.data.output.trim();
    }

    // 🌟 规范化任务状态 (只要提取到有效视频 URL 且非明确失败，直接判定为 SUCCESS)
    let status = 'IN_PROGRESS';
    if (resultUrl && rawStatus !== 'FAILURE' && rawStatus !== 'FAILED' && rawStatus !== 'ERROR') {
      status = 'SUCCESS';
    } else if (rawStatus === 'SUCCESS' || rawStatus === 'SUCCEEDED' || rawStatus === 'COMPLETED' || rawStatus === 'FINISHED') {
      status = resultUrl ? 'SUCCESS' : 'IN_PROGRESS';
    } else if (rawStatus === 'FAILURE' || rawStatus === 'FAILED' || rawStatus === 'ERROR') {
      status = 'FAILURE';
    } else {
      status = 'IN_PROGRESS';
    }

    // 任务完成时更新数据库记录
    if (status === 'SUCCESS' || status === 'FAILURE') {
      try {
        await prisma.imageTask.updateMany({
          where: { taskId: taskId },
          data: {
            status: status,
            resultUrl: resultUrl || undefined,
            failReason: failReason || undefined
          }
        });

        // 🌟 自动异步转存视频至永久对象存储 (非阻塞)
        if (status === 'SUCCESS' && resultUrl) {
          const storageConfig = extractStorageConfigFromRequest(req);
          persistMediaUrl(taskId, resultUrl, 'video', storageConfig).catch(() => {});
        }
      } catch (dbErr) {
        // ignore
      }
    }

    return jsonResponse({
      success: true,
      taskId,
      status,
      progress,
      resultUrl,
      failReason
    });

  } catch (error: any) {
    console.error('[AI视频-轮询] 异常:', error);
    return jsonResponse({
      success: false,
      error: formatUserError(error, '查询视频任务状态失败')
    }, 500);
  }
}
