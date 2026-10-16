import React, { useState, useEffect } from 'react';
import { SettingsConnectionContext } from '../components/SettingsControls';
import { ApiServicesWanbangPanel } from '../components/ApiServicesWanbangPanel';
import { ApiServicesApiaPanel } from '../components/ApiServicesApiaPanel';
import { ApiServicesQiyunPanel } from '../components/ApiServicesQiyunPanel';
import { ApiServicesStoragePanel } from '../components/ApiServicesStoragePanel';
import { ApiProvidersNavList } from '../components/ApiProvidersNavList';
import { ApiProviderDetailPanel } from '../components/ApiProviderDetailPanel';
import { AddProviderModal } from '../components/AddProviderModal';
import { serviceStatuses } from '../model/serviceStatuses';
import { SERVICE_STATUS_COLORS } from '../components/ApiServicesNavList';
import { useApiProviders } from '../hooks/useApiProviders';
import type { ApiServicesTabProps } from './apiServicesTabTypes';

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
      // 同步到对应底层配置
      if (currentProvider.id === 'comfly_gateway') {
        await c.handleSaveApiConfig(currentProvider.baseUrl, currentProvider.apiKey, true);
      } else if (currentProvider.id === 'openai_official') {
        c.setOpenAIBaseUrl(currentProvider.baseUrl);
        c.setOpenAIApiKey(currentProvider.apiKey);
        await c.handleSaveOpenAIConfig();
      } else if (currentProvider.id === 'deepseek_official') {
        c.setDeepSeekApiKey(currentProvider.apiKey);
        await c.handleSaveDeepSeekConfig();
      } else if (currentProvider.id === 'lianchi_images') {
        c.setLianchiApiKey(currentProvider.apiKey);
        await c.handleSaveLianchiConfig();
      }
      showToast(`「${currentProvider.name}」配置已保存`);
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
