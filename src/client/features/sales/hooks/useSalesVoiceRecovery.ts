import { useCallback, useEffect, useRef, useState } from 'react';
import { pollSalesVoiceTask } from '../api/salesProduction';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import type { useSalesProductionTask } from './useSalesProductionTask';

interface Options {
  plan: SalesProductionPlanState;
  sourceKey?: string;
  ready: boolean;
  busy: string;
  patchPlan: (patch: Partial<SalesProductionPlanState>) => void;
  runTask: ReturnType<typeof useSalesProductionTask>['runTask'];
}

/** Reconnect an accepted voice job without generating another paid voice. */
export function useSalesVoiceRecovery({ plan, sourceKey, ready, busy, patchPlan, runTask }: Options) {
  const attempted = useRef(new Set<string>());
  const [recoveryVersion, retryRecovery] = useState(0);
  const latest = useRef({ plan, sourceKey, patchPlan });
  latest.current = { plan, sourceKey, patchPlan };
  const rememberVoiceTask = useCallback((taskId: string) => {
    if (sourceKey && sourceKey === latest.current.sourceKey) patchPlan({ pendingVoiceTask: { taskId, sourceKey } });
  }, [patchPlan, sourceKey]);
  const pending = plan.pendingVoiceTask;
  useEffect(() => {
    if (!pending || !sourceKey || pending.sourceKey !== sourceKey) return;
    const key = JSON.stringify(pending);
    if (busy === 'tts') { attempted.current.add(key); return; }
    if (!ready || busy || attempted.current.has(key)) return;
    let stopped = false;
    void Promise.resolve().then(async () => {
      if (stopped || attempted.current.has(key)) return;
      const result = await runTask('tts', '正在恢复已提交的配音任务…', (signal, progress) => {
        attempted.current.add(key);
        return pollSalesVoiceTask(pending.taskId, signal, progress);
      });
      if (!attempted.current.has(key) && !stopped) retryRecovery(value => value + 1);
      const current = latest.current;
      if (!result || current.sourceKey !== pending.sourceKey || current.plan.pendingVoiceTask?.taskId !== pending.taskId) return;
      current.patchPlan({ voiceoverAudioUrl: result.audioUrl, pendingVoiceTask: null });
    });
    return () => { stopped = true; };
  }, [recoveryVersion, busy, pending, ready, runTask, sourceKey]);
  return rememberVoiceTask;
}
