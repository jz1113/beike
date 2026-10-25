import React, { useState, useEffect, useRef } from 'react';
import { SettingsConnectionContext } from '../components/SettingsControls';
import { ApiServicesWanbangPanel } from '../components/vendors/ApiServicesWanbangPanel';
import { ApiServicesApiaPanel } from '../components/vendors/ApiServicesApiaPanel';
import { ApiServicesQiyunPanel } from '../components/vendors/ApiServicesQiyunPanel';
import { ApiServicesStoragePanel } from '../components/storage/ApiServicesStoragePanel';
import { ApiProvidersNavList } from '../components/providers/ApiProvidersNavList';
import { ApiProviderDetailPanel } from '../components/providers/ApiProviderDetailPanel';
import { AddProviderModal } from '../components/providers/AddProviderModal';
import { serviceStatuses } from '../model/serviceStatuses';
import { SERVICE_STATUS_COLORS } from '../components/vendors/ApiServicesNavList';
import { useApiProviders } from '../hooks/useApiProviders';
import { loadStoredProviders } from '../model/apiProviderTypes';
import {
  hasModalityGlobalConfigManualOverride,
  loadStoredModalityGlobalConfig,
} from '../model/modalityModelStorage';
import {
  canonicalProviderId,
  loadSavedProviderCredentialSnapshots,
  propagateProviderCredentials,
  rememberSavedProviderCredentials,
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
  } = useApiProviders({
    isOpen: true,
    showToast,
    onProviderRemoved: (removedId) => {
      // 清理该服务商关联的自定义模型
      const remainingModels = m.customModels.filter(model => {
        return model.channel !== removedId && (model as { providerId?: string }).providerId !== removedId;
      });
      if (remainingModels.length !== m.customModels.length) {
        m.setCustomModels(remainingModels);
      }
    },
  });

  // 如果 selectedServiceId 是集成服务（wanbang, apia, qiyun），或独立存储页的 cloud_storage，保持在这些服务上
  const isIntegrationService = ['wanbang_ecommerce', 'apia_parser', 'qiyun_parser'].includes(selectedServiceId) || (group === 'storage' && selectedServiceId === 'cloud_storage');

  useEffect(() => {
    if (group !== 'storage' && selectedServiceId === 'cloud_storage') {
      const fallbackId = currentProvider?.id || selectedProviderId || 'comfly_gateway';
      setSelectedServiceId(fallbackId);
    }
  }, [group, selectedServiceId, currentProvider?.id, selectedProviderId, setSelectedServiceId]);

  const handleSelectNav = (id: string) => {
    if (['wanbang_ecommerce', 'apia_parser', 'qiyun_parser'].includes(id)) {
      setSelectedServiceId(id);
    } else {
      setSelectedServiceId(id);
      setSelectedProviderId(id);
    }
  };

  const handleSaveCurrentProviderConfig = async () => {
    if (!currentProvider) return;
    setIsSavingProvider(true);
    try {
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
      let saved = true;
      // 同步到对应底层配置
      if (canonicalId === 'comfly_gateway') {
        saved = await c.handleSaveApiConfig(currentCredentials.baseUrl, currentCredentials.apiKey, false);
      } else if (canonicalId === 'openai_official') {
        saved = await c.handleSaveOpenAIConfig(false, currentCredentials);
      } else if (canonicalId === 'deepseek_official') {
        saved = await c.handleSaveDeepSeekConfig(false, currentCredentials.apiKey);
      } else if (canonicalId === 'lianchi_images') {
        saved = await c.handleSaveLianchiConfig(false, currentCredentials.apiKey);
      }
      if (!saved) return;
      const result = propagateProviderCredentials(currentProvider.id, migrationPreviousCredentials, currentCredentials);
      savedProviderCredentialsRef.current[currentProvider.id] = currentCredentials;
      rememberSavedProviderCredentials(currentProvider.id, currentCredentials);
      showToast(result.updated > 0
        ? `「${currentProvider.name}」已保存，已同步 ${result.updated} 处模型凭证`
        : `「${currentProvider.name}」配置已保存`);
    } catch {
      showToast(`保存「${currentProvider.name}」配置失败`);
    } finally {
      setIsSavingProvider(false);
    }
  };

  // 针对集成服务（万邦、APIA、奇云、存储）的状态
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
          {/* 集成服务视图（万邦、APIA、奇云、云端存储） */}
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
                {selectedServiceId === 'apia_parser' && <ApiServicesApiaPanel {...c} />}
                {selectedServiceId === 'qiyun_parser' && <ApiServicesQiyunPanel {...c} />}
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
              isSaving={isSavingProvider}
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
