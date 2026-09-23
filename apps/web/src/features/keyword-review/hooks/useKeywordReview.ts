import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeywordReviewBalance, KeywordReviewResult } from '@beike/contracts/generate';
import { apiFetch } from '@/shared/api/apiClient';
import { credentialGet } from '@/shared/api/credentialClient';
import {
  exportReviewedWorkbook,
  parseKeywordWorkbook,
  type KeywordReviewRecord,
  type ParsedKeywordWorkbook,
} from '../model/keywordReviewWorkbook';
import { advanceKnownFailureVersions, applyBatchResults, countReviewRecords, isKnownModelOutputFailure, selectPreviewRecords, updateReviewRecords } from '../model/reviewProgress';
import { reviewBatchWithRecovery } from '../model/reviewBatchRecovery';
import { DEEPSEEK_BASE_URL, requestReviewBatch, type BalanceResponse } from '../model/reviewRequest';
import { MAX_REVIEW_CONCURRENCY, ReviewPacer } from '../model/reviewPacer';

export const KEYWORD_REVIEW_BATCH_SIZE = 50;
export const KEYWORD_REVIEW_CONCURRENCY = MAX_REVIEW_CONCURRENCY;
export const KEYWORD_REVIEW_MODEL = 'deepseek-flash';
export const KEYWORD_REVIEW_MODEL_LABEL = 'DeepSeek Flash';
export type KeywordReviewFilter = 'all' | 'done' | 'producible' | 'rejected';
const PREVIEW_LIMIT = 240;
const BALANCE_REFRESH_INTERVAL_MS = 15_000;
const BALANCE_REQUEST_TIMEOUT_MS = 12_000;

export function useKeywordReview() {
  const [parsed, setParsed] = useState<ParsedKeywordWorkbook | null>(null);
  const [records, setRecords] = useState<KeywordReviewRecord[]>([]);
  const [lastTrialIds, setLastTrialIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<KeywordReviewFilter>('all');
  const [isImporting, setIsImporting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [runMode, setRunMode] = useState<'idle' | 'trial' | 'all'>('idle');
  const [lookupEnabled, setLookupEnabled] = useState(false);
  const [balance, setBalance] = useState<KeywordReviewBalance | null>(null);
  const [balanceError, setBalanceError] = useState('');
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState<number | null>(null);
  const [balanceRefreshing, setBalanceRefreshing] = useState(false);
  const [balanceDirty, setBalanceDirty] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const runStartingRef = useRef(false);
  const batchRetryVersionsRef = useRef(new Map<number, number>());
  const inputVersionRef = useRef(0);
  const rulesVersionRef = useRef<number | null>(null);
  const recordIndicesRef = useRef<Map<string, number>>(new Map());
  const balanceInFlightRef = useRef<Promise<void> | null>(null);
  const balancePendingRef = useRef(false);
  const balancePendingForceRef = useRef(false);
  const balanceLastAttemptRef = useRef(0);
  const balanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const balanceKeyRef = useRef('');
  const balanceSpendVersionRef = useRef(0);

  const refreshBalance = useCallback(function refreshBalance(force = false): void {
    if (balanceInFlightRef.current) {
      balancePendingRef.current = true;
      balancePendingForceRef.current ||= force;
      return;
    }
    const delay = force ? 0 : Math.max(0, BALANCE_REFRESH_INTERVAL_MS - (Date.now() - balanceLastAttemptRef.current));
    if (delay > 0) {
      if (!balanceTimerRef.current) {
        balanceTimerRef.current = setTimeout(() => {
          balanceTimerRef.current = null;
          refreshBalance(true);
        }, delay);
      }
      return;
    }
    if (balanceTimerRef.current) clearTimeout(balanceTimerRef.current);
    balanceTimerRef.current = null;
    balanceLastAttemptRef.current = Date.now();
    setBalanceRefreshing(true);
    const requestedSpendVersion = balanceSpendVersionRef.current;
    const request = (async () => {
      try {
        const apiKey = (await credentialGet('deepseek_api_key')).trim();
        if (apiKey !== balanceKeyRef.current) {
          balanceKeyRef.current = apiKey;
          setBalance(null);
          setBalanceUpdatedAt(null);
        }
        if (!apiKey) {
          setBalanceError('');
          return;
        }
        const response = await apiFetch('/api/generate/keyword-review/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customBaseUrl: DEEPSEEK_BASE_URL, customApiKey: apiKey }),
          signal: AbortSignal.timeout(BALANCE_REQUEST_TIMEOUT_MS),
        });
        const data = await response.json() as BalanceResponse;
        if (!response.ok || !data.success || (data.currency !== 'CNY' && data.currency !== 'USD')) {
          setBalanceError(data.error || '余额查询失败');
          return;
        }
        setBalance({
          currency: data.currency,
          total: String(data.total ?? '0'),
          granted: String(data.granted ?? '0'),
          toppedUp: String(data.toppedUp ?? '0'),
          available: data.available === true,
        });
        setBalanceUpdatedAt(Date.now());
        if (requestedSpendVersion === balanceSpendVersionRef.current) setBalanceDirty(false);
        else balancePendingRef.current = true;
        setBalanceError('');
      } catch (error) {
        setBalanceError(error instanceof Error ? error.message : '余额查询失败');
      }
    })().finally(() => {
      balanceInFlightRef.current = null;
      setBalanceRefreshing(false);
      if (balancePendingRef.current) {
        const forceNext = balancePendingForceRef.current;
        balancePendingRef.current = false;
        balancePendingForceRef.current = false;
        refreshBalance(forceNext);
      }
    });
    balanceInFlightRef.current = request;
  }, []);

  useEffect(() => {
    refreshBalance(true);
    const interval = setInterval(() => refreshBalance(), 30_000);
    return () => {
      clearInterval(interval);
      if (balanceTimerRef.current) clearTimeout(balanceTimerRef.current);
    };
  }, [refreshBalance]);

  const counts = useMemo(() => countReviewRecords(records), [records]);

  const sheetSummary = useMemo(
    () => parsed?.sheets.map((sheet) => `${sheet.name} ${sheet.recordCount} 条`).join('、') || '',
    [parsed],
  );

  const filteredRecords = useMemo(() => filter === 'all' ? records : records.filter((record) => {
    if (filter === 'done') return record.status === 'done';
    if (filter === 'producible') return record.status === 'done' && record.producible === '制作';
    if (filter === 'rejected') return record.status === 'done' && record.producible === '不制作';
    return true;
  }), [records, filter]);

  const previewRecords = useMemo(() => {
    const last = new Set(lastTrialIds);
    return selectPreviewRecords(filteredRecords, last, PREVIEW_LIMIT);
  }, [filteredRecords, lastTrialIds]);

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
      const next = await parseKeywordWorkbook(file);
      rulesVersionRef.current = null;
      batchRetryVersionsRef.current.clear();
      recordIndicesRef.current = new Map(next.records.map((record, index) => [record.id, index]));
      setParsed(next);
      setRecords(next.records);
      const summary = next.sheets.map((sheet) => `${sheet.name} ${sheet.recordCount} 条`).join('、');
      setNotice(`已识别 ${next.records.length} 条关键词：${summary}`);
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
    const inputVersion = inputVersionRef.current;
    let apiKey: string;
    try { apiKey = (await credentialGet('deepseek_api_key')).trim(); }
    catch {
      runStartingRef.current = false;
      setNotice('读取 DeepSeek API Key 失败，未发起审核请求');
      return;
    }
    if (inputVersion !== inputVersionRef.current) { runStartingRef.current = false; return; }
    if (!apiKey) {
      runStartingRef.current = false;
      setNotice('未配置 DeepSeek API Key，请到设置里的 DeepSeek 官方服务填写');
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
      if (inputVersion !== inputVersionRef.current) { runStartingRef.current = false; return; }
    } catch (error) {
      runStartingRef.current = false;
      setNotice(error instanceof Error ? error.message : '读取审核规则失败');
      return;
    }
    const queue = mode === 'trial' ? candidates.slice(0, KEYWORD_REVIEW_BATCH_SIZE) : candidates;
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
    const pacer = new ReviewPacer();
    const runState: { fatalError: Error | null } = { fatalError: null };
    try {
      let nextIndex = 0;
      const runWorker = async () => {
        while (!controller.signal.aborted && !stopRequestedRef.current && nextIndex < queue.length) {
          const index = nextIndex;
          nextIndex += KEYWORD_REVIEW_BATCH_SIZE;
          const batch = queue.slice(index, index + KEYWORD_REVIEW_BATCH_SIZE);
          const ids = batch.map((record) => record.id);
          setLastTrialIds(ids);
          const remaining = queue.length - completedNow - failedNow;
          setNotice(mode === 'trial'
            ? `按规则 v${rulesVersion} 正在试跑 ${batch.length} 条${lookupEnabled ? '，不确定词将联网补查' : ''}…`
            : `按规则 v${rulesVersion} 并行审核中，本轮还剩 ${remaining} 条${lookupEnabled ? '，不确定词将联网补查' : ''}`);
          setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, ids,
            (record) => ({ ...record, status: 'running', error: undefined })));
          const submit = async (chunk: KeywordReviewRecord[]) => {
            const sourceIndex = recordIndicesRef.current.get(chunk[0].id) ?? index;
            const rows = chunk.map(({ id, query, expansion, entityExpansion, contentType }) => ({ id, query, expansion, entityExpansion, contentType }));
            const payload = JSON.stringify({ model: KEYWORD_REVIEW_MODEL, lookup: lookupEnabled, rulesVersion, rows });
            const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
            const fingerprint = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
            for (let retry = 0; retry < 5; retry += 1) {
              if (!await pacer.acquire(() => controller.signal.aborted || stopRequestedRef.current)) return;
              const retryVersion = batchRetryVersionsRef.current.get(sourceIndex) ?? 0;
              balanceSpendVersionRef.current += 1;
              setBalanceDirty(true);
              try {
                const data = await requestReviewBatch(JSON.stringify({
                  model: KEYWORD_REVIEW_MODEL, customBaseUrl: DEEPSEEK_BASE_URL, customApiKey: apiKey,
                  lookup: lookupEnabled, rulesVersion, rows,
                }), controller.signal, `keyword:${fingerprint}:${retryVersion}`);
                pacer.succeeded();
                setRecords((current) => applyBatchResults(current, recordIndicesRef.current, data.results as KeywordReviewResult[]));
                completedNow += chunk.length;
                lookedUpNow += Number(data.lookedUp || 0);
                refreshBalance();
                return;
              } catch (error) {
                const limited = (error as Error & { rateLimited?: boolean }).rateLimited === true;
                if (limited) pacer.rateLimited(retry);
                else pacer.failed();
                if (limited || (error as Error & { modelOutputInvalid?: boolean }).modelOutputInvalid) {
                  batchRetryVersionsRef.current.set(sourceIndex, retryVersion + 1);
                }
                if (limited && retry < 4 && !controller.signal.aborted && !stopRequestedRef.current) {
                  rateLimitRetries += 1;
                  setNotice(`DeepSeek 限流，已降至 ${pacer.concurrency} 个并行请求并等待重试…`);
                  continue;
                }
                refreshBalance(true);
                throw error;
              }
            }
          };
          try {
            await reviewBatchWithRecovery({
              rows: batch,
              submit,
              isModelOutputError: (error) => (error as Error & { modelOutputInvalid?: boolean }).modelOutputInvalid === true,
              shouldStop: () => controller.signal.aborted || stopRequestedRef.current,
              onRetry: (chunk) => setNotice(`模型格式异常，正在自动重试 ${chunk.length} 条…`),
              onSingleRowFailure: (record, error) => {
                const message = error instanceof Error ? error.message : '模型结果异常';
                setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, [record.id],
                  (item) => ({ ...item, status: 'error', error: message })));
                failedNow += 1;
              },
            });
          } catch (error) {
            if (controller.signal.aborted) break;
            runState.fatalError = error instanceof Error ? error : new Error('审核失败');
            setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, ids,
              (record) => record.status === 'running' ? { ...record, status: 'error', error: runState.fatalError?.message } : record));
            stopRequestedRef.current = true;
            break;
          }
        }
      };
      const workerCount = Math.min(mode === 'trial' ? 1 : KEYWORD_REVIEW_CONCURRENCY, Math.ceil(queue.length / KEYWORD_REVIEW_BATCH_SIZE));
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
      setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, queue.map((record) => record.id),
        (record) => record.status === 'running' ? { ...record, status: 'idle' } : record));
      if (runState.fatalError) {
        setNotice(`${runState.fatalError.message}。已保留完成的结果，请处理该异常后继续。`);
        return;
      }
      refreshBalance(true);
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
        setNotice(`批量审核已处理到最后一个词：完成 ${completedNow} 条${failedNow > 0 ? `，仍失败 ${failedNow} 条（可手动重审）` : ''}${lookupNote}${rateLimitRetries > 0 ? `，限流后重试 ${rateLimitRetries} 次` : ''}`);
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
      runStartingRef.current = false;
      setIsRunning(false);
      setRunMode('idle');
    }
  };

  const stopReview = () => {
    if (!abortRef.current) return;
    stopRequestedRef.current = true;
    setNotice('将在当前批次返回后停止，不取消已提交的 DeepSeek 请求');
  };

  const retryFailed = () => {
    if (isRunning) return;
    const failed = records.filter((record) => record.status === 'error');
    if (failed.length === 0) return;
    for (const record of failed) {
      const index = recordIndicesRef.current.get(record.id);
      if (index !== undefined) batchRetryVersionsRef.current.set(index, (batchRetryVersionsRef.current.get(index) ?? 0) + 1);
    }
    setRecords((current) => current.map((record) => record.status === 'error' ? { ...record, status: 'idle', error: undefined } : record));
    setNotice(`已将 ${failed.length} 条失败记录放回待审核队列；再次提交这些记录可能产生新费用`);
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

  return {
    model: KEYWORD_REVIEW_MODEL_LABEL,
    parsed,
    records,
    filter,
    setFilter,
    filteredCount: filteredRecords.length,
    previewRecords,
    previewLimit: PREVIEW_LIMIT,
    sheetSummary,
    counts,
    batchSize: KEYWORD_REVIEW_BATCH_SIZE,
    concurrency: KEYWORD_REVIEW_CONCURRENCY,
    isImporting,
    isRunning,
    runMode,
    isExporting,
    notice,
    lookupEnabled,
    setLookupEnabled,
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
