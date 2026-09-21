import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@/store';
import { useDocumentHidden } from '@/shared/hooks/useDocumentHidden';
import { useAssetTasksQuery } from '@/shared/hooks/useAssetTasksQuery';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { isImageTaskActive } from '@beike/domain/taskStatus';
import {
  SLOW_POLL_HINT,
} from './engine/generationTaskTypes';
import {
  pollTasksOnce,
  probeFailedTasks,
  getOngoingGenerationTasks,
  getUnsubmittedGenerationTasks,
} from './engine/generationTaskPolling';
import { submitSingleGenerationTask } from './engine/generationTaskSubmitter';
import { GENERATION_CANCELLED_MESSAGE, isGenerationCancelled } from '@/shared/api/generationAbort';

export {
  isDepthVideoTask,
  isDepthImageTask,
  isVideoTask,
  getMaxPollCount,
} from './engine/generationTaskTypes';

/**
 * 全局生图/视频任务引擎：与视图解耦，挂在 page 级即可在切页后继续提交与轮询。
 * 工坊批量生图由 useBatchWorkshopRunner 自行轮询 per-item tasks，不在此处理。
 */
// 模块级提交单飞锁：跨组件生命周期与重渲染严格持久化，同一个任务 ID 绝不发起并发/重复提交
const globalSubmittingTaskIds = new Set<string>();
const engineAbortControllers = new Map<string, AbortController>();

export function abortActiveGenerationEngine() {
  for (const controller of engineAbortControllers.values()) {
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  }
  engineAbortControllers.clear();
  globalSubmittingTaskIds.clear();
}

export function useGenerationEngine() {
  const generationTasks = useAppStore((s) => s.generationTasks);
  const updateGenerationTask = useAppStore((s) => s.updateGenerationTask);
  const currentView = useAppStore((s) => s.currentView);
  const documentHidden = useDocumentHidden();

  // 轮询计数：任务 ID -> 已轮询次数
  const pollCountsRef = useRef<Record<string, number>>({});
  const pollFailureCountsRef = useRef<Record<string, number>>({});
  // 达到上限后转入慢速轮询的任务 ID
  const homeSlowPollIdsRef = useRef<Set<string>>(new Set());
  // 提交锁：防止并发触发重复网络请求 (与 globalSubmittingTaskIds 协同)
  const submittingTaskIdsRef = useRef<Set<string>>(globalSubmittingTaskIds);
  // 活跃 AbortController：组件彻底卸载时安全释放
  const activeAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  // 记录上一轮任务状态，用于检测重试
  const prevGenerationTaskStateRef = useRef<Map<string, { status?: string; failReason?: string }>>(new Map());
  // 避免对同一个超时失败任务反复探测
  const recoveredOnceRef = useRef<Set<string>>(new Set());

  useEffect(() => () => abortActiveGenerationEngine(), []);

  // 后台标签页/非生成相关页面：拉长轮询间隔，减少无谓的网络与 CPU 消耗
  const isInHubView = currentView === 'generate' || currentView === 'home';
  const isThrottled = documentHidden || !isInHubView;
  const pollIntervalFast = isThrottled ? 5000 : 2000;
  const pollIntervalSlow = isThrottled ? 12000 : 5000;
  const probeIntervalFast = isThrottled ? 12000 : 5000;
  const probeIntervalSlow = isThrottled ? 60000 : 30000;

  // 挂载资产中心轻量任务轮询
  useAssetTasksQuery();

  const unsubmittedTasksKey = useMemo(
    () =>
      generationTasks
        .filter((t) => isImageTaskActive(t.status) && !t.taskId && !t.resultUrl)
        .map((t) => t.id)
        .join(','),
    [generationTasks],
  );

  const ongoingTasksKey = useMemo(
    () =>
      generationTasks
        .filter(
          (t) =>
            isImageTaskActive(t.status) &&
            t.taskId &&
            !t.resultUrl &&
            !homeSlowPollIdsRef.current.has(t.id) &&
            t.failReason !== SLOW_POLL_HINT,
        )
        .map((t) => t.id)
        .join(','),
    [generationTasks],
  );

  const homeSlowPollTasksKey = useMemo(
    () =>
      generationTasks
        .filter(
          (t) =>
            isImageTaskActive(t.status) &&
            t.taskId &&
            !t.resultUrl &&
            (homeSlowPollIdsRef.current.has(t.id) || t.failReason === SLOW_POLL_HINT),
        )
        .map((t) => t.id)
        .join(','),
    [generationTasks],
  );

  const homeTimeoutFailureKey = useMemo(
    () =>
      generationTasks
        .filter(
          (t) =>
            t.status === 'FAILURE' &&
            t.taskId &&
            (!t.resultUrl || t.resultUrl.trim() === '') &&
            (t.failReason || '').includes('渲染超时'),
        )
        .map((t) => t.id)
        .join(','),
    [generationTasks],
  );

  const homeOtherFailureKey = useMemo(
    () =>
      generationTasks
        .filter(
          (t) =>
            t.status === 'FAILURE' &&
            t.taskId &&
            (!t.resultUrl || t.resultUrl.trim() === '') &&
            !(t.failReason || '').includes('渲染超时'),
        )
        .map((t) => t.id)
        .join(','),
    [generationTasks],
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

  // 提交未发送的任务（并发调度队列，带 AbortController 安全保障）
  useEffect(() => {
    if (!unsubmittedTasksKey) return;

    const unsubmittedTasks = getUnsubmittedGenerationTasks();
    if (unsubmittedTasks.length === 0) return;

    const submittedIds: string[] = [];
    let isCancelled = false;

    const processQueue = async () => {
      const tasksToSubmit = unsubmittedTasks.filter(
        (t) => !submittingTaskIdsRef.current.has(t.id),
      );
      if (tasksToSubmit.length === 0) return;

      tasksToSubmit.forEach((t) => {
        submittingTaskIdsRef.current.add(t.id);
        globalSubmittingTaskIds.add(t.id);
        submittedIds.push(t.id);
      });

      await Promise.allSettled(
        tasksToSubmit.map(async (t) => {
          const ctrl = new AbortController();
          activeAbortControllersRef.current.set(t.id, ctrl);
          engineAbortControllers.set(t.id, ctrl);
          try {
            await submitSingleGenerationTask(
              t,
              updateGenerationTask,
              pollCountsRef.current,
              homeSlowPollIdsRef.current,
              ctrl.signal,
            );
          } catch (err: unknown) {
            if (isGenerationCancelled(err, ctrl.signal)) {
              if (isCancelled) return;
              updateGenerationTask(t.id, {
                status: 'FAILURE',
                failReason: GENERATION_CANCELLED_MESSAGE,
              });
              return;
            }
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[generationEngine] 任务 ${t.id} 失败:`, message);
            updateGenerationTask(t.id, {
              status: 'FAILURE',
              failReason: formatUserError(err, '网络连接异常或模型接口错误'),
            });
          } finally {
            submittingTaskIdsRef.current.delete(t.id);
            globalSubmittingTaskIds.delete(t.id);
            activeAbortControllersRef.current.delete(t.id);
            engineAbortControllers.delete(t.id);
          }
        }),
      );
    };

    void processQueue();

    return () => {
      isCancelled = true;
      submittedIds.forEach((id) => {
        const ctrl = activeAbortControllersRef.current.get(id);
        if (ctrl && !ctrl.signal.aborted) ctrl.abort();
      });
    };
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
