import { useAppStore, type GenerationTask } from '@/store';
import { apiFetch } from '@/shared/api/apiClient';
import { getGatewayClientHeaders } from '@/shared/api/gatewayClient';
import {
  isDepthVideoTask,
  isDepthImageTask,
  isVideoTask,
  getMaxPollCount,
  getGatewayBaseUrl,
  type TaskUpdater,
  SLOW_POLL_HINT,
} from './generationTaskTypes';
import { peekDepthSubmit } from '@/shared/api/depthGeneration';

const pollingTaskIds = new Set<string>();

export async function pollTasksOnce(
  tasks: GenerationTask[],
  update: TaskUpdater,
  pollCounts: Record<string, number>,
  slowPollIds: Set<string>,
  options?: { skipTimeout?: boolean; skipCountIncrement?: boolean; location?: string },
) {
  const noPersist = { persist: false as const };
  const localUrl = getGatewayBaseUrl();
  const gatewayHeaders = getGatewayClientHeaders();

  await Promise.allSettled(
    tasks.map(async (t) => {
      if (pollingTaskIds.has(t.id)) return;
      pollingTaskIds.add(t.id);
      try {
      const depthVideo = isDepthVideoTask(t);
      const video = isVideoTask(t);
      const maxCount = getMaxPollCount(t);
      let count = pollCounts[t.id] || 0;

      if (!options?.skipCountIncrement) {
        count += 1;
        pollCounts[t.id] = count;
      }

      if (!options?.skipTimeout && count > maxCount) {
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

      if (options?.skipTimeout) {
        update(t.id, { progress: '97%', failReason: SLOW_POLL_HINT }, noPersist);
      } else {
        const dynamicProgress = Math.min(97, Math.floor(15 + (count / maxCount) * 82));
        update(t.id, { progress: `${dynamicProgress}%`, failReason: undefined }, noPersist);
      }

      try {
        const pollEndpoint = depthVideo
          ? '/api/generate/depth-video'
          : video
            ? '/api/generate/video'
            : '/api/generate/image';
        const queryParams = new URLSearchParams({ taskId: t.taskId! });

        const res = await apiFetch(`${pollEndpoint}?${queryParams.toString()}`, {
          headers: {
            ...gatewayHeaders,
            ...(localUrl && !depthVideo ? { 'x-custom-base-url': localUrl } : {}),
          },
        }).catch(() => null);

        if (res) {
          const data = await res.json().catch(() => null);
          const rawStatus = String(data?.status || '').toUpperCase();
          const isSuccess = (rawStatus === 'SUCCESS' || Boolean(data?.resultUrl)) && Boolean(data?.resultUrl);
          const isFailure =
            rawStatus === 'FAILURE' ||
            rawStatus === 'FAILED' ||
            rawStatus === 'ERROR' ||
            (!res.ok && Boolean(data?.error)) ||
            (Boolean(data?.failReason) && !data?.resultUrl && rawStatus !== 'IN_PROGRESS' && rawStatus !== 'PENDING' && rawStatus !== 'PROCESSING');

          if (isSuccess) {
            slowPollIds.delete(t.id);
            delete pollCounts[t.id];
            update(t.id, {
              status: 'SUCCESS',
              resultUrl: data.resultUrl,
              progress: '100%',
              failReason: undefined,
            });
          } else if (isFailure) {
            slowPollIds.delete(t.id);
            delete pollCounts[t.id];
            update(t.id, {
              status: 'FAILURE',
              progress: '0%',
              failReason: data?.failReason || data?.error || (depthVideo ? '深度动作捕捉生成失败' : '模型渲染失败'),
            });
          } else if (depthVideo && data?.progress) {
            update(t.id, { progress: String(data.progress) }, noPersist);
          }
        }
      } catch (e) {
        console.warn(`[generationEngine] 轮询任务 ${t.id} 失败 (${options?.location || 'poll'}):`, e);
      }
      } finally { pollingTaskIds.delete(t.id); }
    }),
  );
}

export function getOngoingGenerationTasks(): GenerationTask[] {
  return useAppStore
    .getState()
    .generationTasks.filter((t) => t.status === 'IN_PROGRESS' && t.taskId && !t.resultUrl);
}

export function isLocalUnsubmittedTask(t: GenerationTask): boolean {
  // 深度生成任务：若在当前会话内存中持有有效待提交载荷，无论历史是否存在 dbId 都允许提交
  if (isDepthImageTask(t) || isDepthVideoTask(t)) {
    if (peekDepthSubmit(t.id)) {
      return (
        (t.status === 'IN_PROGRESS' || t.status === 'IDLE' || !t.status) &&
        !t.taskId &&
        !t.resultUrl
      );
    }
    return false;
  }

  // 排除来自数据库历史同步的常规图文任务，绝不自动重新提交
  if (t.dbId && !t.id.startsWith('hub-gen-')) return false;

  return (
    (t.status === 'IN_PROGRESS' || t.status === 'IDLE' || !t.status) &&
    !t.taskId &&
    !t.resultUrl
  );
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
            ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
          },
        }).catch(() => null);

        if (res && res.ok) {
          const data = await res.json().catch(() => null);
          if ((data?.status === 'SUCCESS' || Boolean(data?.resultUrl)) && data?.resultUrl) {
            recoveredOnce.add(t.id);
            slowPollIds.delete(t.id);
            update(t.id, {
              status: 'SUCCESS',
              resultUrl: data.resultUrl,
              progress: '100%',
              failReason: undefined,
            });
          }
        }
      } catch {
        /* ignore */
      }
    }),
  );
}
