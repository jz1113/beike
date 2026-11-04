import { useCallback, useEffect, useRef } from 'react';
import { pollSalesVideoTask, type SalesVideoTaskReceipt } from '../api/salesVideoPolling';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import type { useSalesProductionTask } from './useSalesProductionTask';

interface RecoveryOptions {
  plan: SalesProductionPlanState;
  sourceKey?: string;
  ready: boolean;
  busy: string;
  patchPlan: (patch: Partial<SalesProductionPlanState>) => void;
  runTask: ReturnType<typeof useSalesProductionTask>['runTask'];
  onRecovered?: () => void;
}

/** Reconnect saved receipts once, without submitting another paid generation. */
export function useSalesVideoRecovery({ plan, sourceKey, ready, busy, patchPlan, runTask, onRecovered }: RecoveryOptions) {
  const attempted = useRef(new Set<string>());
  const latest = useRef({ plan, sourceKey, patchPlan, onRecovered });
  latest.current = { plan, sourceKey, patchPlan, onRecovered };

  const rememberVideoTask = useCallback((receipt: SalesVideoTaskReceipt) => {
    if (!sourceKey || sourceKey !== latest.current.sourceKey) return;
    patchPlan({ pendingVideoTask: { ...receipt, sourceKey } });
  }, [patchPlan, sourceKey]);

  const pending = plan.pendingVideoTask;
  useEffect(() => {
    if (!pending || !sourceKey || pending.sourceKey !== sourceKey || plan.generatedVideoUrl) return;
    const key = JSON.stringify([pending.taskId, pending.model, pending.modelSelection, pending.sourceKey]);
    // A task already being watched by the submitter must stay stopped after cancel or a permanent query error.
    if (busy === 'video') { attempted.current.add(key); return; }
    if (!ready || busy || attempted.current.has(key)) return;
    let stopped = false;
    // StrictMode replays effects before this microtask; only the surviving setup starts a request.
    void Promise.resolve().then(async () => {
      if (stopped || attempted.current.has(key)) return;
      attempted.current.add(key);
      const result = await runTask('video', '正在恢复已提交的视频任务…', (signal, progress) =>
        pollSalesVideoTask(pending, progress, signal, rememberVideoTask));
      const current = latest.current;
      if (!result || current.sourceKey !== pending.sourceKey || current.plan.pendingVideoTask?.taskId !== pending.taskId) return;
      current.patchPlan({ generatedVideoUrl: result.videoUrl, generatedVideoTaskId: result.channelTaskId || pending.channelTaskId || result.taskId, mixedVideoUrl: '', pendingVideoTask: null });
      current.onRecovered?.();
    });
    return () => { stopped = true; };
  }, [busy, pending, plan.generatedVideoUrl, ready, rememberVideoTask, runTask, sourceKey]);

  return { rememberVideoTask };
}
