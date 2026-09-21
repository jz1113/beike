import { jsonResponse } from '../../core/http';
import { prisma } from '../../repositories/db';
import { persistMediaUrl, extractStorageConfigFromRequest } from '@beike/server-kit/storage';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { resolveCredentials } from '../gatewayCredentials';
import { videoTaskEndpointCache } from './videoGenerationTypes';
import { mutableGenerationStatuses, withPersistedGenerationStatus } from '../generationTerminalState';
import { recordPollTelemetry } from '../agentTelemetry';
import { decideProbeMissPoll } from './pollStatus';
import { probeUpstreamTask, rememberMatchedEndpoint } from './probeUpstream';

/**
 * GET /api/generate/video?taskId={taskId}
 * 轮询查询异步视频任务状态 (严格支持 /seedance/v3/... 与 /v1/videos/:id 与 /v2/videos/generations/:id 各类返回载荷)
 */
export async function GET(req: Request) {
  let provider: string | undefined;
  try {
    provider = new URL(resolveCredentials(req).baseUrl).hostname;
  } catch { /* ignore */ }
  return recordPollTelemetry('video-poll', req, () => withPersistedGenerationStatus(req, () => pollVideoOnce(req)), provider);
}

async function pollVideoOnce(req: Request) {
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

    const probed = await probeUpstreamTask({
      urls: queryUrls,
      apiKey,
      timeoutMs: isCgtTask ? 3500 : 5000,
      isValid: (data, response) => {
        if (!response.ok || !data || typeof data !== 'object') return false;
        const d = data as Record<string, any>;
        return Boolean(
          d.status ||
          d.data?.status ||
          d.output?.task_status ||
          d.video_url ||
          d.url ||
          d.data?.output ||
          d.output ||
          d.data?.data ||
          d.content,
        );
      },
    });
    if (probed) {
      res = probed.response;
      resData = probed.data;
      rememberMatchedEndpoint(videoTaskEndpointCache, cacheKey, baseUrl, probed.url, taskId);
    }

    if (!res || !res.ok || !resData) {
      let record: { status: string | null; resultUrl: string | null; failReason: string | null } | null = null;
      let dbError = false;
      try {
        record = await prisma.imageTask.findFirst({
          where: { taskId },
          select: { status: true, resultUrl: true, failReason: true },
        });
      } catch (error) {
        dbError = true;
        console.warn('[AI视频-轮询] 探测失败后回查数据库异常:', error);
      }
      const decision = decideProbeMissPoll(taskId, record, dbError, 'video');
      console.warn(`[AI视频-轮询] 查询任务 ${taskId} 状态暂未就绪: ${decision.body.status}`);
      return jsonResponse(decision.body, decision.httpStatus);
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
          where: { taskId: taskId, status: { in: [...mutableGenerationStatuses] } },
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
      } catch (error) {
        console.warn(`[AI视频-轮询] 更新任务终态失败:`, error);
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

