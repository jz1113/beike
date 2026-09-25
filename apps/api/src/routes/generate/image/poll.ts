import { requireWorkspaceId } from '@beike/server-kit/workspaceContext';
import { parseImagePollPayload } from '../../../services/generate/imagePollPayload';
import { jsonResponse } from '../../../core/http';
import { db } from '../../../repositories/access';
import { persistMediaUrl, extractStorageConfigFromRequest } from '@beike/server-kit/storage';
import { persistDataUrlToStorage } from '@beike/server-kit/persistDataUrl';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { resolveCredentials, resolveImageCredentials } from '../../../services/gatewayCredentials';
import { mutableGenerationStatuses, withPersistedGenerationStatus } from '../../../services/generationTerminalState';
import { recordPollTelemetry } from '../../../services/agentTelemetry';
import { decideDirectImagePoll, decideProbeMissPoll } from '../../../services/generate/pollStatus';
import { createTaskEndpointCache, fetchProbeJson, rememberMatchedEndpoint } from '../../../services/generate/probeUpstream';

export const taskEndpointCache = createTaskEndpointCache();

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
export async function executeImagePoll(req: Request): Promise<Response> {
  const lookup = new URL(req.url);
  if (!lookup.searchParams.get('taskId') && lookup.searchParams.get('taskKey')) {
    const key = lookup.searchParams.get('taskKey')!;
    if (key.length > 1024) return jsonResponse({ status: 'QUERY_FAILED', error: '任务标识无效' }, 400);
    const record = await db.imageTask.findFirst({ where: { workspaceId: requireWorkspaceId(), idempotencyKey: key }, orderBy: { createdAt: 'desc' }, select: { taskId: true } });
    if (!record?.taskId) return jsonResponse({ status: 'QUERY_FAILED', error: '尚未找到原任务记录，请稍后核对；不会自动重新提交' }, 200);
    lookup.searchParams.set('taskId', record.taskId);
    const response = await executeImagePoll(new Request(lookup, { headers: req.headers }));
    const data = await response.json();
    return jsonResponse({ ...data, taskId: record.taskId }, response.status);
  }

  let provider: string | undefined;
  try {
    provider = new URL(resolveCredentials(req).baseUrl).hostname;
  } catch { /* ignore */ }
  return recordPollTelemetry('image-poll', req, () => withPersistedGenerationStatus(req, () => pollImageOnce(req), new URL(req.url).searchParams.get('recheck_failed') === '1'), provider);
}

async function pollImageOnce(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return jsonResponse({ success: false, error: '缺少 taskId 参数' }, 400);
  }

  // 若直接为 direct_ 开头的同步已完成任务
  if (taskId.startsWith('direct_')) {
    let record: { resultUrl: string | null; status: string | null; failReason: string | null } | null = null;
    let dbError = false;
    try {
      record = await db.imageTask.findFirst({
        where: { taskId },
        select: { resultUrl: true, status: true, failReason: true },
      });
    } catch (error) {
      dbError = true;
      console.warn('[image-poll] 查询同步任务失败:', error);
    }
    const decision = decideDirectImagePoll(taskId, record, dbError);
    return jsonResponse(decision.body, decision.httpStatus);
  }

  const task = await db.imageTask.findFirst({ where: { taskId }, select: { model: true } }).catch(() => null);
  const { baseUrl, apiKey } = resolveImageCredentials(req, { model: task?.model || undefined });
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

  // 单端点安全探测函数
  const probeUrl = async (qUrl: string) => {
    try {
      const probed = await fetchProbeJson(qUrl, apiKey, 3500);
      if (!probed) return null;
      const r = probed.response;
      const d = probed.data as Record<string, any>;

      const parsed = parseImagePollPayload(d, r.ok);
      return parsed ? { res: r, resData: d, url: qUrl } : null;

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

    rememberMatchedEndpoint(taskEndpointCache, cacheKey, cleanBaseUrl, primaryUrl, taskId);
  } else {
    // 并发请求所有候选端点，谁最先返回有效状态就采用谁
    const probePromises = candidateUrls.map((u) =>
      (u === primaryUrl ? primaryPromise : probeUrl(u)).then((result) => {
        if (result) return result;
        throw new Error('not matched');
      })
    );

    try {
      const winner = await Promise.any(probePromises);
      res = winner.res;
      resData = winner.resData;

      rememberMatchedEndpoint(taskEndpointCache, cacheKey, cleanBaseUrl, winner.url, taskId);
    } catch {
      // 所有端点均未返回有效状态（可能仍未同步或已被清理）
    }
  }

  if (!res || !resData) {
    let record: { status: string | null; resultUrl: string | null; failReason: string | null } | null = null;
    let dbError = false;
    try {
      record = await db.imageTask.findFirst({
        where: { taskId },
        select: { status: true, resultUrl: true, failReason: true },
      });
    } catch (error) {
      dbError = true;
      console.warn('[image-poll] 探测失败后回查数据库异常:', error);
    }
    const decision = decideProbeMissPoll(taskId, searchParams.get('recheck_failed') === '1' && record?.status === 'FAILURE' ? null : record, dbError);
    if (decision.body.failReason) {
      decision.body.failReason = formatUserError(decision.body.failReason, '生图任务失败');
    }
    return jsonResponse(decision.body, decision.httpStatus);
  }

  const parsed = parseImagePollPayload(resData, res.ok)!;
  let resultUrl = parsed.resultUrl;
  const status = parsed.status;
  const failReason = parsed.failReason ? formatUserError(parsed.failReason, '生图任务失败') : '';

  let temporaryUrl = false;
  if (resultUrl) {
    const upstreamUrl = resultUrl;
    resultUrl = await ensurePersistableResultUrl(resultUrl, req);
    temporaryUrl = /^https?:\/\//.test(resultUrl) && resultUrl === upstreamUrl;
  }

  const finalProgress = parsed.progress;

  // 任务状态完成时更新数据库记录
  if (status === 'SUCCESS' || status === 'FAILURE') {
    try {
      await db.imageTask.updateMany({
        where: { taskId, status: { in: [...mutableGenerationStatuses, ...(status === 'SUCCESS' && searchParams.get('recheck_failed') === '1' ? ['FAILURE'] : [])] } },
        data: {
          status,
          resultUrl: resultUrl || undefined,
          failReason: status === 'SUCCESS' ? null : failReason || undefined,
        },
      });
    } catch (error) {
      console.warn('[image-poll] 更新任务终态失败:', error);
    }
  }

  return jsonResponse({
    success: true,
    taskId,
    status,
    progress: finalProgress,
    resultUrl,
    temporaryUrl,
    failReason,
  });
}
