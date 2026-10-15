import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  type ApiProvider,
  loadStoredProviders,
  saveStoredProviders,
  recordRemovedProvider,
} from '../model/apiProviderTypes';
import { testModelConnection } from '../model/settingsConnectionChecks';

interface UseApiProvidersOptions {
  isOpen: boolean;
  showToast: (msg: string) => void;
  onProviderRemoved?: (providerId: string) => void;
}

export function useApiProviders({ isOpen, showToast, onProviderRemoved }: UseApiProvidersOptions) {
  const [providers, setProviders] = useState<ApiProvider[]>(() => loadStoredProviders());
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => {
    const list = loadStoredProviders();
    return list[0]?.id || 'comfly_gateway';
  });
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; timestamp: number }>>({});

  useEffect(() => {
    if (isOpen) {
      const list = loadStoredProviders();
      setProviders(list);
      if (!list.some(p => p.id === selectedProviderId)) {
        setSelectedProviderId(list[0]?.id || 'comfly_gateway');
      }
    }
  }, [isOpen]);

  const currentProvider = useMemo(() => {
    return providers.find(p => p.id === selectedProviderId) || providers[0];
  }, [providers, selectedProviderId]);

  const updateCurrentProvider = useCallback((updates: Partial<ApiProvider>) => {
    if (!currentProvider) return;
    setProviders(prev => {
      const next = prev.map(p => p.id === currentProvider.id ? { ...p, ...updates } : p);
      saveStoredProviders(next);
      return next;
    });
  }, [currentProvider]);

  const addProvider = useCallback((newInfo: Omit<ApiProvider, 'id' | 'isRemovable'>) => {
    const id = `provider_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const created: ApiProvider = {
      ...newInfo,
      id,
      isRemovable: true,
      isCustom: true,
    };
    setProviders(prev => {
      const next = [...prev, created];
      saveStoredProviders(next);
      return next;
    });
    setSelectedProviderId(id);
    showToast(`已添加服务商「${created.name}」`);
    return id;
  }, [showToast]);

  const removeProvider = useCallback((id: string) => {
    const target = providers.find(p => p.id === id);
    if (!target) return false;

    recordRemovedProvider(id);
    const nextList = providers.filter(p => p.id !== id);
    setProviders(nextList);
    saveStoredProviders(nextList);

    if (selectedProviderId === id) {
      const fallback = nextList[0]?.id || '';
      setSelectedProviderId(fallback);
    }

    onProviderRemoved?.(id);
    showToast(`已移除服务商「${target.name}」`);
    return true;
  }, [providers, selectedProviderId, onProviderRemoved, showToast]);

  const testProvider = useCallback(async (providerId?: string) => {
    const target = providers.find(p => p.id === (providerId || selectedProviderId));
    if (!target) return;
    if (!target.apiKey.trim()) {
      showToast('请先输入该服务商的 API 密钥');
      return;
    }
    setIsTesting(true);
    try {
      const outcome = await testModelConnection(target.name, {
        provider: target.providerType,
        baseUrl: target.baseUrl.trim(),
        apiKey: target.apiKey.trim(),
      });
      setTestResults(prev => ({
        ...prev,
        [target.id]: {
          ok: outcome.ok,
          message: outcome.message,
          timestamp: Date.now(),
        },
      }));
      showToast(outcome.message);
    } catch {
      setTestResults(prev => ({
        ...prev,
        [target.id]: {
          ok: false,
          message: `${target.name} 连接测试失败，请检查网络或参数`,
          timestamp: Date.now(),
        },
      }));
      showToast(`${target.name} 连接测试失败，请检查网络或参数`);
    } finally {
      setIsTesting(false);
    }
  }, [providers, selectedProviderId, showToast]);

  return {
    providers,
    selectedProviderId,
    setSelectedProviderId,
    currentProvider,
    updateCurrentProvider,
    addProvider,
    removeProvider,
    testProvider,
    isTesting,
    testResults,
  };
}
