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
import { applyBatchResults, countReviewRecords, selectPreviewRecords, updateReviewRecords } from '../model/reviewProgress';

export const KEYWORD_REVIEW_BATCH_SIZE = 50;
export const KEYWORD_REVIEW_MODEL = 'deepseek-flash';
export const KEYWORD_REVIEW_MODEL_LABEL = 'DeepSeek Flash';
export type KeywordReviewFilter = 'all' | 'done' | 'producible' | 'rejected';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const PREVIEW_LIMIT = 240;
const REVIEW_REQUEST_TIMEOUT_MS = 150_000;
const REVIEW_MAX_ATTEMPTS = 3;

type ReviewResponse = {
  success?: boolean;
  results?: KeywordReviewResult[];
  lookedUp?: number;
  error?: string;
};

type BalanceResponse = {
  success?: boolean;
  currency?: KeywordReviewBalance['currency'];
  total?: string;
  granted?: string;
  toppedUp?: string;
  available?: boolean;
  error?: string;
};

async function waitForRetry(ms: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function requestReviewBatch(
  body: string,
  signal: AbortSignal,
  onRetry: (attempt: number, message: string) => void,
): Promise<ReviewResponse> {
  for (let attempt = 1; attempt <= REVIEW_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await apiFetch('/api/generate/keyword-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(REVIEW_REQUEST_TIMEOUT_MS)]),
      });
      const data = await response.json() as ReviewResponse;
      if (response.ok && data.success && Array.isArray(data.results)) return data;
      const error = new Error(data.error || `审核请求失败（HTTP ${response.status}）`);
      if (response.status === 502 && /输出被截断|结果不完整|不完整 JSON|未返回 results 数组/.test(error.message)) {
        throw Object.assign(error, { splitBatch: true });
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) throw Object.assign(error, { retryable: false });
      throw error;
    } catch (error) {
      if (signal.aborted) throw error;
      const requestError = error as Error & { retryable?: boolean; splitBatch?: boolean };
      if (requestError.retryable === false || requestError.splitBatch || attempt === REVIEW_MAX_ATTEMPTS) throw error;
      onRetry(attempt + 1, requestError.message || '网络响应超时');
      await waitForRetry(1000 * 2 ** (attempt - 1), signal);
    }
  }
  throw new Error('审核请求失败');
}

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
  const abortRef = useRef<AbortController | null>(null);
  const recordIndicesRef = useRef<Map<string, number>>(new Map());

  const refreshBalance = useCallback(async () => {
    const apiKey = (await credentialGet('deepseek_api_key')).trim();
    if (!apiKey) {
      setBalance(null);
      setBalanceError('');
      return;
    }
    try {
      const response = await apiFetch('/api/generate/keyword-review/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customBaseUrl: DEEPSEEK_BASE_URL, customApiKey: apiKey }),
      });
      const data = await response.json() as BalanceResponse;
      if (!response.ok || !data.success || (data.currency !== 'CNY' && data.currency !== 'USD')) {
        setBalance(null);
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
      setBalanceError('');
    } catch (error) {
      setBalance(null);
      setBalanceError(error instanceof Error ? error.message : '余额查询失败');
    }
  }, []);

  useEffect(() => {
    void refreshBalance();
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
    setNotice('');
    setLastTrialIds([]);
    setFilter('all');
    try {
      const next = await parseKeywordWorkbook(file);
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
    if (isRunning || records.length === 0) return;
    const candidates = records.filter((record) => record.status === 'idle' || record.status === 'error');
    if (candidates.length === 0) {
      setNotice('所有记录都已完成审核');
      return;
    }
    const apiKey = (await credentialGet('deepseek_api_key')).trim();
    if (!apiKey) {
      setNotice('未配置 DeepSeek API Key，请到设置里的 DeepSeek 官方服务填写');
      return;
    }
    const queue = mode === 'trial' ? candidates.slice(0, KEYWORD_REVIEW_BATCH_SIZE) : candidates;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setRunMode(mode);
    let completedNow = 0;
    let lookedUpNow = 0;
    let lastBatchIds: string[] = [];
    try {
      for (let index = 0; index < queue.length; index += KEYWORD_REVIEW_BATCH_SIZE) {
        if (controller.signal.aborted) break;
        const batch = queue.slice(index, index + KEYWORD_REVIEW_BATCH_SIZE);
        const ids = batch.map((record) => record.id);
        lastBatchIds = ids;
        setLastTrialIds(ids);
        const remaining = queue.length - completedNow;
        setNotice(mode === 'trial'
          ? `正在试跑 ${batch.length} 条${lookupEnabled ? '，不确定词将联网补查' : ''}…`
          : `正在批量审核 ${batch.length} 条，本轮还剩 ${remaining} 条${lookupEnabled ? '，不确定词将联网补查' : ''}`);
        setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, ids,
          (record) => ({ ...record, status: 'running', error: undefined })));
        const pending: KeywordReviewRecord[][] = [batch];
        while (pending.length > 0) {
          if (controller.signal.aborted) break;
          const chunk = pending.shift() as KeywordReviewRecord[];
          try {
            const data = await requestReviewBatch(JSON.stringify({
              model: KEYWORD_REVIEW_MODEL,
              customBaseUrl: DEEPSEEK_BASE_URL,
              customApiKey: apiKey,
              lookup: lookupEnabled,
              rows: chunk.map(({ id, query, expansion, entityExpansion, contentType }) => ({
                id, query, expansion, entityExpansion, contentType,
              })),
            }), controller.signal, (attempt, message) => {
              setNotice(`本批请求异常（${message}），正在进行第 ${attempt}/${REVIEW_MAX_ATTEMPTS} 次尝试；本轮已完成 ${completedNow} 条`);
            });
            setRecords((current) => applyBatchResults(current, recordIndicesRef.current, data.results as KeywordReviewResult[]));
            completedNow += chunk.length;
            lookedUpNow += Number(data.lookedUp || 0);
            if (completedNow % (KEYWORD_REVIEW_BATCH_SIZE * 10) === 0) void refreshBalance();
          } catch (error) {
            if ((error as Error & { splitBatch?: boolean }).splitBatch && chunk.length > 1) {
              const middle = Math.ceil(chunk.length / 2);
              pending.unshift(chunk.slice(0, middle), chunk.slice(middle));
              setNotice(`本批结果过长，改为较小批次继续审核；本轮已完成 ${completedNow} 条`);
              continue;
            }
            throw error;
          }
        }
      }
      void refreshBalance();
      const lookupNote = lookedUpNow > 0 ? `，联网补查 ${lookedUpNow} 条` : '';
      if (controller.signal.aborted) {
        setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, lastBatchIds,
          (record) => record.status === 'running' ? { ...record, status: 'idle' } : record));
        setNotice(`已停止，本次完成 ${completedNow} 条${lookupNote}，可继续未完成记录`);
      } else if (mode === 'trial') {
        const leftover = candidates.length - completedNow;
        setNotice(leftover > 0
          ? `本批试跑完成 ${completedNow} 条${lookupNote}，还剩 ${leftover} 条未审核`
          : `本批试跑完成 ${completedNow} 条${lookupNote}`);
      } else {
        setNotice(`批量审核完成，本次处理 ${completedNow} 条${lookupNote}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '审核失败';
      setRecords((current) => updateReviewRecords(current, recordIndicesRef.current, lastBatchIds,
        (record) => record.status === 'running'
          ? { ...record, status: controller.signal.aborted ? 'idle' : 'error', error: message }
          : record));
      if (controller.signal.aborted) setNotice(`已停止，本次完成 ${completedNow} 条，可继续未完成记录`);
      else setNotice(`${message}。已保留完成的结果，修复后可继续。`);
    } finally {
      abortRef.current = null;
      setIsRunning(false);
      setRunMode('idle');
    }
  };

  const stopReview = () => abortRef.current?.abort();

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
    stopReview();
    setParsed(null);
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
    isImporting,
    isRunning,
    runMode,
    isExporting,
    notice,
    lookupEnabled,
    setLookupEnabled,
    balance,
    balanceError,
    importFile,
    runReview,
    stopReview,
    exportWorkbook,
    reset,
  };
}
