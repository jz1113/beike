import React, { useState, useMemo, useEffect } from 'react';
import type { ModalityKind, ModalityModelItem } from '../model/modalityModelTypes';
import {
  MODALITY_TITLES,
  MODALITY_VENDORS_BY_KIND,
  modelMatchesVendor,
} from '../model/modalityMeta';
import { useModalityModels } from '../hooks/useModalityModels';
import { useModalityChannelCatalog } from '../hooks/useModalityChannelCatalog';
import { ModalityModelCard } from './ModalityModelCard';
import { ModalityGlobalConfigCard } from './ModalityGlobalConfigCard';
import { ModalityVendorNav } from './ModalityVendorNav';
import { ModalitySyncModelsModal } from './ModalitySyncModelsModal';
import {
  Sparkles,
  Layers,
  Focus,
} from 'lucide-react';

interface Props {
  kind: ModalityKind;
  showToast: (msg: string) => void;
}

export function ModalityHubView({ kind, showToast }: Props) {
  const {
    globalConfig,
    updateGlobalConfig,
    saveGlobalConfig,
    selectBaseUrl,
    removeBaseUrlFromHistory,
    selectApiKey,
    removeApiKeyFromHistory,
    models,
    focusedModelId,
    setFocusedModelId,
    updateModel,
    setModelAsDefault,
    removeModel,
    batchAddModels,
    batchSyncModels,
    resetToDefaultModels,
  } = useModalityModels(kind, showToast);
  const catalog = useModalityChannelCatalog(globalConfig, showToast);

  const [selectedVendor, setSelectedVendor] = useState<string | null>(
    () => MODALITY_VENDORS_BY_KIND[kind][0]?.id ?? null,
  );
  const [viewMode, setViewMode] = useState<'focused' | 'list'>('focused');
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  const vendors = MODALITY_VENDORS_BY_KIND[kind] || [];
  const activeVendor = vendors.find((vendor) => vendor.id === selectedVendor) || vendors[0];

  useEffect(() => {
    setSelectedVendor(MODALITY_VENDORS_BY_KIND[kind][0]?.id ?? null);
  }, [kind]);

  const handleOpenSync = () => {
    catalog.refreshChannels();
    setIsSyncModalOpen(true);
    const channelId = catalog.selectedChannelId;
    if (!catalog.remoteModelsByChannel[channelId]?.length) {
      void catalog.syncChannel(channelId);
    }
  };

  const channelOf = (model: ModalityModelItem) => catalog.describeChannel(model.channelId);
  const candidatesOf = (model: ModalityModelItem) => (
    catalog.remoteModelsByChannel[model.channelId || '']
    || catalog.remoteModelsByChannel[catalog.selectedChannelId]
    || []
  );

  const filteredModels = useMemo(() => {
    return models.filter((m) => !activeVendor || modelMatchesVendor(m, activeVendor));
  }, [models, activeVendor]);

  const activeFocusedModel = useMemo(() => {
    const focused = models.find((m) => m.id === focusedModelId);
    if (focused && filteredModels.some((m) => m.id === focused.id)) return focused;
    return filteredModels[0];
  }, [focusedModelId, models, filteredModels]);

  const handleSelectVendor = (vendorId: string) => {
    setSelectedVendor(vendorId);
    const vendor = vendors.find((item) => item.id === vendorId);
    if (!vendor) return;
    const vendorModels = models.filter((m) => modelMatchesVendor(m, vendor));
    const target = vendorModels.find((m) => m.isDefault) || vendorModels[0];
    if (target) setFocusedModelId(target.id);
  };

  return (
    <div className="w-full space-y-5 text-slate-900 dark:text-slate-100">
      {MODALITY_TITLES[kind] && (
        <div className="pb-1">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            {MODALITY_TITLES[kind].title}线路设置
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {MODALITY_TITLES[kind].subtitle}
          </p>
        </div>
      )}

      {/* 1. 顶部全局配置卡片（图2与图3下拉快切） */}
      <ModalityGlobalConfigCard
        globalConfig={globalConfig}
        updateGlobalConfig={updateGlobalConfig}
        saveGlobalConfig={saveGlobalConfig}
        selectBaseUrl={selectBaseUrl}
        removeBaseUrlFromHistory={removeBaseUrlFromHistory}
        selectApiKey={selectApiKey}
        removeApiKeyFromHistory={removeApiKeyFromHistory}
        onSyncModels={handleOpenSync}
        isSyncingModels={catalog.isSyncingRemote}
      />

      {/* 2. 厂商快捷药丸导航栏（全量展示 + 左右平滑滚动 + 滚轮横移） */}
      <ModalityVendorNav
        vendors={vendors}
        selectedVendor={selectedVendor}
        onSelectVendor={handleSelectVendor}
      />

      {/* 3. 视图切换 */}
      <div className="flex items-center justify-end py-1">
          <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('focused')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
                viewMode === 'focused'
                  ? 'bg-white dark:bg-[#202328] text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
              title="聚焦控制台模式（单框轻盈切换）"
            >
              <Focus className="w-3.5 h-3.5" />
              <span>聚焦控制台</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-[#202328] text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
              title="全部模型平铺列表模式"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>全部平铺</span>
            </button>
          </div>
      </div>

      {/* 4. 模型区域：聚焦单卡片工作台（默认） vs 列表模式 */}
      {viewMode === 'focused' ? (
        <div className="space-y-3">
          {activeFocusedModel ? (
            <ModalityModelCard
              key={activeFocusedModel.id}
              kind={kind}
              model={activeFocusedModel}
              inheritedBaseUrl={channelOf(activeFocusedModel).baseUrl}
              inheritedApiKey={channelOf(activeFocusedModel).apiKey}
              channelName={activeFocusedModel.channelId ? channelOf(activeFocusedModel).name : undefined}
              channelMissing={Boolean(activeFocusedModel.channelId) && channelOf(activeFocusedModel).missing}
              remoteModelCandidates={candidatesOf(activeFocusedModel)}
              onUpdate={(updates) => updateModel(activeFocusedModel.id, updates)}
              onSetDefault={() => setModelAsDefault(activeFocusedModel)}
              onRemove={() => removeModel(activeFocusedModel.id)}
            />
          ) : (
            <div className="py-12 text-center rounded-2xl bg-slate-50/60 dark:bg-white/[0.02] border border-dashed border-slate-200 dark:border-white/10 space-y-3">
              <Sparkles className="w-6 h-6 text-slate-400 mx-auto" />
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {activeVendor ? `${activeVendor.name} 下还没有模型` : '当前还没有模型'}
              </div>
              <button
                type="button"
                onClick={handleOpenSync}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                从远端拉取并勾选导入
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredModels.length > 0 ? (
            filteredModels.map((item) => {
              const channel = channelOf(item);
              return (
              <ModalityModelCard
                key={item.id}
                kind={kind}
                model={item}
                inheritedBaseUrl={channel.baseUrl}
                inheritedApiKey={channel.apiKey}
                channelName={item.channelId ? channel.name : undefined}
                channelMissing={Boolean(item.channelId) && channel.missing}
                remoteModelCandidates={candidatesOf(item)}
                onUpdate={(updates) => updateModel(item.id, updates)}
                onSetDefault={() => setModelAsDefault(item)}
                onRemove={() => removeModel(item.id)}
              />
              );
            })
          ) : (
            <div className="py-12 text-center rounded-2xl bg-slate-50/60 dark:bg-white/[0.02] border border-dashed border-slate-200 dark:border-white/10 space-y-3">
              <Sparkles className="w-6 h-6 text-slate-400 mx-auto" />
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                未找到符合条件的模型
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
                {activeVendor
                  ? `${activeVendor.name} 下暂无模型，可拉取后勾选导入。`
                  : '当前暂无启用的模型。'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 5. 远端模型同步与导入弹窗 */}
      <ModalitySyncModelsModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        kind={kind}
        baseUrl={catalog.channels.find((channel) => channel.id === catalog.selectedChannelId)?.baseUrl || globalConfig.baseUrl}
        channels={catalog.channels}
        channelId={catalog.selectedChannelId}
        onChannelChange={(channelId) => {
          catalog.setSelectedChannelId(channelId);
          if (!catalog.remoteModelsByChannel[channelId]?.length) void catalog.syncChannel(channelId);
        }}
        remoteModels={catalog.remoteModelsByChannel[catalog.selectedChannelId] || []}
        isSyncing={catalog.syncingChannelId === catalog.selectedChannelId}
        onReSync={() => void catalog.syncChannel(catalog.selectedChannelId)}
        activeModel={activeFocusedModel}
        currentModels={models}
        onBatchSync={(selectedIds, candidateEntries) => {
          const channel = catalog.channels.find((item) => item.id === catalog.selectedChannelId);
          batchSyncModels(selectedIds, candidateEntries, catalog.selectedChannelId, channel?.name || '');
          setIsSyncModalOpen(false);
        }}
        onResetDefaults={resetToDefaultModels}
        onBatchImport={(entries) => {
          const channel = catalog.channels.find((item) => item.id === catalog.selectedChannelId);
          batchAddModels(entries, catalog.selectedChannelId, channel?.name || '');
          setIsSyncModalOpen(false);
        }}
      />
    </div>
  );
}
