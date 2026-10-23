import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeywordReviewBalance } from '@shared/contracts/generate';
import { apiFetch } from '@client/shared/api/apiClient';
import { credentialGet } from '@client/shared/api/credentialClient';
import { DEEPSEEK_BASE_URL, type BalanceResponse } from '../model/reviewRequest';

const REFRESH_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 12_000;

export function useKeywordReviewBalance(enabled: boolean) {
  const [balance, setBalance] = useState<KeywordReviewBalance | null>(null);
  const [balanceError, setBalanceError] = useState('');
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState<number | null>(null);
  const [balanceRefreshing, setBalanceRefreshing] = useState(false);
  const [balanceDirty, setBalanceDirty] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const inFlightRef = useRef<Promise<void> | null>(null);
  const pendingRef = useRef(false);
  const pendingForceRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef('');
  const spendVersionRef = useRef(0);

  const markDispatch = useCallback(() => {
    spendVersionRef.current += 1;
    setBalanceDirty(true);
  }, []);

  const refreshBalance = useCallback(function refreshBalance(force = false): void {
    if (!enabledRef.current) return;
    if (inFlightRef.current) {
      pendingRef.current = true;
      pendingForceRef.current ||= force;
      return;
    }
    const delay = force ? 0 : Math.max(0, REFRESH_INTERVAL_MS - (Date.now() - lastAttemptRef.current));
    if (delay > 0) {
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => { timerRef.current = null; refreshBalance(true); }, delay);
      }
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    lastAttemptRef.current = Date.now();
    setBalanceRefreshing(true);
    const requestedSpendVersion = spendVersionRef.current;
    const request = (async () => {
      try {
        const apiKey = (await credentialGet('deepseek_api_key')).trim();
        if (apiKey !== keyRef.current) {
          keyRef.current = apiKey;
          setBalance(null);
          setBalanceUpdatedAt(null);
        }
        if (!apiKey) { setBalanceError(''); return; }
        const response = await apiFetch('/api/generate/keyword-review/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customBaseUrl: DEEPSEEK_BASE_URL, customApiKey: apiKey }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const raw = await response.text();
        let data: BalanceResponse;
        try { data = JSON.parse(raw) as BalanceResponse; }
        catch { throw new Error(`余额服务返回 HTTP ${response.status} 非 JSON 响应，请稍后刷新`); }
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
        if (requestedSpendVersion === spendVersionRef.current) setBalanceDirty(false);
        else pendingRef.current = true;
        setBalanceError('');
      } catch (error) {
        setBalanceError(error instanceof Error ? error.message : '余额查询失败');
      }
    })().finally(() => {
      inFlightRef.current = null;
      setBalanceRefreshing(false);
      if (pendingRef.current) {
        const forceNext = pendingForceRef.current;
        pendingRef.current = false;
        pendingForceRef.current = false;
        refreshBalance(forceNext);
      }
    });
    inFlightRef.current = request;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refreshBalance(true);
    const interval = setInterval(() => refreshBalance(), 30_000);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, refreshBalance]);

  return { balance, balanceError, balanceUpdatedAt, balanceRefreshing, balanceDirty, refreshBalance, markDispatch };
}
