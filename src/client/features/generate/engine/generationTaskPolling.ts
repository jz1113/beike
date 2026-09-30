import { useAppStore, type GenerationTask } from '@client/store';
import { apiFetch, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import {
  isDepthVideoTask,
  isDepthImageTask,
  isVideoTask,
  getMaxPollCount,
  getGatewayBaseUrl,
  type TaskUpdater,
  SLOW_POLL_HINT,
} from './generationTaskTypes';
import { peekDepthSubmit } from '@client/shared/api/depthGeneration';
import { classifyGenerationPollResult, isTransientPollError, accumulateTransientPollFailure } from '@client/shared/api/generationErrors';
import { isImageTaskActive } from '@shared/domain/core/taskStatus';
import { GENERATION_QUERY_RETRY_HINT, SUBMISSION_RECOVERY_HINT } from '@client/shared/api/generationRecovery';

const pollingTaskIds = new Set<string>();

export async function pollTasksOnce(
  tasks: GenerationTask[],
  update: TaskUpdater,
  pollCounts: Record<string, number>,
  slowPollIds: Set<string>,
  options?: {
    skipTimeout?: boolean;
    skipCountIncrement?: boolean;
    location?: string;
    pollFailureCounts?: Record<string, number>;
  },
) {
  const noPersist = { persist: false as const };
  const localUrl = getGatewayBaseUrl();
  const gatewayHeaders = getGatewayClientHeaders();
  const pollFailureCounts = options?.pollFailureCounts || {};

  await Promise.allSettled(
    tasks.map(async (t) => {
      if (pollingTaskIds.has(t.id)) return;
      pollingTaskIds.add(t.id);
      try {
      const depthVideo = isDepthVideoTask(t);
      const video = isVideoTask(t);
      const maxCount = getMaxPollCount(t);
      const recovering = Boolean(t.submissionRecoveryRequired && !t.taskId);
      let count = pollCounts[t.id] || 0;

      if (!options?.skipCountIncrement) {
        count += 1;
        pollCounts[t.id] = count;
      }

      if (!recovering && !options?.skipTimeout && count > maxCount) {
        slowPollIds.add(t.id);
        update(
          t.id,
          {
            status: 'IN_PROGRESS',
            progress: '97%',
            failReason: SLOW_POLL_HINT,
          },
          noPersist,
        );
        return;
      }

      if (recovering) {
        update(t.id, { failReason: SUBMISSION_RECOVERY_HINT }, noPersist);
      } else if (options?.skipTimeout) {
        update(t.id, { progress: '97%', failReason: SLOW_POLL_HINT }, noPersist);
      } else {
        const dynamicProgress = Math.min(97, Math.floor(15 + (count / maxCount) * 82));
        update(t.id, { progress: `${dynamicProgress}%`, failReason: undefined }, noPersist);
      }

      try {
        const pollEndpoint = depthVideo
          ? '/api/generate/depth-video'
          : isDepthImageTask(t)
            ? '/api/generate/depth-image'
          : video
            ? '/api/generate/video'
            : '/api/generate/image';
        const queryParams = new URLSearchParams(recovering ? { taskKey: t.id, model: t.model } : { taskId: t.taskId! });

        const res = await apiFetch(`${pollEndpoint}?${queryParams.toString()}`, {
          headers: {
            ...gatewayHeaders,
            ...storageConfigHeaders(),
            ...(localUrl && !depthVideo ? { 'x-custom-base-url': localUrl } : {}),
          },
        });

        const data = await res.json().catch(() => null);
        const recoveredTaskId = recovering && typeof data?.taskId === 'string' && data.taskId ? data.taskId : undefined;
        let outcome = classifyGenerationPollResult(data, { httpOk: res.ok, httpStatus: res.status });
        // Authentication/query errors cannot prove that an unknown POST was rejected.
        if (recovering && outcome === 'failure' && !recoveredTaskId && data?.submissionRejected !== true) outcome = 'pending';
        const recoveredLink = recovering ? {
          ...(recoveredTaskId ? { taskId: recoveredTaskId, submissionRecoveryRequired: false } : {}),
          ...(typeof data?.recordId === 'string' ? { dbId: data.recordId } : {}),
          ...(typeof data?.model === 'string' ? { model: data.model } : {}),
        } : {};

        if (outcome === 'success') {
          slowPollIds.delete(t.id);
          delete pollCounts[t.id];
          delete pollFailureCounts[t.id];
          update(t.id, {
            status: 'SUCCESS',
            resultUrl: data.resultUrl,
            progress: '100%',
            failReason: undefined,
            submissionRecoveryRequired: false,
            ...recoveredLink,
          });
        } else if (outcome === 'failure') {
          slowPollIds.delete(t.id);
          delete pollCounts[t.id];
          delete pollFailureCounts[t.id];
          update(t.id, {
            status: 'FAILURE',
            progress: '0%',
            failReason: data?.failReason || data?.error || (depthVideo ? '深度动作捕捉生成失败' : '模型渲染失败'),
            submissionRecoveryRequired: false,
            ...recoveredLink,
          });
        } else {
          delete pollFailureCounts[t.id];
          if (recoveredTaskId) {
            delete pollCounts[t.id];
            update(t.id, { ...recoveredLink, failReason: undefined });
          } else if (recovering || !res.ok || data?.retryable === true || data?.status === 'QUERY_FAILED') {
            update(t.id, { failReason: recovering ? SUBMISSION_RECOVERY_HINT : GENERATION_QUERY_RETRY_HINT }, noPersist);
          } else if (depthVideo && data?.progress) {
            update(t.id, { progress: String(data.progress) }, noPersist);
          }
        }
      } catch (e) {
        if (recovering) {
          update(t.id, { failReason: SUBMISSION_RECOVERY_HINT }, noPersist);
          return;
        }
        if (!isTransientPollError(e)) {
          slowPollIds.delete(t.id);
          delete pollCounts[t.id];
          delete pollFailureCounts[t.id];
          update(t.id, {
            status: 'FAILURE',
            progress: '0%',
            failReason: e instanceof Error ? e.message : (depthVideo ? '深度动作捕捉生成失败' : '模型渲染失败'),
          });
          return;
        }
        const failuresFatal = accumulateTransientPollFailure(pollFailureCounts, t.id);
        console.warn(`[generationEngine] 轮询任务 ${t.id} 失败 (${options?.location || 'poll'}):`, e);
        if (failuresFatal) {
          update(t.id, {
            failReason: GENERATION_QUERY_RETRY_HINT,
          }, noPersist);
        }
      }
      } finally { pollingTaskIds.delete(t.id); }
    }),
  );
}

export function getOngoingGenerationTasks(): GenerationTask[] {
  return useAppStore
    .getState()
    .generationTasks.filter((t) => isImageTaskActive(t.status) && (t.taskId || t.submissionRecoveryRequired) && !t.resultUrl);
}

export function isLocalUnsubmittedTask(t: GenerationTask): boolean {
  if (t.submissionRecoveryRequired || !isImageTaskActive(t.status) || t.taskId || t.resultUrl) return false;
  // A refreshed local depth task restores its exact File asynchronously in the submitter.
  if (isDepthImageTask(t) || isDepthVideoTask(t)) {
    return !t.dbId || t.id.startsWith('hub-gen-') || Boolean(peekDepthSubmit(t.id));
  }

  // 排除来自数据库历史同步的常规图文任务，绝不自动重新提交
  if (t.dbId && !t.id.startsWith('hub-gen-')) return false;

  return true;
}

export function getUnsubmittedGenerationTasks(): GenerationTask[] {
  return useAppStore.getState().generationTasks.filter(isLocalUnsubmittedTask);
}

export async function probeFailedTasks(
  tasks: GenerationTask[],
  update: TaskUpdater,
  recoveredOnce: Set<string>,
  slowPollIds: Set<string>,
) {
  const localUrl = getGatewayBaseUrl();
  const gatewayHeaders = getGatewayClientHeaders();

  await Promise.allSettled(
    tasks.map(async (t) => {
      if (recoveredOnce.has(t.id)) return;
      try {
        const depthVideo = isDepthVideoTask(t);
        const video = isVideoTask(t);
        const pollEndpoint = depthVideo
          ? '/api/generate/depth-video'
          : video
            ? '/api/generate/video'
            : '/api/generate/image';
        const queryParams = new URLSearchParams({ taskId: t.taskId! });

        const res = await apiFetch(`${pollEndpoint}?${queryParams.toString()}`, {
          headers: {
            ...gatewayHeaders,
            ...storageConfigHeaders(),
            ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
          },
        }).catch(() => null);

        if (!res) return;
        const data = await res.json().catch(() => null);
        if (classifyGenerationPollResult(data, { httpOk: res.ok, httpStatus: res.status }) === 'success') {
          recoveredOnce.add(t.id);
          slowPollIds.delete(t.id);
          update(t.id, {
            status: 'SUCCESS',
            resultUrl: data.resultUrl,
            progress: '100%',
            failReason: undefined,
          });
        }
      } catch {
        /* ignore */
      }
    }),
  );
}
