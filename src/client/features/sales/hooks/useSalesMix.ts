import { useCallback, useEffect, useRef, useState } from 'react';
import { mixSalesFinalVideo, pollSalesMixTask } from '../api/salesProduction';
import type { SalesBgmCandidate } from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import type { useSalesProductionTask } from './useSalesProductionTask';

interface Options {
  plan: SalesProductionPlanState;
  sourceKey: string;
  voiceMode: 'speech' | 'voiceover' | 'none';
  bgm: SalesBgmCandidate | null;
  jobName: string;
  ready: boolean;
  busy: string;
  patchPlan: (patch: Partial<SalesProductionPlanState>) => void;
  runTask: ReturnType<typeof useSalesProductionTask>['runTask'];
  setError: (message: string) => void;
  onOutputProduced?: () => void;
}

/** Persist mix ownership and reconnect by receipt; recovery never starts another mix. */
export function useSalesMix(options: Options) {
  const { plan, sourceKey, busy, ready, patchPlan, runTask } = options;
  const latest = useRef(options);
  latest.current = options;
  const attempted = useRef(new Set<string>());
  const [recoveryVersion, retryRecovery] = useState(0);
  const remember = useCallback((taskId: string) => {
    if (sourceKey === latest.current.sourceKey) patchPlan({ pendingMixTask: { taskId, sourceKey } });
  }, [patchPlan, sourceKey]);

  const pending = plan.pendingMixTask;
  useEffect(() => {
    if (!pending || pending.sourceKey !== sourceKey || plan.mixedVideoUrl) return;
    const key = JSON.stringify(pending);
    if (busy === 'mix') { attempted.current.add(key); return; }
    if (!ready || busy || attempted.current.has(key)) return;
    let stopped = false;
    void Promise.resolve().then(async () => {
      if (stopped || attempted.current.has(key)) return;
      const result = await runTask('mix', '正在恢复已提交的成片合成任务…', (signal, progress) => {
        attempted.current.add(key);
        return pollSalesMixTask(pending.taskId, signal, progress);
      });
      if (!attempted.current.has(key) && !stopped) retryRecovery(value => value + 1);
      const current = latest.current;
      if (!result || current.sourceKey !== pending.sourceKey || current.plan.pendingMixTask?.taskId !== pending.taskId) return;
      current.patchPlan({ mixedVideoUrl: result.videoUrl, pendingMixTask: null });
      current.onOutputProduced?.();
    });
    return () => { stopped = true; };
  }, [recoveryVersion, busy, pending, plan.mixedVideoUrl, ready, runTask, sourceKey]);

  return useCallback(async () => {
    const current = latest.current;
    const { plan, voiceMode, bgm, jobName, setError } = current;
    if (!plan.generatedVideoUrl) { setError('请先生成视频（或上传待合成原片）后再合成配音与背景音乐'); return; }
    if (voiceMode === 'voiceover' && !plan.voiceoverAudioUrl) { setError('请先为当前分镜台词合成配音，再导出旁白成片'); return; }
    const result = await runTask('mix', '正在合成配音与背景音乐…', (signal) => mixSalesFinalVideo({
      jobName, videoUrl: plan.generatedVideoUrl, voiceMode,
      voiceoverUrl: voiceMode === 'voiceover' ? plan.voiceoverAudioUrl : undefined,
      bgmId: !plan.customBgmUrl && bgm ? bgm.id : undefined,
      bgmUrl: plan.customBgmUrl || undefined,
    }, signal, remember));
    if (result) {
      current.patchPlan({ mixedVideoUrl: result.videoUrl, pendingMixTask: null });
      current.onOutputProduced?.();
    }
  }, [remember, runTask]);
}
