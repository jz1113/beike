import { useEffect, useRef, useState } from 'react';
import { submitDepthVideo } from '@client/shared/api/generation/depthGeneration';
import { DEPTH_VIDEO_LIMITS } from '@shared/domain/media/depthVideo';
import { requiresGenerationRecovery } from '@client/shared/api/generation/generationRecovery';
import { analyzeReferenceVideo, fetchScriptAnalysisPrompt, listSalesScripts, patchSalesScript, saveSalesScript, type SalesScriptDraftResult, type StoredSalesScript } from '../api/salesScripts';
import { fetchSalesActionFile, readSalesDepthReceipt } from '../api/salesDepth';
import { depthFileError } from '../model/salesActionMedia';
import { ScriptDepthFailed, waitScriptDepth } from '../api/salesScriptDepth';
import { readScriptBundleJob, saveScriptBundleJob, readPausedScriptBundles, savePausedScriptBundles, type SalesScriptBundleJob } from '../model/salesScriptBundle';

type Callbacks = { onAnalysis: (result: SalesScriptDraftResult, source: string) => void; onSaved: (item: StoredSalesScript) => void };
export function useSalesScriptBundle(callbacks: Callbacks) {
  const [job, setJob] = useState(readScriptBundleJob);
  const [paused, setPaused] = useState(readPausedScriptBundles);
  const [analyzing, setAnalyzing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const current = useRef(job);
  const session = useRef(0);
  const analysisAbort = useRef<AbortController | null>(null);
  const depthAbort = useRef<AbortController | null>(null);
  const fileRef = useRef<File | undefined>(undefined);
  const handlers = useRef(callbacks); handlers.current = callbacks;
  const linkQueue = useRef(Promise.resolve());
  const persist = (next: SalesScriptBundleJob | null) => {
    saveScriptBundleJob(next);
    current.current = next; setJob(next);
  };
  const update = (patch: Partial<SalesScriptBundleJob>) => {
    if (!current.current) return;
    const next = { ...current.current, ...patch };
    // Keep received results in memory even if local storage fills after submission.
    current.current = next; setJob(next);
    saveScriptBundleJob(next);
  };
  const link = () => {
    const operationId = current.current?.operationId;
    // Serialize media-only patches so a late task receipt cannot erase a completed result.
    const pending = linkQueue.current.catch(() => undefined).then(async () => {
      const snapshot = current.current;
      if (!snapshot?.scriptId || snapshot.operationId !== operationId) return;
      const saved = await patchSalesScript(snapshot.scriptId, {
        videoUrl: snapshot.videoUrl, depthOperationId: snapshot.depthState === 'prepared' || (snapshot.depthState === 'failed' && !snapshot.taskId) ? '' : snapshot.operationId,
        depthTaskId: snapshot.taskId,
        ...(snapshot.resultUrl ? { depthVideoUrl: snapshot.resultUrl } : {}),
      });
      handlers.current.onSaved(saved);
      if (current.current === snapshot && snapshot.resultUrl) { persist(null); setProgress('脚本与深度动作视频已关联保存'); }
    });
    linkQueue.current = pending;
    return pending;
  };
  const analyze = async (model?: string) => {
    if (model && current.current) {
      try { persist({ ...current.current, model }); } catch { setError('无法保存模型选择，请释放浏览器存储空间后重试'); return; }
    }
    const source = current.current;
    if (!source || source.scriptId || analysisAbort.current) return;
    const controller = new AbortController(); analysisAbort.current = controller; setAnalyzing(true); setError('');
    try {
      update({ analysisError: '' });
      let result: SalesScriptDraftResult;
      if (source.pendingScript) result = source.pendingScript;
      else {
        // Reconcile a lost response only against the currently saved analysis rules.
        const [scripts, prompt] = await Promise.all([listSalesScripts(controller.signal), fetchScriptAnalysisPrompt(controller.signal)]);
        const existing = scripts.find((item) => item.analysisCacheEligible === true && item.videoUrl === source.videoUrl
          && item.promptVersion === prompt.promptVersion && item.status !== 'archived');
        if (controller.signal.aborted) return;
        result = existing ? { script: existing.script, existingId: existing.id, model: existing.model,
          promptVersion: existing.promptVersion, videoHash: existing.videoHash, cached: true }
          : await analyzeReferenceVideo(source.videoUrl, source.model, controller.signal);
      }
      if (controller.signal.aborted) return;
      if (!result.existingId) {
        // The model result can succeed even when database storage fails. Checkpoint the
        // content and a stable save ID so retries only save the same draft.
        update({ pendingScript: result, pendingScriptId: source.pendingScriptId || `script_${crypto.randomUUID()}` });
        const saved = await saveSalesScript({ id: current.current!.pendingScriptId, videoUrl: source.videoUrl,
          videoHash: result.videoHash, status: 'draft', script: result.script, model: result.model, promptVersion: result.promptVersion });
        if (controller.signal.aborted) return;
        result = { ...result, existingId: saved.id };
      }
      update({ scriptId: result.existingId, pendingScript: undefined, pendingScriptId: undefined });
      handlers.current.onAnalysis(result, source.videoUrl);
      await link();
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : '脚本分析失败';
        try { update({ analysisError: message }); } catch { setError('无法保存进度，请保留当前页面'); }
        setError(message);
      }
    } finally { if (analysisAbort.current === controller) { analysisAbort.current = null; setAnalyzing(false); } }
  };
  const depth = async (retry = false) => {
    const source = current.current;
    if (!source || depthAbort.current) return;
    const controller = new AbortController(); depthAbort.current = controller; setConverting(true); setError('');
    let submitting = false;
    try {
      update({ depthError: '' });
      if (source.resultUrl) { await link(); return; }
      if (source.depthState === 'failed' && !retry) return;
      if (source.depthState === 'failed') update({ depthState: 'prepared', operationId: `sales_script_depth_${crypto.randomUUID()}`, taskId: '' });
      let snapshot = current.current!;
      if (snapshot.depthState === 'prepared') {
        if ((snapshot.durationSec || 0) > DEPTH_VIDEO_LIMITS.maxDurationSec) throw new ScriptDepthFailed('深度视频限 30 秒以内；脚本将独立保存，可关联已有深度视频');
        const file = fileRef.current || await fetchSalesActionFile(snapshot.videoUrl, true, controller.signal);
        if (controller.signal.aborted) return;
        const validation = depthFileError(file, true);
        if (validation) throw new ScriptDepthFailed(validation);
        // Persist before submission; an ambiguous response must only query this operation.
        persist({ ...current.current!, depthState: 'submitted' });
        snapshot = current.current!;
        submitting = true;
        const receipt = await submitDepthVideo(file, 'mocap', 'standard', controller.signal, snapshot.operationId);
        submitting = false;
        if (controller.signal.aborted) return;
        update({ taskId: receipt.taskId });
      } else if (!snapshot.taskId) {
        const receipt = await readSalesDepthReceipt(true, snapshot.operationId, controller.signal);
        if (controller.signal.aborted) return;
        update({ taskId: receipt.taskId || '', resultUrl: receipt.resultUrl || '' });
      }
      // Persist the accepted receipt on the script without waiting for conversion.
      await link();
      snapshot = current.current!;
      if (!snapshot) return;
      const resultUrl = snapshot.resultUrl || await waitScriptDepth(snapshot.taskId, controller.signal, setProgress);
      if (controller.signal.aborted) return;
      update({ resultUrl, depthState: 'ready' });
      await link();
      if (!current.current?.scriptId && current.current) setProgress('深度视频已完成；脚本完成后自动关联保存');
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : '深度处理失败';
        const failed = err instanceof ScriptDepthFailed || (submitting && !requiresGenerationRecovery(err));
        try { update({ depthError: message, ...(failed ? { depthState: 'failed' } : {}) }); } catch { setError('无法保存进度，请保留当前页面'); }
        if (failed) await link().catch(() => undefined);
        setError(message);
      }
    } finally { if (depthAbort.current === controller) { depthAbort.current = null; setConverting(false); } }
  };
  const start = (videoUrl: string, name: string, model: string, file?: File, stored?: StoredSalesScript, durationSec?: number) => {
    if (current.current || analysisAbort.current || depthAbort.current) { setError('请先完成上一次视频的关联处理'); return; }
    try {
      persist({ videoUrl, name, model, durationSec: durationSec || stored?.script.durationSec, scriptId: stored?.id || '',
        operationId: stored?.depthOperationId || `sales_script_depth_${crypto.randomUUID()}`,
        taskId: stored?.depthTaskId || '', resultUrl: stored?.depthVideoUrl || '',
        depthState: stored?.depthVideoUrl ? 'ready' : stored?.depthOperationId || stored?.depthTaskId ? 'submitted' : 'prepared',
        analysisError: '', depthError: '' });
      session.current += 1;
      fileRef.current = file;
      if (!stored) void analyze();
      void depth();
    } catch { setError('无法保存任务恢复信息，尚未开始处理；请释放浏览器存储空间后重试'); }
  };
  const cancel = () => {
    analysisAbort.current?.abort(); depthAbort.current?.abort();
    analysisAbort.current = null; depthAbort.current = null;
    setAnalyzing(false); setConverting(false); setProgress('已停止等待，已提交任务和结果均保留');
  };
  const deferDepth = async () => {
    if (!current.current?.scriptId) return;
    const operationId = current.current.operationId;
    const expectedSession = session.current;
    cancel(); setError('');
    try {
      await link();
      if (session.current !== expectedSession || (current.current && current.current.operationId !== operationId)) return;
      persist(null); setProgress('脚本已保留，可在脚本详情中继续处理关联视频');
    } catch (err) { setError(err instanceof Error ? err.message : '保存关联失败，请保留当前页面后重试'); }
  };
  const pause = () => {
    const snapshot = current.current;
    if (!snapshot) return;
    cancel();
    try {
      const next = [...readPausedScriptBundles().filter((item) => item.operationId !== snapshot.operationId), snapshot];
      savePausedScriptBundles(next);
      persist(null); session.current += 1; setPaused(next); setError(''); setProgress('处理进度已暂存，可继续导入其他视频');
    } catch { setError('无法暂存进度，请保留当前页面后重试'); }
  };
  const restore = async (saved: SalesScriptBundleJob) => {
    if (current.current) return;
    try {
      const rows = await listSalesScripts();
      if (current.current) return;
      const restored = saved.scriptId && !rows.some((item) => item.id === saved.scriptId) ? { ...saved, scriptId: '' } : saved;
      persist(restored); session.current += 1;
      const next = readPausedScriptBundles().filter((item) => item.operationId !== saved.operationId);
      savePausedScriptBundles(next); setPaused(next); setError(''); setProgress('已恢复进度，请选择要继续的处理');
      fileRef.current = undefined;
    } catch (err) { setError(err instanceof Error ? err.message : '恢复失败'); }
  };
  // Remount only queries accepted depth work, never repeats a paid analysis automatically.
  useEffect(() => {
    if (current.current && current.current.depthState !== 'prepared' && current.current.depthState !== 'failed') void depth();
    return () => { analysisAbort.current?.abort(); depthAbort.current?.abort(); };
    // Each mount reconciles a persisted receipt once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { job, paused, pause, restore, analyzing, converting, progress, error, start, cancel, deferDepth,
    resumeDepth: () => depth(job?.depthState === 'failed'), retryAnalysis: analyze };
}
