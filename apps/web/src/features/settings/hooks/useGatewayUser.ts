import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../../../lib/apiClient';
import { credentialGet, credentialSet, credentialDelete } from '../../../lib/credentialClient';
import { getGatewayClientOverrides } from '../../../lib/gatewayClient';

export interface GatewayUserInfo {
  id: number | string;
  username: string;
  displayName: string;
  email?: string;
  quota: number;
  usedQuota: number;
  quotaFormatted: number;      // 折算剩余算力
  quotaRmb: number;            // 折合人民币 (1 算力 = ¥1.20)
  usedQuotaFormatted: number;  // 已消耗算力
  usedQuotaRmb: number;        // 已消耗人民币
  remainingPercent: number;    // 剩余额度百分比 (0 - 100)
  requestCount: number;
  group: string;
}

const CACHE_KEY = 'gateway_user_cache_v1';
const USER_ID_KEY = 'gateway_user_id';
const CREDENTIAL_TOKEN_KEY = 'gateway_system_token';

interface UseGatewayUserOptions {
  isOpen?: boolean;
  showToast?: (msg: string) => void;
}

export function useGatewayUser({ isOpen = true, showToast }: UseGatewayUserOptions = {}) {
  const [userId, setUserId] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(USER_ID_KEY)?.trim() || '' : ''
  );
  const [systemToken, setSystemToken] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(CREDENTIAL_TOKEN_KEY)?.trim() || '' : ''
  );
  const [userInfo, setUserInfo] = useState<GatewayUserInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);

  // 避免并发重复拉取
  const isFetchingRef = useRef(false);

  // 1. 初始化读取凭据和本地缓存（本地 localStorage + 安全持久化存储双重读取兜底）
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;
    (async () => {
      try {
        const savedId = localStorage.getItem(USER_ID_KEY)?.trim() || '';
        const savedTokenLocal = localStorage.getItem(CREDENTIAL_TOKEN_KEY)?.trim() || '';
        const savedTokenCred = (await credentialGet(CREDENTIAL_TOKEN_KEY))?.trim() || '';
        const finalToken = savedTokenCred || savedTokenLocal;

        if (!isMounted) return;
        if (savedId) setUserId(savedId);
        if (finalToken) {
          setSystemToken(finalToken);
          try {
            localStorage.setItem(CREDENTIAL_TOKEN_KEY, finalToken);
          } catch {
            /* ignore */
          }
        }

        // 尝试载入本地持久化缓存（秒开回显）
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
          try {
            const parsed = JSON.parse(cachedRaw);
            if (parsed && parsed.user) {
              setUserInfo(parsed.user);
              if (parsed.updatedAt) {
                const date = new Date(parsed.updatedAt);
                setLastUpdated(
                  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                );
              }
            }
          } catch {
            /* ignore invalid cache */
          }
        }
      } finally {
        if (isMounted) setIsReady(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. 刷新用户信息核心逻辑
  const refreshUserInfo = useCallback(
    async (silent: boolean = false, overrideId?: string, overrideToken?: string) => {
      const activeId = (overrideId !== undefined ? overrideId : userId).trim();
      const activeToken = (overrideToken !== undefined ? overrideToken : systemToken).trim();

      if (!activeId || !activeToken) {
        if (!silent) {
          showToast?.('⚠️ 请先配置用户 ID 与个人中心系统访问令牌');
        }
        return false;
      }

      if (isFetchingRef.current) return false;
      isFetchingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const { customBaseUrl } = getGatewayClientOverrides();
        const baseUrl = customBaseUrl || 'https://ai.comfly.org';

        const res = await apiFetch('/api/system/gateway-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseUrl,
            userId: activeId,
            systemToken: activeToken,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success && data.user) {
          const freshUser: GatewayUserInfo = data.user;
          setUserInfo(freshUser);
          const now = Date.now();
          const date = new Date(now);
          const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          setLastUpdated(timeStr);
          setError(null);

          // 存入本地缓存
          try {
            localStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ user: freshUser, updatedAt: now })
            );
          } catch {
            /* ignore */
          }

          if (!silent) {
            showToast?.(`✅ 余额同步成功！剩余算力: ${freshUser.quotaFormatted.toFixed(2)} (约 ¥${freshUser.quotaRmb.toFixed(2)})`);
          }
          return true;
        } else {
          const errMsg = data.error || `拉取失败 (${res.status})`;
          setError(errMsg);
          if (!silent) {
            showToast?.(`🔴 ${errMsg}`);
          }
          return false;
        }
      } catch (err: any) {
        const errMsg = err?.message || '网络连接异常，无法获取余额';
        setError(errMsg);
        if (!silent) {
          showToast?.(`🔴 ${errMsg}`);
        }
        return false;
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    },
    [userId, systemToken, showToast]
  );

  // 3. 自动同步逻辑（当凭据齐备且面板展开时，超过 3 分钟自动拉取一次最新数据）
  useEffect(() => {
    if (!isOpen || !isReady) return;
    if (!userId.trim() || !systemToken.trim()) return;

    let shouldFetch = true;
    try {
      const cachedRaw = localStorage.getItem(CACHE_KEY);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        // 如果上次更新在 3 分钟内，则无需立刻重复拉取
        if (parsed?.updatedAt && Date.now() - parsed.updatedAt < 3 * 60 * 1000) {
          shouldFetch = false;
        }
      }
    } catch {
      shouldFetch = true;
    }

    if (shouldFetch) {
      void refreshUserInfo(true);
    }
  }, [isOpen, isReady, userId, systemToken, refreshUserInfo]);

  // 4. 保存凭据
  const saveCredentials = useCallback(
    async (newId: string, newToken: string) => {
      const cleanId = newId.trim();
      const cleanToken = newToken.trim();

      setUserId(cleanId);
      setSystemToken(cleanToken);

      try {
        if (cleanId) {
          localStorage.setItem(USER_ID_KEY, cleanId);
        } else {
          localStorage.removeItem(USER_ID_KEY);
        }

        if (cleanToken) {
          localStorage.setItem(CREDENTIAL_TOKEN_KEY, cleanToken);
          await credentialSet(CREDENTIAL_TOKEN_KEY, cleanToken);
        } else {
          localStorage.removeItem(CREDENTIAL_TOKEN_KEY);
          await credentialDelete(CREDENTIAL_TOKEN_KEY);
        }
        showToast?.('✅ 网关查询凭据已永久保存在本地，正在同步余额...');
      } catch (e) {
        console.error('保存网关凭据失败:', e);
      }

      if (cleanId && cleanToken) {
        void refreshUserInfo(false, cleanId, cleanToken);
      }
      return true;
    },
    [refreshUserInfo, showToast]
  );

  // 5. 清除凭据
  const clearCredentials = useCallback(async () => {
    setUserId('');
    setSystemToken('');
    setUserInfo(null);
    setLastUpdated(null);
    setError(null);
    try {
      localStorage.removeItem(USER_ID_KEY);
      localStorage.removeItem(CREDENTIAL_TOKEN_KEY);
      localStorage.removeItem(CACHE_KEY);
      await credentialDelete(CREDENTIAL_TOKEN_KEY);
      showToast?.('ℹ️ 已清除网关账户凭据与本地缓存');
    } catch {
      /* ignore */
    }
  }, [showToast]);

  const isConfigured = Boolean(userId.trim() && systemToken.trim());
  const isLowBalance = Boolean(userInfo && userInfo.quotaFormatted < 5);

  return {
    userId,
    systemToken,
    userInfo,
    isLoading,
    isConfigured,
    isLowBalance,
    lastUpdated,
    error,
    refreshUserInfo,
    saveCredentials,
    clearCredentials,
  };
}
