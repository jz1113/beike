import { useEffect, useRef, useState } from 'react';
import type { KeywordReviewMode } from '@shared/contracts/generate';
import { apiFetch } from '@client/shared/api/apiClient';
import { credentialGet } from '@client/shared/api/credentialClient';
import { getGatewayClientOverrides } from '@client/shared/api/gatewayClient';
import {
  exportReviewedWorkbook,
  parseKeywordWorkbook,
  type KeywordReviewRecord,
  type ParsedKeywordWorkbook,
} from '../model/keywordReviewWorkbook';
import { advanceKnownFailureVersions, applyBatchResults, isKnownModelOutputFailure, updateReviewRecords } from '../model/reviewProgress';
import { reviewBatchWithRecovery } from '../model/reviewBatchRecovery';
import { DEEPSEEK_BASE_URL, type ReviewRequestError } from '../model/reviewRequest';
import { ReviewPacer } from '../model/reviewPacer';
import { createReviewBatchSubmit } from '../model/reviewBatchSubmit';
import { DEFAULT_KEYWORD_REVIEW_MODEL, KEYWORD_REVIEW_MODEL_STORAGE_KEY, loadKeywordReviewModels } from '@client/shared/models/keywordReviewModels';
import { DEFAULT_KEYWORD_REVIEW_SETTINGS, loadKeywordReviewSettings, normalizeKeywordReviewSettings, persistKeywordReviewSettings, type KeywordReviewSettings } from '../model/keywordReviewSettings';
import { addTokenUsage, estimateReviewYuan, formatReviewYuan, isDeepSeekPeakHour, readTokenUsage, type ReviewTokenUsage } from '../model/reviewCost';
import { useKeywordReviewPreview, PREVIEW_LIMIT, type KeywordReviewFilter } from './useKeywordReviewPreview';
import { useKeywordReviewBalance } from './useKeywordReviewBalance';

export const KEYWORD_REVIEW_BATCH_SIZE = DEFAULT_KEYWORD_REVIEW_SETTINGS.batchSize;
export const KEYWORD_REVIEW_CONCURRENCY = DEFAULT_KEYWORD_REVIEW_SETTINGS.maxConcurrency;
export type { KeywordReviewFilter } from './useKeywordReviewPreview';
const LOOKUP_BATCH_LIMIT = 2;
const LOOKUP_RUN_LIMIT = 100;
const EMPTY_USAGE: ReviewTokenUsage = { cacheHit: 0, cacheMiss: 0, completion: 0 };

export function useKeywordReview() {
  const [settings, setSettings] = useState<KeywordReviewSettings>(loadKeywordReviewSettings);
  const [modelOptions, setModelOptions] = useState(loadKeywordReviewModels);
  const [modelValue, setModelValue] = useState(() => {
    try { return localStorage.getItem(KEYWORD_REVIEW_MODEL_STORAGE_KEY) || DEFAULT_KEYWORD_REVIEW_MODEL; }
    catch { return DEFAULT_KEYWORD_REVIEW_MODEL; }
  });
  const selectedModel = modelOptions.find((option) => option.value === modelValue) || modelOptions[0];
  const [parsed, setParsed] = useState<ParsedKeywordWorkbook | null>(null);
  const [reviewMode, setReviewMode] = useState<KeywordReviewMode>('image');
  const [records, setRecords] = useState<KeywordReviewRecord[]>([]);
  const [lastTrialIds, setLastTrialIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<KeywordReviewFilter>('all');
  const [isImporting, setIsImporting] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [runMode, setRunMode] = useState<'idle' | 'trial' | 'all'>('idle');
  const [lookupEnabled, setLookupEnabled] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<ReviewTokenUsage>(EMPTY_USAGE);
  const { balance, balanceError, balanceUpdatedAt, balanceRefreshing, balanceDirty, refreshBalance, markDispatch } =
    useKeywordReviewBalance(selectedModel.provider === 'deepseek');
  const abortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const runStartingRef = useRef(false);
  const batchRetryVersionsRef = useRef(new Map<number, number>());
  const inputVersionRef = useRef(0);
  const rulesVersionRef = useRef<number | null>(null);
  const recordIndicesRef = useRef<Map<string, number>>(new Map());
  const lookupRemainingRef = useRef(LOOKUP_RUN_LIMIT);

  useEffect(() => {
    const reload = () => setModelOptions(loadKeywordReviewModels());
    window.addEventListener('models_updated', reload);
    return () => window.removeEventListener('models_updated', reload);
  }, []);

  const selectModel = (value: string) => {
    if (isRunning || runStartingRef.current || !modelOptions.some((option) => option.value === value)) return;
    setModelValue(value);
    try { localStorage.setItem(KEYWORD_REVIEW_MODEL_STORAGE_KEY, value); } catch { /* storage unavailable */ }
    if (value !== DEFAULT_KEYWORD_REVIEW_MODEL) setLookupEnabled(false);
  };

  const saveSettings = (next: KeywordReviewSettings) => {
    if (isRunning || runStartingRef.current) {
      setNotice('审核任务正在启动或运行，当前设置暂不可修改。');
      return false;
    }
    const normalized = normalizeKeywordReviewSettings(next);
    const persisted = persistKeywordReviewSettings(normalized);
    setSettings(normalized);
    setNotice(persisted ? '关键词分类设置已保存。' : '设置已应用到当前页面，但浏览器无法保存本地配置。');
    return true;
  };

  const { counts, sheetSummary, filteredRecords, previewRecords } = useKeywordReviewPreview(records, parsed, filter, lastTrialIds);

  const finishPreparing = () => {
    runStartingRef.current = false;
    setIsPreparing(false);
  };

  const importFile = async (file: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setNotice('仅支持 .xlsx、.xls 或 .csv 文件');
      return;
    }
    setIsImporting(true);
    inputVersionRef.current += 1;
    setNotice('');
    setLastTrialIds([]);
    setFilter('all');
    try {
      const next = await parseKeywordWorkbook(file, reviewMode);
      setReviewMode(next.mode);
      rulesVersionRef.current = null;
      batchRetryVersionsRef.current.clear();
      recordIndicesRef.current = new Map(next.records.map((record, index) => [record.id, index]));
      setParsed(next);
      setRecords(next.records);
      const summary = next.sheets.map((sheet) => `${sheet.name} ${sheet.recordCount} 条`).join('、');
      setNotice(`已按${next.mode === 'video' ? '视频' : '图文'}规则识别 ${next.records.length} 条关键词：${summary}`);
    } catch (error) {
      recordIndicesRef.current = new Map();
      setParsed(null);
      setRecords([]);
      setNotice(error instanceof Error ? error.message : '表格解析失败');
    } finally {
      setIsImporting(false);
    }
  };

  const runReview = async (mode: 'trial' | 'all' = 'trial') => {
    if (isRunning || runStartingRef.current || records.length === 0) return;
    const candidates = records.filter((record) => record.status === 'idle' || (mode === 'all' && isKnownModelOutputFailure(record)));
    if (candidates.length === 0) {
      setNotice(counts.failed > 0 ? '没有待审核记录；失败批次需单独选择重新审核，可能再次产生费用' : '所有记录都已完成审核');
      return;
    }
    runStartingRef.current = true;
    setIsPreparing(true);
    const inputVersion = inputVersionRef.current;
    const runModel = selectedModel;
    const baseUrl = runModel.provider === 'deepseek'
      ? DEEPSEEK_BASE_URL
      : getGatewayClientOverrides().customBaseUrl || 'https://ai.comfly.org';
    let apiKey: string;
    try { apiKey = (await credentialGet(runModel.provider === 'deepseek' ? 'deepseek_api_key' : 'ai_api_key')).trim(); }
    catch {
      finishPreparing();
      setNotice('读取所选模型的 API Key 失败，未发起审核请求');
      return;
    }
    if (inputVersion !== inputVersionRef.current) { finishPreparing(); return; }
    if (!apiKey) {
      finishPreparing();
      setNotice(runModel.provider === 'deepseek'
        ? '未配置 DeepSeek API Key，请到设置里的 DeepSeek 官方服务填写'
        : '未配置模型网关 API Key，请到设置里的大模型网关填写');
      return;
    }
    let rulesVersion: number;
    try {
      if (rulesVersionRef.current === null) {
        const rulesResponse = await apiFetch('/api/generate/keyword-review/rules');
        if (!rulesResponse.ok) throw new Error('读取审核规则失败');
        const rules = await rulesResponse.json() as { current?: { version?: number } };
        if (!Number.isInteger(rules.current?.version)) throw new Error('审核规则版本异常');
        rulesVersionRef.current = rules.current!.version!;
      }
      rulesVersion = rulesVersionRef.current;
      if (inputVersion !== inputVersionRef.current) { finishPreparing(); return; }
    } catch (error) {
      finishPreparing();
      setNotice(error instanceof Error ? error.message : '读取审核规则失败');
      return;
    }
    const runSettings = settings;
    const queue = mode === 'trial' ? candidates.slice(0, runSettings.trialSize) : candidates;
    lookupRemainingRef.current = LOOKUP_RUN_LIMIT;
    setTokenUsage(EMPTY_USAGE);
    advanceKnownFailureVersions(queue, recordIndicesRef.current, batchRetryVersionsRef.current);
    const controller = new AbortController();
    stopRequestedRef.current = false;
    abortRef.current = controller;
    setIsRunning(true);
    setRunMode(mode);
    let completedNow = 0;
    let failedNow = 0;
    let lookedUpNow = 0;
    let rateLimitRetries = 0;
    let consecutiveBudgetExhausted = 0;
    let consecutiveInfrastructureFailures = 0;
    let uncertainNow = 0;
    const pacer = new ReviewPacer(runSettings.maxConcurrency);
    const runState: { fatalError: Error | null } = { fatalError: null };
    try {
      let nextIndex = 0;
      const runWorker = async () => {
        while (!controller.signal.aborted && !stopRequestedRef.current && nextIndex < queue.length) {
          const index = nextIndex;
          nextIndex += runSettings.batchSize;
          const batch = queue.slice(index, index + runSettings.batchSize);
          const ids = batch.map((record) => record.id);
          const settledIds = new Set<string>();
          const markFailed = (failedIds: string[], message: string, submissionUncertain = false) => {
            const freshIds = failedIds.filter((id) => !settledIds.has(id));
            freshIds.forEach((id) => settledIds.add(id));
            setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, freshIds,
              (record) => ({ ...record, status: 'error', error: message, submissionUncertain })));
            failedNow += freshIds.length;
            if (submissionUncertain) uncertainNow += freshIds.length;
          };
          setLastTrialIds(ids);
          const remaining = queue.length - completedNow - failedNow;
          setNotice(mode === 'trial'
            ? `按规则 v${rulesVersion} 正在试跑 ${batch.length} 条${lookupEnabled ? '，不确定词将联网补查' : ''}…`
            : `按规则 v${rulesVersion} 并行审核中，本轮还剩 ${remaining} 条${lookupEnabled ? '，不确定词将联网补查' : ''}`);
          setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, ids,
            (record) => ({ ...record, status: 'running', error: undefined })));
          const lookupBudget = runModel.provider === 'deepseek' && lookupEnabled
            ? Math.min(LOOKUP_BATCH_LIMIT, lookupRemainingRef.current)
            : 0;
          const submit = createReviewBatchSubmit({
            model: runModel.model, provider: runModel.provider, baseUrl,
            reviewMode, apiKey, lookup: lookupBudget > 0, lookupBudget, rulesVersion,
            signal: controller.signal, shouldStop: () => controller.signal.aborted || stopRequestedRef.current,
            indices: recordIndicesRef.current, versions: batchRetryVersionsRef.current, pacer,
            onDispatch: () => { if (runModel.provider === 'deepseek') markDispatch(); },
            onSuccess: (chunk, results, lookedUp, usage, lookupUsage) => {
              setRecords((current) => applyBatchResults(current, recordIndicesRef.current, results));
              chunk.forEach((record) => settledIds.add(record.id));
              completedNow += chunk.length; lookedUpNow += lookedUp;
              lookupRemainingRef.current = Math.max(0, lookupRemainingRef.current - lookedUp);
              setTokenUsage((current) => addTokenUsage(current, readTokenUsage(usage), readTokenUsage(lookupUsage)));
              if (runModel.provider === 'deepseek') refreshBalance();
              consecutiveInfrastructureFailures = 0;
            },
            onRateLimit: (concurrency) => {
              rateLimitRetries += 1;
              setNotice(`${runModel.label} 限流，已降至 ${concurrency} 个并行请求并等待重试…`);
            },
            onFailure: () => { if (runModel.provider === 'deepseek') refreshBalance(true); },
          });
          try {
            const recovery = await reviewBatchWithRecovery({
              rows: batch,
              submit,
              isModelOutputError: (error) => (error as Error & { modelOutputInvalid?: boolean }).modelOutputInvalid === true,
              shouldStop: () => controller.signal.aborted || stopRequestedRef.current,
              onRetry: (chunk) => setNotice(`模型格式异常，正在自动重试 ${chunk.length} 条…`),
              onSingleRowFailure: (record, error) => markFailed([record.id], error instanceof Error ? error.message : '模型结果异常'),
              onUnresolvedRows: (rows) => markFailed(rows.map((record) => record.id), '模型格式异常，本批自动重试已达费用保护上限'),
            });
            consecutiveBudgetExhausted = recovery.exhausted ? consecutiveBudgetExhausted + 1 : 0;
            if (consecutiveBudgetExhausted >= 2) {
              runState.fatalError = new Error('连续两批模型格式异常达到自动重试费用保护上限');
              stopRequestedRef.current = true;
            }
          } catch (error) {
            if (controller.signal.aborted) break;
            const failure = error instanceof Error ? error as ReviewRequestError : new Error('审核失败') as ReviewRequestError;
            markFailed(ids, failure.message, failure.outcomeUncertain === true);
            if (failure.fatalConfig) {
              runState.fatalError = failure;
              stopRequestedRef.current = true;
              break;
            }
            consecutiveInfrastructureFailures = failure.infrastructureFailure
              ? consecutiveInfrastructureFailures + 1 : 0;
            if (consecutiveInfrastructureFailures >= 6) {
              runState.fatalError = new Error('审核服务连续 6 批不可用，已暂停提交以控制费用；完成的结果均已保留');
              stopRequestedRef.current = true;
              break;
            }
          }
        }
      };
      const workerCount = Math.min(mode === 'trial' ? 1 : runSettings.maxConcurrency, Math.ceil(queue.length / runSettings.batchSize));
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
      setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, queue.map((record) => record.id),
        (record) => record.status === 'running' ? { ...record, status: 'idle' } : record));
      if (runState.fatalError) {
        setNotice(`${runState.fatalError.message}。本次完成 ${completedNow} 条、失败 ${failedNow} 条${uncertainNow ? `（其中 ${uncertainNow} 条提交待核对）` : ''}；可导出当前进度。`);
        return;
      }
      if (runModel.provider === 'deepseek') refreshBalance(true);
      const lookupNote = lookedUpNow > 0 ? `，联网补查 ${lookedUpNow} 条` : '';
      if (controller.signal.aborted || stopRequestedRef.current) {
        setNotice(`已停止，本次完成 ${completedNow} 条${lookupNote}，可继续未完成记录`);
      } else if (mode === 'trial') {
        const leftover = candidates.length - completedNow - failedNow;
        const failedNote = failedNow > 0 ? `，失败 ${failedNow} 条（可稍后重试）` : '';
        setNotice(leftover > 0
          ? `本批试跑完成 ${completedNow} 条${failedNote}${lookupNote}，还剩 ${leftover} 条未审核`
          : `本批试跑完成 ${completedNow} 条${failedNote}${lookupNote}`);
      } else {
        setNotice(`批量审核已处理到最后一个词：完成 ${completedNow} 条${failedNow > 0 ? `，失败 ${failedNow} 条` : ''}${uncertainNow ? `（其中 ${uncertainNow} 条提交待核对，暂不重新收费）` : ''}${lookupNote}${rateLimitRetries > 0 ? `，限流后重试 ${rateLimitRetries} 次` : ''}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '审核失败';
      setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, queue.map((record) => record.id),
        (record) => record.status === 'running'
          ? { ...record, status: controller.signal.aborted ? 'idle' : 'error', error: message }
          : record));
      if (controller.signal.aborted) setNotice(`已停止，本次完成 ${completedNow} 条，可继续未完成记录`);
      else setNotice(`${message}。已保留完成的结果，修复后可继续。`);
    } finally {
      abortRef.current = null;
      finishPreparing();
      setIsRunning(false);
      setRunMode('idle');
    }
  };

  const stopReview = () => {
    if (!abortRef.current) return;
    stopRequestedRef.current = true;
    setNotice('将在当前批次返回后停止，不取消已提交的模型请求');
  };

  const retryFailed = () => {
    if (isRunning) return;
    const failed = records.filter((record) => record.status === 'error' && !record.submissionUncertain);
    if (failed.length === 0) {
      setNotice('失败记录的提交结果待核对，已阻止重新收费；请先导出当前进度并核对所用模型的用量');
      return;
    }
    for (const record of failed) {
      const index = recordIndicesRef.current.get(record.id);
      if (index !== undefined) batchRetryVersionsRef.current.set(index, (batchRetryVersionsRef.current.get(index) ?? 0) + 1);
    }
    setRecords((current) => current.map((record) => record.status === 'error' && !record.submissionUncertain
      ? { ...record, status: 'idle', error: undefined } : record));
    setNotice(`已将 ${failed.length} 条已确认失败的记录放回待审核队列；重新审核可能产生新费用。提交结果待核对的记录仍被隔离。`);
  };

  const exportWorkbook = async () => {
    if (!parsed || counts.done === 0 || isRunning) return;
    setIsExporting(true);
    try {
      const partial = counts.done !== counts.total;
      const fileName = await exportReviewedWorkbook(parsed, records, partial);
      setNotice(`已导出 ${fileName}${partial ? '；重新导入该文件可继续审核未完成记录' : ''}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const reset = () => {
    inputVersionRef.current += 1;
    abortRef.current?.abort();
    setParsed(null);
    rulesVersionRef.current = null;
    batchRetryVersionsRef.current.clear();
    recordIndicesRef.current = new Map();
    setRecords([]);
    setLastTrialIds([]);
    setFilter('all');
    setNotice('');
    setRunMode('idle');
  };

  const selectReviewMode = (next: KeywordReviewMode) => {
    if (parsed || isRunning || isImporting) return;
    setReviewMode(next);
    setNotice('');
  };

  return {
    model: selectedModel.label,
    modelOptions,
    modelValue: selectedModel.value,
    modelProvider: selectedModel.provider,
    selectModel,
    parsed,
    reviewMode,
    selectReviewMode,
    records,
    filter,
    setFilter,
    filteredCount: filteredRecords.length,
    previewRecords,
    previewLimit: PREVIEW_LIMIT,
    sheetSummary,
    counts,
    settings,
    saveSettings,
    trialSize: settings.trialSize,
    batchSize: settings.batchSize,
    concurrency: settings.maxConcurrency,
    isImporting,
    isPreparing,
    isRunning,
    runMode,
    isExporting,
    notice,
    lookupEnabled,
    setLookupEnabled: (enabled: boolean) => {
      setLookupEnabled(enabled);
      if (enabled) setNotice('联网补查按搜索网页计费，高峰时段成本显著上升');
    },
    tokenUsage,
    estimatedCost: estimateReviewYuan(tokenUsage),
    estimatedCostLabel: formatReviewYuan(estimateReviewYuan(tokenUsage).yuan),
    peakHour: isDeepSeekPeakHour(),
    balance,
    balanceError,
    balanceUpdatedAt,
    balanceRefreshing,
    balanceDirty,
    refreshBalance,
    importFile,
    runReview,
    stopReview,
    retryFailed,
    exportWorkbook,
    reset,
  };
}
