import { useEffect, useRef, useState } from 'react';
import type { KeywordReviewMode } from '@shared/contracts/generate';
import { getGatewayClientOverrides } from '@client/shared/api/gatewayClient';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import { exportReviewedWorkbook, parseKeywordWorkbook, parseKeywordWorkbookData } from '../model/keywordReviewWorkbook';
import { advanceKnownFailureVersions, applyBatchResults, isKnownModelOutputFailure, updateReviewRecords } from '../model/reviewProgress';
import { DEEPSEEK_BASE_URL } from '../model/reviewRequest';
import { runKeywordReviewBatches } from '../model/reviewRun';
import { prepareReviewRun } from '../model/reviewRunPreparation';
import { DEFAULT_KEYWORD_REVIEW_SETTINGS, normalizeKeywordReviewSettings, type KeywordReviewSettings } from '../model/keywordReviewSettings';
import { addTokenUsage, estimateReviewYuan, formatReviewYuan, isDeepSeekPeakHour, readTokenUsage } from '../model/reviewCost';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import { useKeywordReviewPreview, PREVIEW_LIMIT, type KeywordReviewFilter } from './useKeywordReviewPreview';
import { useKeywordReviewConfig } from './useKeywordReviewConfig';
import { useKeywordReviewBalance } from './useKeywordReviewBalance';
import { useKeywordReviewSession } from './useKeywordReviewSession';
import type { ReviewSubmission } from '../model/reviewSubmission';

export const KEYWORD_REVIEW_BATCH_SIZE = DEFAULT_KEYWORD_REVIEW_SETTINGS.batchSize;
export const KEYWORD_REVIEW_CONCURRENCY = DEFAULT_KEYWORD_REVIEW_SETTINGS.maxConcurrency;
export type { KeywordReviewFilter } from './useKeywordReviewPreview';

export function useKeywordReview() {
  const session = useKeywordReviewSession();
  const { parsed, records, context, setRecords, setContext } = session;
  const visible = useViewVisibility();
  const [reviewMode, setReviewMode] = useState<KeywordReviewMode>('image');
  const [filter, setFilter] = useState<KeywordReviewFilter>('all');
  const [isImporting, setIsImporting] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [notice, setNotice] = useState('');
  const [runMode, setRunMode] = useState<'idle' | 'trial' | 'all'>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const runStartingRef = useRef(false);
  const exportingRef = useRef(false);
  const importingRef = useRef(false);
  const mountedRef = useRef(true);
  const batchRetryVersionsRef = useRef(new Map<number, number>());
  const inputVersionRef = useRef(0);
  const recordIndicesRef = useRef<Map<string, number>>(new Map());
  const busy = () => isRunning || runStartingRef.current || exportingRef.current || importingRef.current || session.pendingWrites.current > 0;
  const { settings, modelOptions, selectedModel, selectModel: selectConfiguredModel, saveSettings: saveConfiguredSettings } = useKeywordReviewConfig(busy, setNotice);
  const { balance, balanceError, balanceUpdatedAt, balanceRefreshing, balanceDirty, refreshBalance, markDispatch } =
    useKeywordReviewBalance(selectedModel.provider === 'deepseek' && (visible || isRunning));
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopRequestedRef.current = true; inputVersionRef.current += 1; };
  }, []);
  const preview = useKeywordReviewPreview(records, parsed, filter);
  const { counts, filteredRecords } = preview;
  useEffect(() => {
    if (!isRunning && !isPreparing && !context.hasUnexportedResults && !session.saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isRunning, isPreparing, context.hasUnexportedResults, session.saving]);
  const canSwitchMode = session.canStart() && !busy()
    && (!parsed || (!context.reviewAttempted && counts.done === 0 && counts.failed === 0 && counts.pending === counts.total));
  const finishPreparing = () => { runStartingRef.current = false; setIsPreparing(false); };
  const refreshIndices = () => {
    recordIndicesRef.current = new Map(session.taskRef.current.records.map((record, index) => [record.id, index]));
    batchRetryVersionsRef.current = new Map(session.taskRef.current.context.retryVersions);
  };
  const commit = async (ids: string[] = []) => {
    setContext({ retryVersions: [...batchRetryVersionsRef.current] });
    const values = ids.map((id) => session.taskRef.current.records[recordIndicesRef.current.get(id) ?? -1]).filter(Boolean);
    await session.persist(values);
  };
  const removeSubmission = (submission: ReviewSubmission) => setContext((current) => ({ ...current,
    submissions: current.submissions.filter((item) => item.attemptId !== submission.attemptId),
  }));
  const persistConfiguration = (patch: Partial<typeof context>) => {
    if (!session.taskRef.current.parsed) return;
    setContext(patch);
    void commit().catch((error) => setNotice(error instanceof Error ? error.message : '当前设置未能保存至本机任务'));
  };
  const selectModel = (value: string) => {
    const option = modelOptions.find((item) => item.value === value);
    if (!option || busy()) return;
    selectConfiguredModel(value);
    persistConfiguration({ modelValue: value });
  };
  const saveSettings = (next: KeywordReviewSettings) => {
    if (!saveConfiguredSettings(next)) return false;
    persistConfiguration({ settings: normalizeKeywordReviewSettings(next) });
    return true;
  };

  const importFile = async (file: File) => {
    if (busy() || !session.canStart()) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setNotice('仅支持 .xlsx、.xls 或 .csv 文件'); return; }
    importingRef.current = true; setIsImporting(true);
    const version = ++inputVersionRef.current;
    setNotice('');
    try {
      const next = await parseKeywordWorkbook(file, reviewMode);
      if (!mountedRef.current || version !== inputVersionRef.current) return;
      await session.replace(next, { settings, modelValue: selectedModel.value, usageProvider: selectedModel.provider });
      refreshIndices(); setReviewMode(next.mode); setFilter('all');
      const summary = next.sheets.map((sheet) => `${sheet.name} ${sheet.recordCount} 条`).join('、');
      setNotice(`${next.reviewModeMismatch ? '此表含另一审核类型的结果，旧裁决已清除，需重新审核。' : ''}已按${next.mode === 'video' ? '视频' : '图文'}规则识别 ${next.records.length} 条关键词：${summary}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '表格解析失败'); }
    finally { importingRef.current = false; if (mountedRef.current) setIsImporting(false); }
  };

  const runReview = async (mode: 'trial' | 'all' = 'trial') => {
    if (busy() || !session.canStart() || records.length === 0) return;
    const candidates = records.filter((record) => record.status === 'idle' || (mode === 'all' && isKnownModelOutputFailure(record)));
    if (!candidates.length) { setNotice(counts.failed ? '没有待审核记录；已确认失败的记录可单独选择重审' : '所有记录都已完成审核'); return; }
    runStartingRef.current = true; setIsPreparing(true);
    const version = inputVersionRef.current;
    const runModel = selectedModel;
    const baseUrl = runModel.provider === 'deepseek' ? DEEPSEEK_BASE_URL : getGatewayClientOverrides().customBaseUrl || 'https://ai.comfly.org';
    let apiKey: string;
    let rulesVersion: number;
    try {
      ({ apiKey, rulesVersion } = await prepareReviewRun(runModel.provider, session.taskRef.current.context.rulesVersion));
      if (!mountedRef.current || version !== inputVersionRef.current) { finishPreparing(); return; }
      advanceKnownFailureVersions(candidates, recordIndicesRef.current, batchRetryVersionsRef.current);
      setContext({ rulesVersion, usageProvider: runModel.provider, modelValue: runModel.value, settings,
        tokenUsage: { cacheHit: 0, cacheMiss: 0, completion: 0 }, estimatedYuan: 0 });
      await commit();
    } catch (error) {
      finishPreparing(); setNotice(error instanceof Error ? error.message : '审核准备失败，未发起审核请求'); return;
    }
    const queue = mode === 'trial' ? candidates.slice(0, settings.trialSize) : candidates;
    const controller = new AbortController();
    stopRequestedRef.current = false; abortRef.current = controller;
    setIsRunning(true); setRunMode(mode); setIsStopping(false);
    const shouldStop = () => !mountedRef.current || controller.signal.aborted || stopRequestedRef.current || Boolean(session.errorRef.current);
    const update = (ids: string[], change: Parameters<typeof updateReviewRecords>[3]) =>
      setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, ids, change));
    try {
      setNotice(await runKeywordReviewBatches({
        queue, candidates: candidates.length, mode, settings, model: runModel, baseUrl, apiKey, rulesVersion, reviewMode,
        signal: controller.signal, shouldStop, requestStop: () => { stopRequestedRef.current = true; },
        indices: recordIndicesRef.current, versions: batchRetryVersionsRef.current, notice: setNotice,
        refreshBalance: (force) => { if (runModel.provider === 'deepseek') refreshBalance(force); },
        onWaiting: () => {},
        onDispatch: async (submission) => {
          if (session.errorRef.current) throw new Error(session.errorRef.current);
          setContext((current) => ({ ...current, reviewAttempted: true, submissions: [...current.submissions, submission] }));
          update(submission.rows.map((row) => row.id), (record) => ({ ...record, status: 'running', error: undefined, submissionUncertain: false }));
          await commit(submission.rows.map((row) => row.id));
          if (runModel.provider === 'deepseek') markDispatch();
        },
        onCancelled: async (submission) => {
          removeSubmission(submission);
          const ids = submission.rows.map((row) => row.id);
          update(ids, (record) => ({ ...record, status: 'idle', submissionUncertain: false }));
          await commit(ids);
        },
        onUsage: (usage, date) => {
          const used = readTokenUsage(usage);
          recordChatTokens({ modelId: runModel.model, modelName: runModel.label, type: 'chat', usage });
          setContext((current) => ({ ...current, tokenUsage: addTokenUsage(current.tokenUsage, used),
            estimatedYuan: current.estimatedYuan + estimateReviewYuan(used, date).yuan }));
        },
        onSuccess: async (_chunk, results, _lookedUp, _usage, _lookupUsage, submission) => {
          setRecords((current) => applyBatchResults(current, recordIndicesRef.current, results));
          const ids = submission.rows.map((row) => row.id);
          update(ids, (record) => record.status === 'done' ? record : { ...record, status: 'error', error: '模型结果无法修复', submissionUncertain: false });
          removeSubmission(submission); setContext({ hasUnexportedResults: true });
          await commit(ids);
        },
        onRequestFailure: async (error, submission) => {
          const ids = submission.rows.map((row) => row.id);
          update(ids, (record) => record.status === 'done' ? record : { ...record, status: 'error', error: error.message, submissionUncertain: error.outcomeUncertain === true });
          if (!error.outcomeUncertain || ids.every((id) => session.taskRef.current.records[recordIndicesRef.current.get(id)!]?.status === 'done')) removeSubmission(submission);
          setContext({ hasUnexportedResults: true });
          await commit(ids);
        },
        markFailed: async (ids, message, uncertain) => {
          update(ids, (record) => record.status === 'done' ? record : { ...record, status: 'error', error: message, submissionUncertain: uncertain === true });
          if (ids.length) setContext({ hasUnexportedResults: true });
          if (!session.errorRef.current) try { await commit(ids); } catch { stopRequestedRef.current = true; }
        },
      }));
    } catch (error) { setNotice(error instanceof Error ? error.message : '审核失败，已保留当前进度'); }
    finally {
      const dispatched = new Set(session.taskRef.current.context.submissions.flatMap((item) => item.rows.map((row) => row.id)));
      const ids = queue.map((record) => record.id).filter((id) => session.taskRef.current.records[recordIndicesRef.current.get(id)!]?.status === 'running');
      update(ids, (record) => record.status !== 'running' ? record : dispatched.has(record.id)
        ? { ...record, status: 'error', submissionUncertain: true, error: '提交结果尚未确认，已隔离以避免重复费用' }
        : { ...record, status: 'idle' });
      if (!session.errorRef.current) try { await commit(ids); } catch { /* Keep all available results for export. */ }
      abortRef.current = null; finishPreparing(); setIsRunning(false); setIsStopping(false); setRunMode('idle');
      if (runModel.provider === 'deepseek') refreshBalance(true);
    }
  };

  const stopReview = () => {
    if (!abortRef.current) return;
    stopRequestedRef.current = true; setIsStopping(true);
    setNotice('将在当前批次返回后停止，不取消已提交的模型请求');
  };
  const retryFailed = async () => {
    if (busy() || !session.canStart()) return;
    const failed = records.filter((record) => record.status === 'error' && !record.submissionUncertain);
    if (!failed.length) { setNotice('待核对记录已隔离，请先导出进度并核对模型用量'); return; }
    for (const record of failed) {
      const index = recordIndicesRef.current.get(record.id);
      if (index !== undefined) batchRetryVersionsRef.current.set(index, (batchRetryVersionsRef.current.get(index) ?? 0) + 1);
    }
    setRecords((current) => current.map((record) => record.status === 'error' && !record.submissionUncertain ? { ...record, status: 'idle', error: undefined } : record));
    try { await commit(failed.map((record) => record.id)); setNotice(`已将 ${failed.length} 条已确认失败记录放回待审；重新审核可能产生新费用。`); }
    catch (error) { setNotice(error instanceof Error ? error.message : '本机保存失败，未发起审核'); }
  };
  const exportWorkbook = async () => {
    if (!parsed || (!counts.done && !counts.failed) || busy()) return false;
    exportingRef.current = true; setIsExporting(true);
    try {
      const fileName = await exportReviewedWorkbook(parsed, records, counts.done !== counts.total);
      setContext({ hasUnexportedResults: false });
      try { await commit(); } catch { /* The downloaded workbook remains available. */ }
      setNotice(`已导出 ${fileName}；本机任务仍保留，可继续审核或换表。`); return true;
    } catch (error) { setNotice(error instanceof Error ? error.message : '导出失败'); return false; }
    finally { exportingRef.current = false; setIsExporting(false); }
  };
  const reset = async () => {
    if (busy() || session.loading || session.recovery) return false;
    importingRef.current = true; setIsImporting(true);
    try {
      await session.discard(); inputVersionRef.current += 1; refreshIndices(); setFilter('all'); setNotice(''); return true;
    } catch (error) { setNotice(error instanceof Error ? error.message : '清除本机任务失败'); return false; }
    finally { importingRef.current = false; setIsImporting(false); }
  };
  const selectReviewMode = async (next: KeywordReviewMode) => {
    if (next === reviewMode || !canSwitchMode || busy()) return;
    if (!parsed) { setReviewMode(next); setNotice(''); return; }
    importingRef.current = true; setIsImporting(true);
    try {
      await session.replace(parseKeywordWorkbookData(parsed.workbook, parsed.fileName, next),
        { settings, modelValue: selectedModel.value, usageProvider: selectedModel.provider });
      inputVersionRef.current += 1; refreshIndices(); setReviewMode(next); setFilter('all');
      setNotice(`已切换为${next === 'video' ? '视频' : '图文'}规则，当前表格已重新识别。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '切换审核类型失败'); }
    finally { importingRef.current = false; setIsImporting(false); }
  };
  const restoreSession = async () => {
    const saved = await session.restore();
    if (!saved) return;
    refreshIndices(); inputVersionRef.current += 1; setReviewMode(saved.parsed.mode); setFilter('all');
    if (modelOptions.some((item) => item.value === saved.context.modelValue)) selectConfiguredModel(saved.context.modelValue);
    saveConfiguredSettings(saved.context.settings);
    setNotice('已恢复上次表格和审核进度；审核不会自动开始，待核对记录继续隔离。');
  };

  return {
    model: selectedModel.label, modelOptions, modelValue: selectedModel.value, modelProvider: selectedModel.provider, selectModel,
    parsed, reviewMode, canSwitchMode, selectReviewMode, ...preview, records, filter, setFilter,
    filteredCount: filteredRecords.length, previewLimit: PREVIEW_LIMIT, settings, saveSettings,
    trialSize: settings.trialSize, batchSize: settings.batchSize, concurrency: settings.maxConcurrency,
    isImporting, isPreparing, isRunning, runMode, isExporting, isStopping, hasUnexportedResults: context.hasUnexportedResults, notice,
    tokenUsage: context.tokenUsage, usageProvider: context.usageProvider, estimatedCost: { yuan: context.estimatedYuan },
    estimatedCostLabel: formatReviewYuan(context.estimatedYuan), peakHour: selectedModel.provider === 'deepseek' && isDeepSeekPeakHour(),
    balance, balanceError, balanceUpdatedAt, balanceRefreshing, balanceDirty, refreshBalance,
    sessionRecovery: session.recovery, sessionLoading: session.loading, sessionSaving: session.saving,
    sessionSavedAt: session.savedAt, sessionError: session.error, sessionReady: session.canStart(),
    sessionCanClear: session.canClear,
    restoreSession, discardSession: session.discard, retrySessionSave: () => busy() ? Promise.resolve() : session.retrySave(),
    importFile, runReview, stopReview, retryFailed, exportWorkbook, reset,
  };
}
