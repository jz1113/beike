import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { credentialGet, credentialSetBatch } from '@client/shared/api/credentialClient';
import { getGatewayClientOverrides } from '@client/shared/api/gatewayClient';
import { formatUsageCost, formatUsageDate } from '../model/usageFormatting';
import { gatewayAccountKey, isGatewayUserInfo, readGatewayCache } from './gatewayUserCache';

import type { GatewayUserInfo } from '../model/gatewayUserTypes';
export type { GatewayUserInfo } from '../model/gatewayUserTypes';

const CACHE_KEY = 'gateway_user_cache_v1';
const USER_ID_KEY = 'gateway_user_id';
const CREDENTIAL_TOKEN_KEY = 'gateway_system_token';
const CACHE_TTL = 3 * 60 * 1000;
function readLocal(key: string): string { try { return localStorage.getItem(key)?.trim() || ''; } catch { return ''; } }

interface UseGatewayUserOptions {
  isOpen?: boolean;
  showToast?: (msg: string) => void;
}

export function useGatewayUser({ isOpen = true, showToast }: UseGatewayUserOptions = {}) {
  const [userId, setUserId] = useState(() => readLocal(USER_ID_KEY));
  const [systemToken, setSystemToken] = useState('');
  const [userInfo, setUserInfo] = useState<GatewayUserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const requestVersion = useRef(0);
  const credentialsVersion = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const credentialsBusy = useRef(false);
  const baseUrl = getGatewayClientOverrides().customBaseUrl || 'https://ai.comfly.org';

  const invalidateRequest = useCallback(() => {
    requestVersion.current += 1;
    requestController.current?.abort();
    requestController.current = null;
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const version = credentialsVersion.current;
    void credentialGet(CREDENTIAL_TOKEN_KEY).then((token) => {
      if (active && version === credentialsVersion.current) setSystemToken(token.trim());
    }).catch(() => {
      if (active) setError('账户查询凭据读取失败，请重新配置。');
    }).finally(() => { if (active) setIsReady(true); });
    return () => { active = false; requestVersion.current += 1; requestController.current?.abort(); };
  }, []);

  const refreshUserInfo = useCallback(async (silent = false, overrideId?: string, overrideToken?: string) => {
    const activeId = (overrideId ?? userId).trim();
    const activeToken = (overrideToken ?? systemToken).trim();
    if (!activeId || !activeToken) {
      if (!silent) showToast?.('请先配置用户 ID 与个人中心系统访问令牌。');
      return false;
    }
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const version = ++requestVersion.current;
    const accountKey = gatewayAccountKey(activeId, baseUrl);
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/system/gateway-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, userId: activeId, systemToken: activeToken, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (version !== requestVersion.current || controller.signal.aborted) return false;
      if (!response.ok || !data.success || !isGatewayUserInfo(data.user)) {
        throw new Error(typeof data.error === 'string' ? data.error : `余额数据不可用（HTTP ${response.status}）`);
      }
      const user: GatewayUserInfo = data.user;
      const updatedAt = Date.now();
      setUserInfo(user);
      setLastUpdated(formatUsageDate(updatedAt));
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ accountKey, user, updatedAt })); } catch { /* Cache is optional. */ }
      if (!silent) showToast?.(user.balanceAvailable === false ? '账户已同步，网关未提供可用余额信息。' : `余额已同步：${formatUsageCost(user.quotaFormatted)} 算力（约 ¥${formatUsageCost(user.quotaRmb)}）。`);
      return true;
    } catch (reason: unknown) {
      if (version !== requestVersion.current || controller.signal.aborted) return false;
      const message = reason instanceof Error ? reason.message : '网络连接异常，无法获取余额。';
      setError(message);
      if (!silent) showToast?.(message);
      return false;
    } finally {
      if (version === requestVersion.current) { requestController.current = null; setIsLoading(false); }
    }
  }, [userId, systemToken, baseUrl, showToast]);

  useEffect(() => {
    invalidateRequest();
    setUserInfo(null);
    setLastUpdated(null);
    if (!isOpen || !isReady || !userId.trim() || !systemToken.trim()) return;
    const cached = readGatewayCache(readLocal(CACHE_KEY), gatewayAccountKey(userId, baseUrl));
    if (cached) { setUserInfo(cached.user); setLastUpdated(formatUsageDate(cached.updatedAt)); }
    if (!cached || Date.now() - cached.updatedAt >= CACHE_TTL) void refreshUserInfo(true);
  }, [isOpen, isReady, userId, systemToken, baseUrl, refreshUserInfo, invalidateRequest]);

  const saveCredentials = useCallback(async (newId: string, newToken: string) => {
    const cleanId = newId.trim();
    const cleanToken = newToken.trim();
    if (!cleanId || !cleanToken || credentialsBusy.current) return false;
    credentialsBusy.current = true;
    try {
      await credentialSetBatch([[CREDENTIAL_TOKEN_KEY, cleanToken]], { [USER_ID_KEY]: cleanId, [CACHE_KEY]: null });
      credentialsVersion.current += 1;
      invalidateRequest();
      setUserId(cleanId);
      setSystemToken(cleanToken);
      setUserInfo(null);
      setLastUpdated(null);
      setError(null);
      showToast?.('账户查询凭据已保存，正在同步余额。');
      // The credentials effect refreshes changed accounts. Also refresh an unchanged account explicitly.
      if (cleanId === userId && cleanToken === systemToken) void refreshUserInfo(false, cleanId, cleanToken);
      return true;
    } catch {
      setError('账户查询凭据保存失败，请重试。');
      showToast?.('账户查询凭据保存失败，请重试。');
      return false;
    } finally { credentialsBusy.current = false; }
  }, [userId, systemToken, invalidateRequest, refreshUserInfo, showToast]);

  const clearCredentials = useCallback(async () => {
    if (credentialsBusy.current) return false;
    credentialsBusy.current = true;
    try {
      await credentialSetBatch([[CREDENTIAL_TOKEN_KEY, '']], { [USER_ID_KEY]: null, [CACHE_KEY]: null });
      credentialsVersion.current += 1;
      invalidateRequest();
      setUserId(''); setSystemToken(''); setUserInfo(null); setLastUpdated(null); setError(null);
      showToast?.('已清除网关账户凭据与余额缓存。');
      return true;
    } catch {
      const message = '账户查询凭据清除失败，请重试。';
      setError(message); showToast?.(message); return false;
    } finally { credentialsBusy.current = false; }
  }, [invalidateRequest, showToast]);

  return {
    userId, systemToken, userInfo, isLoading, lastUpdated, error,
    isConfigured: Boolean(userId.trim() && systemToken.trim()),
    isLowBalance: Boolean(userInfo && userInfo.balanceAvailable !== false && userInfo.quotaFormatted < 5),
    refreshUserInfo, saveCredentials, clearCredentials,
  };
}
