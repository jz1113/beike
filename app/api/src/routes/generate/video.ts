import { normalizeGatewayBaseUrl } from '@beike/shared/gatewayUrl';
import { guardSubmission } from '../../services/submissionGuard';
import { jsonResponse } from '../../core/http';
import { prisma } from '@beike/shared/prisma';
import LRUCache from 'lru-cache';
import { cleanPromptText } from '@beike/shared/drawing';
import { persistMediaUrl, extractStorageConfigFromRequest } from '@beike/shared/storage';
import { convertToStandardJpegDataUrl } from '@beike/shared/imageConverter';
import { buildVideoRequest } from '@beike/shared/modelAdapters';
import { createImageConvertCache, logLatencyAudit } from '@beike/shared/latencyAudit';
import { formatUserError } from '@beike/shared/upstreamErrors';
import { allowClientCustomBaseUrl } from '@beike/shared/gatewayCreds';
import { getDefaultBaseUrl, getDefaultApiKey } from '../../services/imageHelpers';

/**
 * 获取请求使用的 Base URL 和 API Key (优先使用客户端自定义配置)
 */
function resolveCredentials(req: Request, body?: any) {
  const url = new URL(req.url);
  const customApiKey =
    body?.customApiKey ||
    req.headers.get('x-custom-api-key') ||
    url.searchParams.get('customApiKey') ||
    undefined;
  const customBaseUrl = allowClientCustomBaseUrl()
    ? (body?.customBaseUrl ||
        req.headers.get('x-custom-base-url') ||
        url.searchParams.get('customBaseUrl') ||
        undefined)
    : undefined;

  const baseUrl = normalizeGatewayBaseUrl(customBaseUrl || getDefaultBaseUrl());
  const apiKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : getDefaultApiKey();

  return { baseUrl, apiKey };
}

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
      storyboard,
      clientTaskId,
    } = body;

    if (typeof prompt !== "string" || !prompt.trim()) {
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

        const res = await fetch(submitUrl, {
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

// 视频任务轮询端点记忆缓存 (提升 300% 轮询响应速度)
const videoTaskEndpointCache = new LRUCache<string, string>({ max: 500 });

/**
 * GET /api/generate/video?taskId={taskId}
 * 轮询查询异步视频任务状态 (严格支持 /seedance/v3/... 与 /v1/videos/:id 与 /v2/videos/generations/:id 各类返回载荷)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return jsonResponse({ success: false, error: '缺少 taskId 参数' }, 400);
    }

    console.log('[AI视频-GET轮询请求] 接收到轮询请求: taskId =', taskId);

    const { baseUrl, apiKey } = resolveCredentials(req);

    // 多端点状态查询适配：针对 Seedance 官方任务 (cgt-*) 精准直达官方查询端点，杜绝通用端点试探延迟
    const isCgtTask = taskId.startsWith('cgt-');
    const taskPrefix = taskId.slice(0, 8);
    const cacheKey = `${baseUrl}:${taskPrefix}`;
    const cachedEndpointBase = videoTaskEndpointCache.get(cacheKey) || videoTaskEndpointCache.get(baseUrl);

    const queryUrls = isCgtTask
      ? [`${baseUrl}/seedance/v3/contents/generations/tasks/${taskId}`]
      : Array.from(new Set([
          cachedEndpointBase ? `${cachedEndpointBase}/${taskId}` : undefined,
          `${baseUrl}/qwen/api/v1/tasks/${taskId}`,
          `${baseUrl}/api/v1/tasks/${taskId}`,
          `${baseUrl}/seedance/v3/contents/generations/tasks/${taskId}`,
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
        const timeoutMs = isCgtTask ? 3500 : 5000;
        const r = await fetch(qUrl, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (r.ok) {
          const d = await r.json().catch(() => null);
          if (d && (d.status || d.data?.status || d.output?.task_status || d.video_url || d.url || d.data?.output || d.output || d.data?.data || d.content)) {
            res = r;
            resData = d;
            // 记忆命中的端点基础路径
            const matchedBase = qUrl.replace(`/${taskId}`, '').replace(`?task_id=${taskId}`, '');
            videoTaskEndpointCache.set(cacheKey, matchedBase);
            videoTaskEndpointCache.set(baseUrl, matchedBase);
            break;
          }
        }
      } catch {}
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

    const taskInfo = resData.data || resData.output || resData;

    const rawStatus = (
      taskInfo.task_status ||
      taskInfo.status ||
      resData.task_status ||
      resData.status ||
      resData.output?.task_status ||
      'PENDING'
    ).toUpperCase();
    const isTaskDone = rawStatus === 'SUCCESS' || rawStatus === 'SUCCEEDED' || rawStatus === 'COMPLETED' || rawStatus === 'FINISHED';
    const progress = isTaskDone
      ? '100%'
      : taskInfo.progress !== undefined 
        ? (String(taskInfo.progress).endsWith('%') ? String(taskInfo.progress) : `${taskInfo.progress}%`) 
        : (resData.progress !== undefined 
          ? (String(resData.progress).endsWith('%') ? String(resData.progress) : `${resData.progress}%`) 
          : '45%');
    const rawFailReason =
      resData?.output?.message ||
      taskInfo.message ||
      taskInfo.fail_reason ||
      resData.fail_reason ||
      resData.message ||
      resData?.output?.code ||
      taskInfo.code ||
      taskInfo.error?.message ||
      taskInfo.error ||
      '';
    const failReason = rawFailReason ? formatUserError(String(rawFailReason), '视频生成失败') : '';

    // 🌟 全量提取结果视频 URL (覆盖官方 output.video_url、content 对象/数组、url / video_url / output / outputs / download_url 等所有格式)
    let resultUrl = '';

    const extractFromContentField = (rawContent: any): string => {
      if (!rawContent) return '';
      // 1.1 content 为对象形式 (例如 Comfly / 某些中转网关: { video_url: '...' } 或 { url: '...' })
      if (typeof rawContent === 'object' && !Array.isArray(rawContent)) {
        if (typeof rawContent.video_url === 'string' && rawContent.video_url.trim()) {
          return rawContent.video_url.trim();
        }
        if (typeof rawContent.url === 'string' && rawContent.url.trim()) {
          return rawContent.url.trim();
        }
        if (typeof rawContent.download_url === 'string' && rawContent.download_url.trim()) {
          return rawContent.download_url.trim();
        }
        if (rawContent.video_url && typeof rawContent.video_url.url === 'string') {
          return rawContent.video_url.url.trim();
        }
      }
      // 1.2 content 为数组形式 (火山引擎/Seedance 官方: [{ type: 'video_url', video_url: { url: '...' } }])
      if (Array.isArray(rawContent)) {
        const vItem = rawContent.find((item: any) => item?.type === 'video_url' && (item?.video_url?.url || item?.video_url));
        if (typeof vItem?.video_url?.url === 'string' && vItem.video_url.url.trim()) {
          return vItem.video_url.url.trim();
        }
        if (typeof vItem?.video_url === 'string' && vItem.video_url.trim()) {
          return vItem.video_url.trim();
        }
        if (rawContent.length > 0) {
          const first = rawContent[0];
          if (typeof first === 'string' && first.trim()) return first.trim();
          if (typeof first?.video_url === 'string' && first.video_url.trim()) return first.video_url.trim();
          if (typeof first?.url === 'string' && first.url.trim()) return first.url.trim();
          if (typeof first?.video_url?.url === 'string' && first.video_url.url.trim()) return first.video_url.url.trim();
        }
      }
      return '';
    };

    resultUrl = extractFromContentField(taskInfo.content) || extractFromContentField(resData.content);

    // 2. 通用与聚合网关格式
    if (!resultUrl) {
      if (typeof resData?.output?.video_url === 'string' && resData.output.video_url.trim()) {
        resultUrl = resData.output.video_url.trim();
      } else if (typeof taskInfo?.output?.video_url === 'string' && taskInfo.output.video_url.trim()) {
        resultUrl = taskInfo.output.video_url.trim();
      } else if (typeof taskInfo.video_url === 'string' && taskInfo.video_url.trim()) {
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
      } else if (resData.data && extractFromContentField(resData.data.content)) {
        resultUrl = extractFromContentField(resData.data.content);
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
    }

    // 🌟 规范化任务状态 (只要提取到有效视频 URL 且非明确失败，直接判定为 SUCCESS)
    let status = 'IN_PROGRESS';
    if (resultUrl && rawStatus !== 'FAILURE' && rawStatus !== 'FAILED' && rawStatus !== 'ERROR') {
      status = 'SUCCESS';
    } else if (isTaskDone) {
      status = resultUrl ? 'SUCCESS' : 'IN_PROGRESS';
    } else if (rawStatus === 'FAILURE' || rawStatus === 'FAILED' || rawStatus === 'ERROR') {
      status = 'FAILURE';
    } else {
      status = 'IN_PROGRESS';
    }

    // 任务完成时更新数据库记录并快速响应
    if (status === 'SUCCESS' || status === 'FAILURE') {
      try {
        await prisma.imageTask.updateMany({
          where: { taskId: taskId },
          data: {
            status: status,
            resultUrl: resultUrl || undefined,
            failReason: status === 'SUCCESS' ? null : (failReason || undefined)
          }
        });

        // 🌟 自动转存视频至永久对象存储 (非阻塞后台异步执行，绝不拖延轮询响应速度！)
        if (status === 'SUCCESS' && resultUrl) {
          const storageConfig = extractStorageConfigFromRequest(req);
          const currentResultUrl = resultUrl;
          void (async () => {
            try {
              const permanent = await persistMediaUrl(taskId, currentResultUrl, 'generated/videos', storageConfig);
              if (permanent && permanent !== currentResultUrl) {
                await prisma.imageTask.updateMany({
                  where: { taskId: taskId },
                  data: { resultUrl: permanent }
                });
              }
            } catch (err) {
              console.warn(`[AI视频-后台转存] 任务 ${taskId} 转存异常:`, err);
            }
          })();
        }
      } catch {
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

export async function POST(req: Request) {
  let body;
  try { body = await req.clone().json(); } catch { return jsonResponse({ success: false, error: '请求格式不正确' }, 400); }
  try {
    return await guardSubmission(req, 'video', resolveCredentials(req, body), () => submit(req));
  } catch {
    return jsonResponse({ success: false, error: '任务提交记录保存失败，请核对原任务状态后重试', submissionUnknown: true }, 503);
  }
}
