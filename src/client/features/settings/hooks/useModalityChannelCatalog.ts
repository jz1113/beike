import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { MODALITY_GLOBAL_CHANNEL_ID } from '@shared/domain/models/modalityStorage';
import { loadStoredProviders, type ApiProvider } from '../model/apiProviderTypes';
import { parseRemoteModelFetch } from '../model/remoteModelFetch';
import type { ModalityChannelOption, ModalityGlobalConfig } from '../model/modalityModelTypes';

export interface ModalityChannelLookup {
  name: string;
  missing: boolean;
  baseUrl: string;
  apiKey: string;
}

function buildChannels(globalConfig: ModalityGlobalConfig, providers: ApiProvider[]): ModalityChannelOption[] {
  const selectable = providers.filter((provider) => provider.enabled !== false && provider.baseUrl.trim());
  return [
    {
      id: MODALITY_GLOBAL_CHANNEL_ID,
      name: '全局默认',
      baseUrl: globalConfig.baseUrl.trim(),
      apiKey: globalConfig.apiKey.trim(),
      hasKey: Boolean(globalConfig.apiKey.trim()),
    },
    ...selectable.map((provider) => ({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl.trim(),
      apiKey: provider.apiKey.trim(),
      hasKey: Boolean(provider.apiKey.trim()),
    })),
  ];
}

export function useModalityChannelCatalog(
  globalConfig: ModalityGlobalConfig,
  showToast: (msg: string) => void,
) {
  const [providers, setProviders] = useState<ApiProvider[]>(() => loadStoredProviders());
  const [selectedChannelId, setSelectedChannelId] = useState(MODALITY_GLOBAL_CHANNEL_ID);
  const [remoteModelsByChannel, setRemoteModelsByChannel] = useState<Record<string, string[]>>({});
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);

  const channels = useMemo(() => buildChannels(globalConfig, providers), [globalConfig, providers]);

  const refreshChannels = useCallback(() => setProviders(loadStoredProviders()), []);

  useEffect(() => {
    if (selectedChannelId && !channels.some((channel) => channel.id === selectedChannelId)) {
      setSelectedChannelId(MODALITY_GLOBAL_CHANNEL_ID);
    }
  }, [channels, selectedChannelId]);

  const describeChannel = useCallback((channelId?: string): ModalityChannelLookup => {
    const globalBaseUrl = globalConfig.baseUrl.trim();
    const globalApiKey = globalConfig.apiKey.trim();
    if (!channelId) {
      return { name: '全局默认', missing: false, baseUrl: globalBaseUrl, apiKey: globalApiKey };
    }
    const found = providers.find((provider) => provider.id === channelId);
    if (!found) {
      return { name: '渠道已移除', missing: true, baseUrl: globalBaseUrl, apiKey: globalApiKey };
    }
    return {
      name: found.name,
      missing: false,
      baseUrl: found.baseUrl.trim() || globalBaseUrl,
      apiKey: found.apiKey.trim() || globalApiKey,
    };
  }, [globalConfig.apiKey, globalConfig.baseUrl, providers]);

  const syncChannel = useCallback(async (channelId: string) => {
    const channel = buildChannels(globalConfig, loadStoredProviders()).find((item) => item.id === channelId);
    if (!channel?.baseUrl) {
      showToast(channelId ? `请先在服务商配置中填写「${channel?.name || '该渠道'}」的地址` : '请先配置全局地址');
      return;
    }
    setSyncingChannelId(channelId);
    try {
      const response = await apiFetch('/api/system/models/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: channel.baseUrl,
          apiKey: channel.apiKey,
          strict: false,
        }),
      });
      const data = await response.json().catch(() => ({}));
      const parsed = parseRemoteModelFetch(data);
      if (response.ok && parsed.ok) {
        setRemoteModelsByChannel((prev) => ({ ...prev, [channelId]: parsed.ids }));
        showToast(`已从「${channel.name}」拉取 ${parsed.ids.length} 个模型`);
      } else {
        const errorMsg = parsed.ok ? '同步失败，请检查地址与密钥' : parsed.message;
        showToast(`模型同步提示：${errorMsg}`);
      }
    } catch {
      showToast('同步网络连接失败，请检查网络或跨域设置');
    } finally {
      setSyncingChannelId((current) => (current === channelId ? null : current));
    }
  }, [globalConfig, showToast]);

  return {
    channels,
    selectedChannelId,
    setSelectedChannelId,
    remoteModelsByChannel,
    syncingChannelId,
    isSyncingRemote: syncingChannelId !== null,
    refreshChannels,
    describeChannel,
    syncChannel,
  };
}
