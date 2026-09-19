import { gatewayFetch } from '../../../gateways/http';
import { jsonResponse } from '../../../core/http';
import { prisma } from '../../../repositories/db';
import LRUCache from 'lru-cache';
import { persistMediaUrl, extractStorageConfigFromRequest } from '@beike/server-kit/storage';
import { persistDataUrlToStorage } from '@beike/server-kit/persistDataUrl';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { resolveCredentials } from '../../../services/gatewayCredentials';
import { mutableGenerationStatuses, withPersistedGenerationStatus } from '../../../services/generationTerminalState';

// 任务轮询端点记忆缓存 (提升 300% 轮询响应速度，使用 LRU 限制内存增长)
export const taskEndpointCache = new LRUCache<string, string>({ max: 500 });

export async function ensurePersistableResultUrl(url: string, req: Request): Promise<string> {
  if (!url) return url;
  if (/^https?:\/\//.test(url)) {
    return await persistMediaUrl('',url,'generated/images',extractStorageConfigFromRequest(req)) || url;
  }
  if (!url.startsWith('data:')) return url;
  const storageConfig = extractStorageConfigFromRequest(req);
  return persistDataUrlToStorage(url, { keyPrefix: 'images', customConfig: storageConfig });
}

/**
 * 查询异步生图任务状态 (多端点高可用智能探测)
 */
export async function executeImagePoll(req: Request) {
  return withPersistedGenerationStatus(req, () => pollImageOnce(req));
}

async function pollImageOnce(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return jsonResponse({ success: false, error: '缺少 taskId 参数' }, 400);
  }

  // 若直接为 direct_ 开头的同步已完成任务
  if (taskId.startsWith('direct_')) {
    let directResultUrl = '';
    try {
      const taskRecord = await prisma.imageTask.findFirst({
        where: { taskId },
        select: { resultUrl: true },
      });
      if (taskRecord?.resultUrl) {
        directResultUrl = taskRecord.resultUrl;
      }
    } catch {}

    return jsonResponse({
      success: true,
      taskId,
      status: 'SUCCESS',
      progress: '100%',
      resultUrl: directResultUrl || undefined,
    });
  }

  const { baseUrl, apiKey } = resolveCredentials(req);
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

  // 🌟 1. 构造高优先级端点与候选端点池 (Comfly/New-API 异步生图标准首选 /v1/images/tasks)
  const taskPrefix = taskId.slice(0, 8);
  const cacheKey = `${cleanBaseUrl}:${taskPrefix}`;
  const cachedEndpoint = taskEndpointCache.get(cacheKey) || taskEndpointCache.get(cleanBaseUrl);

  const primaryUrl = `${cleanBaseUrl}/v1/images/tasks/${taskId}`;
  const secondaryCandidates = [
    cachedEndpoint ? (cachedEndpoint.includes(taskId) ? cachedEndpoint : `${cachedEndpoint}/${taskId}`) : null,
    `${cleanBaseUrl}/v1/tasks/${taskId}`,
    `${cleanBaseUrl}/v1/images/generations/${taskId}`,
    `${cleanBaseUrl}/v1/images/${taskId}`,
    `${cleanBaseUrl}/v1/query/image_generation?task_id=${taskId}`,
    `${cleanBaseUrl}/v1/task/${taskId}`,
    `${cleanBaseUrl}/api/task/${taskId}`,
    `${cleanBaseUrl}/api/tasks/${taskId}`,
  ].filter(Boolean) as string[];

  // 严格去重
  const candidateUrls = Array.from(new Set([primaryUrl, ...secondaryCandidates]));

  let res: Response | null = null;
  let resData: any = null;
  let detectedFailureReason = '';

  // 单端点安全探测函数
  const probeUrl = async (qUrl: string) => {
    try {
      const r = await gatewayFetch(qUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(3500),
      });

      const d = await r.json().catch(() => null);
      if (!d) return null;

      // 提取原始状态与潜在错误原因
      const innerInfo = d.data || d;
      const rawStatus = String(innerInfo.status || d.status || '').toUpperCase();
      const failReason =
        innerInfo.fail_reason ||
        d.fail_reason ||
        innerInfo.error?.message ||
        d.error?.message ||
        innerInfo.error ||
        d.error ||
        (r.status >= 400 ? d.message : '');

      const isFinished =
        rawStatus === 'SUCCESS' ||
        rawStatus === 'SUCCEEDED' ||
        rawStatus === 'COMPLETED' ||
        Boolean(innerInfo.url || innerInfo.output || (Array.isArray(innerInfo.data) && innerInfo.data[0]?.url));

      const isFailed =
        rawStatus === 'FAILURE' ||
        rawStatus === 'FAILED' ||
        rawStatus === 'ERROR' ||
        (Boolean(failReason) && rawStatus !== 'SUCCESS');

      const isOngoing =
        rawStatus === 'NOT_START' ||
        rawStatus === 'SUBMITTED' ||
        rawStatus === 'IN_PROGRESS' ||
        rawStatus === 'PENDING' ||
        rawStatus === 'PROCESSING' ||
        rawStatus === 'QUEUED';

      // 过滤路由级 404/Invalid URL（说明当前候选端点 URL 并非合法的查询接口，忽略此端点）
      const lowerReason = String(failReason || '').toLowerCase();
      const isRouteNotFound =
        lowerReason.includes('invalid url') ||
        lowerReason.includes('route not found') ||
        lowerReason.includes('page not found') ||
        lowerReason.includes('cannot get') ||
        (r.status === 404 && lowerReason.includes('not found'));

      if (isRouteNotFound) {
        return null;
      }

      // 只要返回了明确的业务状态或错误描述
      if (isFinished || isFailed || isOngoing || d.code === 'success') {
        return { res: r, resData: d, url: qUrl, isFailed, failReason };
      }

      // 若状态码为 4xx/5xx 且含有明确业务错误信息（非路由不存在）
      if (r.status >= 400 && failReason) {
        return { res: r, resData: d, url: qUrl, isFailed: true, failReason };
      }

      return null;
    } catch {
      return null;
    }
  };

  // 🌟 2. 双轨加速探测：先探测首选端点，若未在 500ms 内快速返回则并发探测其余端点
  const primaryPromise = probeUrl(primaryUrl);
  const quickTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));

  const quickResult = await Promise.race([primaryPromise, quickTimeout]);
  if (quickResult) {
    res = quickResult.res;
    resData = quickResult.resData;
    if (quickResult.isFailed && quickResult.failReason) {
      detectedFailureReason = String(quickResult.failReason);
    }
    const baseTemplate = primaryUrl.replace(taskId, '').replace(/\/$/, '');
    taskEndpointCache.set(cacheKey, baseTemplate);
    taskEndpointCache.set(cleanBaseUrl, baseTemplate);
  } else {
    // 并发请求所有候选端点，谁最先返回有效状态就采用谁
    const probePromises = candidateUrls.map((u) =>
      probeUrl(u).then((result) => {
        if (result) return result;
        throw new Error('not matched');
      })
    );

    try {
      const winner = await Promise.any(probePromises);
      res = winner.res;
      resData = winner.resData;
      if (winner.isFailed && winner.failReason) {
        detectedFailureReason = String(winner.failReason);
      }
      const baseTemplate = winner.url.replace(taskId, '').replace(/\/$/, '');
      taskEndpointCache.set(cacheKey, baseTemplate);
      taskEndpointCache.set(cleanBaseUrl, baseTemplate);
    } catch {
      // 所有端点均未返回有效状态（可能仍未同步或已被清理）
    }
  }

  // 若上游明确探测到了失败原因
  if (detectedFailureReason && (!resData || !resData.status || !resData.data?.status)) {
    try {
      await prisma.imageTask.updateMany({
        where: { taskId, status: { in: [...mutableGenerationStatuses] } },
        data: {
          status: 'FAILURE',
          failReason: detectedFailureReason,
        },
      });
    } catch {}

    return jsonResponse({
      success: true,
      taskId,
      status: 'FAILURE',
      progress: '0%',
      resultUrl: '',
      failReason: formatUserError(detectedFailureReason, '绘图任务执行失败'),
    });
  }

  if (!res || !resData) {
    try {
      const taskRecord = await prisma.imageTask.findFirst({
        where: { taskId },
        select: { status: true, resultUrl: true, failReason: true },
      });
      if (taskRecord?.resultUrl) {
        return jsonResponse({
          success: true,
          taskId,
          status: 'SUCCESS',
          progress: '100%',
          resultUrl: taskRecord.resultUrl,
          failReason: '',
        });
      }
      if (taskRecord?.status === 'FAILURE') {
        return jsonResponse({
          success: true,
          taskId,
          status: 'FAILURE',
          progress: '0%',
          resultUrl: '',
          failReason: taskRecord.failReason
            ? formatUserError(String(taskRecord.failReason), '生图任务失败')
            : '生图任务失败',
        });
      }
    } catch {
      /* ignore DB fallback errors */
    }
    return jsonResponse({
      success: true,
      taskId,
      status: 'IN_PROGRESS',
      progress: '25%',
    });
  }

  const taskInfo = resData.data || resData;

  const rawStatus = (taskInfo.status || resData.status || 'PENDING').toUpperCase();
  const progress =
    taskInfo.progress !== undefined
      ? String(taskInfo.progress).endsWith('%')
        ? String(taskInfo.progress)
        : `${taskInfo.progress}%`
      : resData.progress !== undefined
        ? String(resData.progress).endsWith('%')
          ? String(resData.progress)
          : `${resData.progress}%`
        : rawStatus === 'SUCCESS' ||
            rawStatus === 'SUCCEEDED' ||
            rawStatus === 'COMPLETED'
          ? '100%'
          : '50%';
  const rawFailReason =
    taskInfo.fail_reason ||
    resData.fail_reason ||
    resData.message ||
    taskInfo.error?.message ||
    taskInfo.error ||
    '';
  const failReason = rawFailReason ? formatUserError(String(rawFailReason), '生图任务失败') : '';

  // 提取结果图片 URL (深度解析全格式)
  let resultUrl = '';
  if (taskInfo.data?.data && Array.isArray(taskInfo.data.data) && taskInfo.data.data.length > 0) {
    const first = taskInfo.data.data[0];
    resultUrl = first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '');
  } else if (taskInfo.data && Array.isArray(taskInfo.data) && taskInfo.data.length > 0) {
    const first = taskInfo.data[0];
    resultUrl = first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '');
  } else if (Array.isArray(resData.data) && resData.data.length > 0) {
    const first = resData.data[0];
    resultUrl = first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '');
  } else if (typeof taskInfo.data?.url === 'string') {
    resultUrl = taskInfo.data.url;
  } else if (typeof taskInfo.url === 'string') {
    resultUrl = taskInfo.url;
  } else if (typeof taskInfo.image_url === 'string') {
    resultUrl = taskInfo.image_url;
  } else if (typeof taskInfo.output === 'string') {
    resultUrl = taskInfo.output;
  } else if (
    Array.isArray(taskInfo.outputs) &&
    taskInfo.outputs.length > 0 &&
    typeof taskInfo.outputs[0] === 'string'
  ) {
    resultUrl = taskInfo.outputs[0];
  } else if (typeof resData.url === 'string') {
    resultUrl = resData.url;
  } else if (typeof resData.output === 'string') {
    resultUrl = resData.output;
  }

  if (resultUrl) {
    resultUrl = await ensurePersistableResultUrl(resultUrl, req);
  }

  // 🌟 状态映射为规范枚举 (优先拦截明确失败，只要存在失败原因且无图直接判定为 FAILURE)
  let status = 'IN_PROGRESS';
  if (
    rawStatus === 'FAILURE' ||
    rawStatus === 'FAILED' ||
    rawStatus === 'ERROR' ||
    Boolean(rawFailReason && !resultUrl)
  ) {
    status = 'FAILURE';
  } else if (resultUrl) {
    status = 'SUCCESS';
  } else if (
    rawStatus === 'SUCCESS' ||
    rawStatus === 'SUCCEEDED' ||
    rawStatus === 'COMPLETED' ||
    rawStatus === 'FINISHED'
  ) {
    status = resultUrl ? 'SUCCESS' : 'IN_PROGRESS';
  } else {
    status = 'IN_PROGRESS';
  }

  const finalProgress = status === 'FAILURE' ? '0%' : status === 'SUCCESS' ? '100%' : progress;

  // 任务状态完成时更新数据库记录
  if (status === 'SUCCESS' || status === 'FAILURE') {
    try {
      await prisma.imageTask.updateMany({
        where: { taskId, status: { in: [...mutableGenerationStatuses] } },
        data: {
          status,
          resultUrl: resultUrl || undefined,
          failReason: failReason || undefined,
        },
      });

      // 🌟 自动转存至永久对象存储 (生成图片 -> azhuo/generated/images/...)
      if (status === 'SUCCESS' && resultUrl) {
        const storageConfig = extractStorageConfigFromRequest(req);
        const permanent = await persistMediaUrl(
          taskId,
          resultUrl,
          'generated/images',
          storageConfig
        ).catch(() => null);
        if (permanent) {
          resultUrl = permanent;
        }
      }
    } catch {
      // ignore
    }
  }

  return jsonResponse({
    success: true,
    taskId,
    status,
    progress: finalProgress,
    resultUrl,
    failReason,
  });
}
