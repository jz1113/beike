import React, { useState, useMemo } from 'react';
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
import type { ModelChannel } from '../model/modelManagement';

export default function ApiServicesTab({
  config: c,
  models: m,
  group,
  selectedServiceId,
  setSelectedServiceId,
  serviceSearch,
  setServiceSearch,
  onAddModel,
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

  // 如果 selectedServiceId 是集成服务（wanbang, apia, qiyun, cloud_storage），保持在这些服务上
  const isIntegrationService = ['wanbang_ecommerce', 'apia_parser', 'qiyun_parser', 'cloud_storage'].includes(selectedServiceId);

  // 模型统计映射
  const modelsCountByProvider = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of providers) {
      const count = m.customModels.filter(model => {
        if (p.id === 'google') return model.channel === 'google' || model.id.includes('gemini');
        if (p.id === 'openai_official') return model.channel === 'openai';
        if (p.id === 'deepseek_official') return model.channel === 'deepseek';
        if (p.id === 'comfly_gateway') return model.channel === 'comfly';
        if (p.id === 'lianchi_images') return model.channel === 'lianchi';
        return model.channel === p.id || (model as { providerId?: string }).providerId === p.id;
      }).length;
      map[p.id] = count;
    }
    return map;
  }, [providers, m.customModels]);

  // 当前选中服务商名下的模型列表
  const currentProviderModels = useMemo(() => {
    if (!currentProvider) return [];
    return m.customModels.filter(model => {
      if (currentProvider.id === 'google') return model.channel === 'google' || model.id.includes('gemini');
      if (currentProvider.id === 'openai_official') return model.channel === 'openai';
      if (currentProvider.id === 'deepseek_official') return model.channel === 'deepseek';
      if (currentProvider.id === 'comfly_gateway') return model.channel === 'comfly';
      if (currentProvider.id === 'lianchi_images') return model.channel === 'lianchi';
      return model.channel === currentProvider.id || (model as { providerId?: string }).providerId === currentProvider.id;
    });
  }, [currentProvider, m.customModels]);

  const handleSelectNav = (id: string) => {
    if (['wanbang_ecommerce', 'apia_parser', 'qiyun_parser', 'cloud_storage'].includes(id)) {
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

  const handleDiscoverProviderModels = () => {
    if (!currentProvider) return;
    if (currentProvider.id === 'openai_official') {
      void m.handleOpenOpenAIDiscovery(currentProvider.baseUrl, currentProvider.apiKey, true, true);
    } else if (currentProvider.id === 'lianchi_images') {
      void m.handleOpenLianchiDiscovery(currentProvider.apiKey, true);
    } else if (currentProvider.id === 'comfly_gateway') {
      void m.handleOpenGatewayDiscovery();
    } else {
      void m.handleOpenOpenAIDiscovery(currentProvider.baseUrl, currentProvider.apiKey, true, true);
    }
  };

  const handleToggleModelEnabled = (modelId: string, enabled: boolean) => {
    const updated = m.customModels.map(item =>
      item.id === modelId ? { ...item, enabled } : item
    );
    m.setCustomModels(updated);
  };

  const handleRemoveModel = (modelId: string) => {
    const updated = m.customModels.filter(item => item.id !== modelId);
    m.setCustomModels(updated);
    showToast(`已移除模型 ${modelId}`);
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
          modelsCountByProvider={modelsCountByProvider}
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
            /* 图3、图4参考的现代服务商主视图 */
            <ApiProviderDetailPanel
              provider={currentProvider}
              models={currentProviderModels}
              onUpdateProvider={updateCurrentProvider}
              onSaveProvider={handleSaveCurrentProviderConfig}
              onRemoveProvider={removeProvider}
              onTestProvider={() => void testProvider(currentProvider.id)}
              onFetchModels={handleDiscoverProviderModels}
              onAddManualModel={() => onAddModel((currentProvider.id as ModelChannel) || 'openai')}
              onToggleModelEnabled={handleToggleModelEnabled}
              onRemoveModel={handleRemoveModel}
              isTesting={isTesting}
              isSaving={isSavingProvider}
              isFetchingModels={m.isFetchingOpenAI || m.isFetchingGateway || m.isFetchingLianchi}
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
