import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@client/store';
import { useDocumentHidden } from '@client/shared/hooks/useDocumentHidden';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { isImageTaskActive } from '@shared/domain/core/taskStatus';
import {
  SLOW_POLL_HINT,
} from '../engine/generationTaskTypes';
import {
  pollTasksOnce,
  probeFailedTasks,
  getOngoingGenerationTasks,
  getUnsubmittedGenerationTasks,
} from '../engine/generationTaskPolling';
import { submitSingleGenerationTask } from '../engine/generationTaskSubmitter';
import { getGenerationSubmissionLane } from '../engine/generationSubmissionQueue';
import { generationSubmissionQueue, setGenerationMediaConcurrency } from '../engine/generationSubmissionConfig';
import { GENERATION_CANCELLED_MESSAGE, isGenerationCancelled } from '@client/shared/api/generation/generationAbort';

export {
  isDepthVideoTask,
  isDepthImageTask,
  isVideoTask,
  getMaxPollCount,
} from '../engine/generationTaskTypes';

/**
 * 全局生图/视频任务引擎：与视图解耦，挂在 page 级即可在切页后继续提交与轮询。
 * 工坊批量生图由 useBatchWorkshopRunner 自行轮询 per-item tasks，不在此处理。
 */
// 所有批次与组件挂载共享分通道队列；最后一个引擎卸载时才中止请求。
let generationEngineUsers = 0;

export function abortActiveGenerationEngine() {
  generationSubmissionQueue.cancel();
}

export function useGenerationEngine() {
  const generationTasks = useAppStore((s) => s.generationTasks);
  const generationHistoryReady = useAppStore((s) => s.generationHistoryReady);
  const updateGenerationTask = useAppStore((s) => s.updateGenerationTask);
  const currentView = useAppStore((s) => s.currentView);
  const documentHidden = useDocumentHidden();

  // 轮询计数：任务 ID -> 已轮询次数
  const pollCountsRef = useRef<Record<string, number>>({});
  const pollFailureCountsRef = useRef<Record<string, number>>({});
  // 达到上限后转入慢速轮询的任务 ID
  const homeSlowPollIdsRef = useRef<Set<string>>(new Set());
  // 记录上一轮任务状态，用于检测重试
  const prevGenerationTaskStateRef = useRef<Map<string, { status?: string; failReason?: string }>>(new Map());
  // 避免对同一个超时失败任务反复探测
  const recoveredOnceRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    generationEngineUsers += 1;
    // Store subscriptions run synchronously, including when a task is deleted during media preparation.
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (state.generationTasks === previous.generationTasks) return;
      generationSubmissionQueue.retain(new Set(state.generationTasks.map(task => task.id)));
    });
    return () => {
      unsubscribe();
      generationEngineUsers -= 1;
      if (generationEngineUsers === 0) abortActiveGenerationEngine();
    };
  }, []);

  // 后台标签页/非生成相关页面：拉长轮询间隔，减少无谓的网络与 CPU 消耗
  const isInHubView = currentView === 'generate' || currentView === 'home';
  const isThrottled = documentHidden || !isInHubView;
  const pollIntervalFast = isThrottled ? 5000 : 2000;
  const pollIntervalSlow = isThrottled ? 12000 : 5000;
  const probeIntervalFast = isThrottled ? 12000 : 5000;
  const probeIntervalSlow = isThrottled ? 60000 : 30000;

  const unsubmittedTasksKey = useMemo(
    () =>
      generationHistoryReady ? generationTasks
        .filter((t) => isImageTaskActive(t.status) && !t.taskId && !t.resultUrl && !t.submissionRecoveryRequired)
        .map((t) => t.id)
        .join(',') : '',
    [generationTasks, generationHistoryReady],
  );

  const ongoingTasksKey = useMemo(
    () =>
      generationHistoryReady ? generationTasks
        .filter(
          (t) =>
            t.mediaType !== 'agent' &&
            !t.id.startsWith('agent-task-') &&
            isImageTaskActive(t.status) &&
            (t.taskId || t.submissionRecoveryRequired) &&
            !t.resultUrl &&
            !homeSlowPollIdsRef.current.has(t.id) &&
            t.failReason !== SLOW_POLL_HINT,
        )
        .map((t) => t.id)
        .join(',') : '',
    [generationTasks, generationHistoryReady],
  );

  const homeSlowPollTasksKey = useMemo(
    () =>
      generationHistoryReady ? generationTasks
        .filter(
          (t) =>
            t.mediaType !== 'agent' &&
            !t.id.startsWith('agent-task-') &&
            isImageTaskActive(t.status) &&
            t.taskId &&
            !t.resultUrl &&
            (homeSlowPollIdsRef.current.has(t.id) || t.failReason === SLOW_POLL_HINT),
        )
        .map((t) => t.id)
        .join(',') : '',
    [generationTasks, generationHistoryReady],
  );

  const homeTimeoutFailureKey = useMemo(
    () =>
      generationHistoryReady ? generationTasks
        .filter(
          (t) =>
            t.mediaType !== 'agent' &&
            !t.id.startsWith('agent-task-') &&
            t.status === 'FAILURE' &&
            t.taskId &&
            (!t.resultUrl || t.resultUrl.trim() === '') &&
            (t.failReason || '').includes('渲染超时'),
        )
        .map((t) => t.id)
        .join(',') : '',
    [generationTasks, generationHistoryReady],
  );

  const homeOtherFailureKey = useMemo(
    () =>
      generationHistoryReady ? generationTasks
        .filter(
          (t) =>
            t.mediaType !== 'agent' &&
            !t.id.startsWith('agent-task-') &&
            t.status === 'FAILURE' &&
            t.taskId &&
            (!t.resultUrl || t.resultUrl.trim() === '') &&
            !(t.failReason || '').includes('渲染超时'),
        )
        .map((t) => t.id)
        .join(',') : '',
    [generationTasks, generationHistoryReady],
  );

  // 重试时重置 poll 计数（FAILURE → IN_PROGRESS 且 failReason 已清空）
  useEffect(() => {
    generationTasks.forEach((t) => {
      const prev = prevGenerationTaskStateRef.current.get(t.id);
      if (prev?.status === 'FAILURE' && t.status === 'IN_PROGRESS' && !t.failReason) {
        delete pollCountsRef.current[t.id];
        delete pollFailureCountsRef.current[t.id];
        homeSlowPollIdsRef.current.delete(t.id);
        recoveredOnceRef.current.delete(t.id);
      }
      prevGenerationTaskStateRef.current.set(t.id, { status: t.status, failReason: t.failReason });
    });
  }, [generationTasks]);

  // 每批只将任务 ID 加入全局队列，真正派发时重新检查当前任务，避免提交已删除的快照。
  useEffect(() => {
    if (!unsubmittedTasksKey) return;
    const jobs = getUnsubmittedGenerationTasks().map(({ id, mediaType }) => ({
      id,
      lane: getGenerationSubmissionLane(mediaType || (id.startsWith('agent-task-') ? 'agent' : undefined)),
      run: async (signal: AbortSignal) => {
        if (!useAppStore.getState().generationHistoryReady) return;
        const task = getUnsubmittedGenerationTasks().find((t) => t.id === id);
        if (!task || signal.aborted) return;
        try {
          await submitSingleGenerationTask(
            task,
            updateGenerationTask,
            pollCountsRef.current,
            homeSlowPollIdsRef.current,
            signal,
          );
        } catch (err: unknown) {
          if (isGenerationCancelled(err, signal)) {
            updateGenerationTask(id, {
              status: 'FAILURE',
              failReason: GENERATION_CANCELLED_MESSAGE,
            });
          } else {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[generationEngine] 任务 ${id} 失败:`, message);
            updateGenerationTask(id, {
              status: 'FAILURE',
              failReason: formatUserError(err, '网络连接异常或模型接口错误'),
            });
          }
        }
      },
    }));
    const mediaCount = jobs.filter((job) => job.lane === 'media').length;
    if (mediaCount > 0) setGenerationMediaConcurrency(mediaCount);
    generationSubmissionQueue.enqueue(jobs);
  }, [unsubmittedTasksKey, updateGenerationTask]);

  // 轮询进行中 Hub 任务
  useEffect(() => {
    if (!ongoingTasksKey) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = async () => {
      if (stopped) return;
      const tasks = getOngoingGenerationTasks().filter((t) => !homeSlowPollIdsRef.current.has(t.id));
      if (tasks.length > 0) {
        await pollTasksOnce(tasks, updateGenerationTask, pollCountsRef.current, homeSlowPollIdsRef.current, {
          location: 'home',
          pollFailureCounts: pollFailureCountsRef.current,
        });
      }
      if (stopped) return;
      timer = setTimeout(() => { void schedule(); }, pollIntervalFast);
    };

    void schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [ongoingTasksKey, updateGenerationTask, pollIntervalFast]);

  // Hub 软超时任务：上一轮结束后再慢轮询
  useEffect(() => {
    if (!homeSlowPollTasksKey) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = async () => {
      if (stopped) return;
      const tasks = getOngoingGenerationTasks().filter(
        (t) => homeSlowPollIdsRef.current.has(t.id) || t.failReason === SLOW_POLL_HINT,
      );
      tasks.forEach((t) => homeSlowPollIdsRef.current.add(t.id));
      if (tasks.length > 0) {
        await pollTasksOnce(tasks, updateGenerationTask, pollCountsRef.current, homeSlowPollIdsRef.current, {
          skipTimeout: true,
          skipCountIncrement: true,
          location: 'home-slow',
          pollFailureCounts: pollFailureCountsRef.current,
        });
      }
      if (stopped) return;
      timer = setTimeout(() => { void schedule(); }, pollIntervalSlow);
    };

    void schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [homeSlowPollTasksKey, updateGenerationTask, pollIntervalSlow]);

  // 加速 recovery：「渲染超时」失败任务探测
  useEffect(() => {
    if (!homeTimeoutFailureKey) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = async () => {
      if (stopped) return;
      const timeoutTasks = useAppStore
        .getState()
        .generationTasks.filter(
          (t) =>
            t.status === 'FAILURE' &&
            t.taskId &&
            (!t.resultUrl || t.resultUrl.trim() === '') &&
            (t.failReason || '').includes('渲染超时'),
        );
      if (timeoutTasks.length > 0) {
        await probeFailedTasks(timeoutTasks, updateGenerationTask, recoveredOnceRef.current, homeSlowPollIdsRef.current);
      }
      if (stopped) return;
      timer = setTimeout(() => { void schedule(); }, probeIntervalFast);
    };

    void schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [homeTimeoutFailureKey, updateGenerationTask, probeIntervalFast]);

  // 其他 Hub 失败任务探测
  useEffect(() => {
    if (!homeOtherFailureKey) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = async () => {
      if (stopped) return;
      const failedTasks = useAppStore
        .getState()
        .generationTasks.filter(
          (t) =>
            t.status === 'FAILURE' &&
            t.taskId &&
            (!t.resultUrl || t.resultUrl.trim() === '') &&
            !(t.failReason || '').includes('渲染超时'),
        );
      if (failedTasks.length > 0) {
        await probeFailedTasks(failedTasks, updateGenerationTask, recoveredOnceRef.current, homeSlowPollIdsRef.current);
      }
      if (stopped) return;
      timer = setTimeout(() => { void schedule(); }, probeIntervalSlow);
    };

    void schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [homeOtherFailureKey, updateGenerationTask, probeIntervalSlow]);
}
