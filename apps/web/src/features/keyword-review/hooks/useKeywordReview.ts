import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeywordReviewBalance, KeywordReviewResult } from '@beike/contracts/generate';
import { apiFetch } from '@/shared/api/apiClient';
import { credentialGet } from '@/shared/api/credentialClient';
import {
  applyReviewResults,
  exportReviewedWorkbook,
  parseKeywordWorkbook,
  type KeywordReviewRecord,
  type ParsedKeywordWorkbook,
} from '../model/keywordReviewWorkbook';

export const KEYWORD_REVIEW_BATCH_SIZE = 50;
export const KEYWORD_REVIEW_MODEL = 'deepseek-flash';
export const KEYWORD_REVIEW_MODEL_LABEL = 'DeepSeek Flash';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const PREVIEW_LIMIT = 240;

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

function rankPreview(record: KeywordReviewRecord, lastTrialIds: Set<string>): number {
  if (record.status === 'running') return 0;
  if (record.status === 'error') return 1;
  if (lastTrialIds.has(record.id)) return 2;
  return 3;
}

export function useKeywordReview() {
  const [parsed, setParsed] = useState<ParsedKeywordWorkbook | null>(null);
  const [records, setRecords] = useState<KeywordReviewRecord[]>([]);
  const [lastTrialIds, setLastTrialIds] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [runMode, setRunMode] = useState<'idle' | 'trial' | 'all'>('idle');
  const [lookupEnabled, setLookupEnabled] = useState(false);
  const [balance, setBalance] = useState<KeywordReviewBalance | null>(null);
  const [balanceError, setBalanceError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

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

  const counts = useMemo(() => ({
    total: records.length,
    done: records.filter((record) => record.status === 'done').length,
    failed: records.filter((record) => record.status === 'error').length,
    pending: records.filter((record) => record.status === 'idle').length,
    producible: records.filter((record) => record.producible === '制作').length,
    rejected: records.filter((record) => record.producible === '不制作').length,
  }), [records]);

  const sheetSummary = useMemo(
    () => parsed?.sheets.map((sheet) => `${sheet.name} ${sheet.recordCount} 条`).join('、') || '',
    [parsed],
  );

  const previewRecords = useMemo(() => {
    const last = new Set(lastTrialIds);
    return [...records]
      .sort((left, right) => rankPreview(left, last) - rankPreview(right, last))
      .slice(0, PREVIEW_LIMIT);
  }, [records, lastTrialIds]);

  const importFile = async (file: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setNotice('仅支持 .xlsx、.xls 或 .csv 文件');
      return;
    }
    setIsImporting(true);
    setNotice('');
    setLastTrialIds([]);
    try {
      const next = await parseKeywordWorkbook(file);
      setParsed(next);
      setRecords(next.records);
      const summary = next.sheets.map((sheet) => `${sheet.name} ${sheet.recordCount} 条`).join('、');
      setNotice(`已识别 ${next.records.length} 条关键词：${summary}`);
    } catch (error) {
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
    try {
      for (let index = 0; index < queue.length; index += KEYWORD_REVIEW_BATCH_SIZE) {
        if (controller.signal.aborted) break;
        const batch = queue.slice(index, index + KEYWORD_REVIEW_BATCH_SIZE);
        const ids = new Set(batch.map((record) => record.id));
        setLastTrialIds(batch.map((record) => record.id));
        const remaining = queue.length - completedNow;
        setNotice(mode === 'trial'
          ? `正在试跑 ${batch.length} 条${lookupEnabled ? '，不确定词将联网补查' : ''}…`
          : `正在批量审核 ${batch.length} 条，本轮还剩 ${remaining} 条${lookupEnabled ? '，不确定词将联网补查' : ''}`);
        setRecords((current) => current.map((record) => ids.has(record.id)
          ? { ...record, status: 'running', error: undefined }
          : record));
        const response = await apiFetch('/api/generate/keyword-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: KEYWORD_REVIEW_MODEL,
            customBaseUrl: DEEPSEEK_BASE_URL,
            customApiKey: apiKey,
            lookup: lookupEnabled,
            rows: batch.map(({ id, query, expansion, entityExpansion, contentType }) => ({
              id, query, expansion, entityExpansion, contentType,
            })),
          }),
          signal: controller.signal,
        });
        const data = await response.json() as ReviewResponse;
        if (!response.ok || !data.success || !Array.isArray(data.results)) {
          throw new Error(data.error || `审核请求失败（HTTP ${response.status}）`);
        }
        setRecords((current) => applyReviewResults(current, data.results as KeywordReviewResult[]));
        completedNow += batch.length;
        lookedUpNow += Number(data.lookedUp || 0);
        void refreshBalance();
      }
      const lookupNote = lookedUpNow > 0 ? `，联网补查 ${lookedUpNow} 条` : '';
      if (controller.signal.aborted) {
        setRecords((current) => current.map((record) => record.status === 'running' ? { ...record, status: 'idle' } : record));
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
      setRecords((current) => current.map((record) => record.status === 'running'
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
    if (!parsed || counts.done !== counts.total || counts.total === 0) return;
    setIsExporting(true);
    try {
      const fileName = await exportReviewedWorkbook(parsed, records);
      setNotice(`已导出 ${fileName}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const reset = () => {
    stopReview();
    setParsed(null);
    setRecords([]);
    setLastTrialIds([]);
    setNotice('');
    setRunMode('idle');
  };

  return {
    model: KEYWORD_REVIEW_MODEL_LABEL,
    parsed,
    records,
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
