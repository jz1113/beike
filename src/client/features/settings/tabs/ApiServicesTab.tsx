import { waitForCredentialSaves } from '@client/shared/api/persistCredentials';
import React, { useState, useEffect, useRef } from 'react';
import { SettingsConnectionContext } from '../components/SettingsControls';
import { ApiServicesWanbangPanel } from '../components/vendors/ApiServicesWanbangPanel';
import { ApiServicesStoragePanel } from '../components/storage/ApiServicesStoragePanel';
import { ApiProvidersNavList } from '../components/providers/ApiProvidersNavList';
import { ApiProviderDetailPanel } from '../components/providers/ApiProviderDetailPanel';
import { AddProviderModal } from '../components/providers/AddProviderModal';
import { serviceStatuses } from '../model/serviceStatuses';
import { SERVICE_STATUS_COLORS } from '../model/connectionStatus';
import { useApiProviders } from '../hooks/useApiProviders';
import { loadStoredProviders } from '../model/apiProviderTypes';
import {
  hasModalityGlobalConfigManualOverride,
  loadStoredModalityGlobalConfig,
} from '../model/modalityModelStorage';
import {
  canonicalProviderId,
  loadSavedProviderCredentialSnapshots,
} from '../model/providerCredentialSync';
import type { ApiServicesTabProps } from './apiServicesTabTypes';

function initialProviderCredentialSnapshots(): Record<string, { baseUrl: string; apiKey: string }> {
  const remembered = loadSavedProviderCredentialSnapshots();
  return Object.fromEntries(loadStoredProviders().map(provider => [provider.id, remembered[provider.id] || {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  }]));
}

export default function ApiServicesTab({
  config: c,
  models: m,
  group,
  selectedServiceId,
  setSelectedServiceId,
  serviceSearch,
  setServiceSearch,
  showToast,
}: ApiServicesTabProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const savedProviderCredentialsRef = useRef<Record<string, { baseUrl: string; apiKey: string }>>(initialProviderCredentialSnapshots());

  const {
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
    saveProvider,
  } = useApiProviders({
    isOpen: true,
    showToast,
    onProviderRemoved: () => m.reloadStoredModels(),
  });

  // 如果 selectedServiceId 是集成服务（wanbang），或独立存储页的 cloud_storage，保持在这些服务上
  const isIntegrationService = selectedServiceId === 'wanbang_ecommerce' || (group === 'storage' && selectedServiceId === 'cloud_storage');

  useEffect(() => {
    if (group !== 'storage' && selectedServiceId === 'cloud_storage') {
      const fallbackId = currentProvider?.id || selectedProviderId || 'comfly_gateway';
      setSelectedServiceId(fallbackId);
    }
  }, [group, selectedServiceId, currentProvider?.id, selectedProviderId, setSelectedServiceId]);

  const handleSelectNav = (id: string) => {
    if (id === 'wanbang_ecommerce') {
      setSelectedServiceId(id);
    } else {
      setSelectedServiceId(id);
      setSelectedProviderId(id);
    }
  };

  const handleSaveCurrentProviderConfig = async () => {
    if (!currentProvider || !c.configLoaded) return;
    setIsSavingProvider(true);
    try {
      await waitForCredentialSaves();
      const currentCredentials = {
        baseUrl: currentProvider.baseUrl.trim(),
        apiKey: currentProvider.apiKey.trim(),
      };
      const canonicalId = canonicalProviderId(currentProvider.id);
      const previousCredentials = canonicalId === 'comfly_gateway'
        ? { baseUrl: c.gatewaySavedConfig?.baseUrl ?? c.baseUrl, apiKey: c.gatewaySavedConfig?.apiKey ?? c.apiKey }
        : canonicalId === 'openai_official'
          ? { baseUrl: c.openAIBaseUrl, apiKey: c.openAIApiKey }
          : canonicalId === 'deepseek_official'
            ? { baseUrl: 'https://api.deepseek.com', apiKey: c.deepSeekApiKey }
            : canonicalId === 'lianchi_images'
              ? { baseUrl: '', apiKey: c.lianchiApiKey }
              : savedProviderCredentialsRef.current[currentProvider.id] || { baseUrl: '', apiKey: '' };
      const legacyGlobalConfig = loadStoredModalityGlobalConfig();
      const migrationPreviousCredentials = canonicalId === 'comfly_gateway'
        && !hasModalityGlobalConfigManualOverride()
        && (legacyGlobalConfig.apiKey.trim() !== currentCredentials.apiKey
          || legacyGlobalConfig.baseUrl.trim().replace(/\/+$/, '').toLowerCase()
            !== currentCredentials.baseUrl.replace(/\/+$/, '').toLowerCase())
        ? { baseUrl: legacyGlobalConfig.baseUrl, apiKey: legacyGlobalConfig.apiKey }
        : previousCredentials;
      const result = saveProvider(currentProvider, migrationPreviousCredentials, {
        openAI: { enabled: c.openAIEnabled, allowInsecureHttp: c.openAIAllowInsecureHttp },
      });
      savedProviderCredentialsRef.current[currentProvider.id] = currentCredentials;
      m.reloadStoredModels();
      c.reloadConfig();
      showToast(result.updated > 0
        ? `「${currentProvider.name}」已保存，已同步 ${result.updated} 处模型凭证`
        : `「${currentProvider.name}」配置已保存`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : `保存「${currentProvider.name}」配置失败`);
    } finally {
      setIsSavingProvider(false);
    }
  };

  // 针对集成服务（万邦、存储）的状态
  const statuses = serviceStatuses(c);
  const status = statuses[selectedServiceId] || {
    state: 'unconfigured' as const,
    label: '未配置',
    detail: '未检测',
  };

  return (
    <>
      {group !== 'storage' && (
        <ApiProvidersNavList
          providers={providers}
          selectedId={isIntegrationService ? selectedServiceId : (currentProvider?.id || selectedProviderId)}
          onSelect={handleSelectNav}
          onOpenAddModal={() => setIsAddModalOpen(true)}
          searchQuery={serviceSearch}
          onSearchChange={setServiceSearch}
          testResults={testResults}
        />
      )}

      <div className="settings-page-scroll flex-1 min-w-0 overflow-y-auto">
        <div className="settings-page-content w-full p-4 lg:p-6 space-y-4">
          {/* 集成服务视图（万邦、云端存储） */}
          {isIntegrationService ? (
            <form className="settings-config-card" onSubmit={e => e.preventDefault()}>
              <SettingsConnectionContext.Provider
                value={
                  <span
                    role="status"
                    title={status.detail}
                    className={`settings-connection-status inline-flex items-center gap-1.5 text-xs font-medium ${SERVICE_STATUS_COLORS[status.state]}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {status.label}
                  </span>
                }
              >
                {selectedServiceId === 'wanbang_ecommerce' && <ApiServicesWanbangPanel {...c} />}
                {selectedServiceId === 'cloud_storage' && <ApiServicesStoragePanel {...c} showToast={showToast} />}
              </SettingsConnectionContext.Provider>
            </form>
          ) : currentProvider ? (
            /* 现代服务商配置主视图 */
            <ApiProviderDetailPanel
              provider={currentProvider}
              onUpdateProvider={updateCurrentProvider}
              onSaveProvider={handleSaveCurrentProviderConfig}
              onRemoveProvider={removeProvider}
              onTestProvider={() => void testProvider(currentProvider.id)}
              isTesting={isTesting}
              isSaving={isSavingProvider || !c.configLoaded}
              testOutcome={testResults[currentProvider.id]}
            />
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              请选择或添加一个服务商
            </div>
          )}
        </div>
      </div>

      {/* 添加服务商模态窗 */}
      <AddProviderModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addProvider}
      />
    </>
  );
}
