import type { ReactNode } from 'react';
import { Cpu } from 'lucide-react';
import { useMemo, useCallback } from 'react';
import { API_SERVICES, type WorkflowModel } from '../settingsShared';
import { isMultimodalWorkflowModel } from '@beike/domain/workflowModels';
import { ApiServicesWanbangPanel } from '../components/ApiServicesWanbangPanel';
import { ApiServicesApiaPanel } from '../components/ApiServicesApiaPanel';
import { ApiServicesQiyunPanel } from '../components/ApiServicesQiyunPanel';
import { ApiServicesGatewayPanel } from '../components/ApiServicesGatewayPanel';
import { ApiServicesDeepSeekPanel } from '../components/ApiServicesDeepSeekPanel';
import { ApiServicesLianchiPanel } from '../components/ApiServicesLianchiPanel';
import { ApiServicesStoragePanel, type ApiServicesStoragePanelProps } from '../components/ApiServicesStoragePanel';
import { ApiServicesNavList } from '../components/ApiServicesNavList';
import { useModelDragSort } from '../hooks/useModelDragSort';
import { settingsPanelPad, settingsPanelContainer } from '@/shared/ui/layoutClasses';

export interface ApiServicesTabProps extends ApiServicesStoragePanelProps {
  defaultsPanel?: ReactNode;
  selectedServiceId: string;
  setSelectedServiceId: (id: string) => void;
  serviceSearch: string;
  setServiceSearch: (v: string) => void;
  isGatewayEnabled: boolean;
  setIsGatewayEnabled: (v: boolean) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  appAccessToken: string;
  setAppAccessToken: (v: string) => void;
  handleSaveApiConfig: (url: string, key: string, notify?: boolean) => void;
  handleTestPing: () => void;
  isTesting: boolean;
  deepSeekApiKey: string;
  setDeepSeekApiKey: (v: string) => void;
  showDeepSeekKey: boolean;
  setShowDeepSeekKey: (v: boolean) => void;
  isTestingDeepSeek: boolean;
  handleTestDeepSeek: () => void;
  handleSaveDeepSeekConfig: (activate?: boolean) => void;
  lianchiApiKey: string;
  setLianchiApiKey: (v: string) => void;
  showLianchiKey: boolean;
  setShowLianchiKey: (v: boolean) => void;
  isTestingLianchi: boolean;
  handleTestLianchi: () => void;
  handleSaveLianchiConfig: () => void;
  handleOpenLianchiDiscovery: () => void;
  isFetchingLianchi: boolean;
  lianchiModelCount: number;
  handleOpenGatewayDiscovery: () => void;
  isFetchingGateway: boolean;
  allGatewayModels: unknown[];
  customModels: WorkflowModel[];
  modelSearch: string;
  setModelSearch: (v: string) => void;
  modelCapabilityFilter: 'all' | 'multimodal' | 'image' | 'video';
  setModelCapabilityFilter: (v: 'all' | 'multimodal' | 'image' | 'video') => void;
  handleToggleCapability: (modelId: string, field: 'isMultimodal' | 'isImage' | 'isVideo' | 'isVision' | 'isAssistant' | 'isDistill' | 'isThinking') => void;
  handleDeleteModel: (modelId: string) => void;
  handleMoveModel?: (modelId: string, direction: 'up' | 'down' | 'top') => void;
  handleReorderModels?: (newOrder: WorkflowModel[]) => void;
  handleResetDefaultModels: () => void;
  setIsAddingModelModalOpen: (v: boolean) => void;
  wanbangKey: string;
  setWanbangKey: (v: string) => void;
  wanbangSecret: string;
  setWanbangSecret: (v: string) => void;
  isWanbangEnabled: boolean;
  setIsWanbangEnabled: (v: boolean) => void;
  handleTestWanbang: () => void;
  isTestingWanbang: boolean;
  handleSaveWanbangConfig: () => void;
  scraperId: string;
  setScraperId: (v: string) => void;
  scraperSecret: string;
  setScraperSecret: (v: string) => void;
  handleSaveScraperConfig: () => void;
  handleTestScraper: () => void;
  isTestingScraper: boolean;
  isApiaEnabled: boolean;
  setIsApiaEnabled: (v: boolean) => void;
  qiyunAppId: string;
  setQiyunAppId: (v: string) => void;
  qiyunAppKey: string;
  setQiyunAppKey: (v: string) => void;
  isQiyunEnabled: boolean;
  setIsQiyunEnabled: (v: boolean) => void;
  handleSaveQiyunConfig: () => void;
  handleTestQiyun: () => void;
  isTestingQiyun: boolean;

}

export default function ApiServicesTab({
  defaultsPanel,
  selectedServiceId,
  setSelectedServiceId,
  serviceSearch,
  setServiceSearch,
  isGatewayEnabled,
  setIsGatewayEnabled,
  apiKey,
  setApiKey,
  baseUrl,
  setBaseUrl,
  showKey,
  setShowKey,
  appAccessToken,
  setAppAccessToken,
  handleSaveApiConfig,
  handleTestPing,
  isTesting,
  deepSeekApiKey,
  setDeepSeekApiKey,
  showDeepSeekKey,
  setShowDeepSeekKey,
  isTestingDeepSeek,
  handleTestDeepSeek,
  handleSaveDeepSeekConfig,
  lianchiApiKey,
  setLianchiApiKey,
  showLianchiKey,
  setShowLianchiKey,
  isTestingLianchi,
  handleTestLianchi,
  handleSaveLianchiConfig,
  handleOpenLianchiDiscovery,
  isFetchingLianchi,
  lianchiModelCount,
  handleOpenGatewayDiscovery,
  isFetchingGateway,
  allGatewayModels,
  customModels,
  modelSearch,
  setModelSearch,
  modelCapabilityFilter,
  setModelCapabilityFilter,
  handleToggleCapability,
  handleDeleteModel,
  handleMoveModel,
  handleReorderModels,
  handleResetDefaultModels,
  setIsAddingModelModalOpen,
  wanbangKey,
  setWanbangKey,
  wanbangSecret,
  setWanbangSecret,
  isWanbangEnabled,
  setIsWanbangEnabled,
  handleTestWanbang,
  isTestingWanbang,
  handleSaveWanbangConfig,
  scraperId,
  setScraperId,
  scraperSecret,
  setScraperSecret,
  handleSaveScraperConfig,
  handleTestScraper,
  isTestingScraper,
  isApiaEnabled,
  setIsApiaEnabled,
  qiyunAppId,
  setQiyunAppId,
  qiyunAppKey,
  setQiyunAppKey,
  isQiyunEnabled,
  setIsQiyunEnabled,
  handleSaveQiyunConfig,
  handleTestQiyun,
  isTestingQiyun,
  storageEnabled,
  setStorageEnabled,
  storageProvider,
  setStorageProvider,
  storageAccountId,
  setStorageAccountId,
  storageEndpoint,
  setStorageEndpoint,
  storageAccessKeyId,
  setStorageAccessKeyId,
  storageSecretAccessKey,
  setStorageSecretAccessKey,
  showStorageSecret,
  setShowStorageSecret,
  storageBucketName,
  setStorageBucketName,
  storagePublicDomain,
  setStoragePublicDomain,
  isTestingStorage,
  setIsTestingStorage,
  isMigratingStorage,
  setIsMigratingStorage,
  handleSaveStorageConfig,
  showToast,
}: ApiServicesTabProps) {
  void appAccessToken;
  void setAppAccessToken;

  // 拖拽排序逻辑 Hook
  const {
    draggedModelId,
    dragOverModelId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    onMoveModel,
  } = useModelDragSort({
    customModels,
    modelCapabilityFilter,
    handleMoveModel,
    handleReorderModels,
  });

  const services = useMemo(() => defaultsPanel ? [...API_SERVICES, {
    id: 'defaults', name: '默认业务模型', subTitle: '多模态 · 生图 · 视频',
    category: 'core' as const, renderLogo: (cls?: string) => <Cpu className={cls} />,
    isEnabled: true, tag: '默认调用模型',
  }] : API_SERVICES, [defaultsPanel]);

  const filteredServices = useMemo(() => {
    const q = serviceSearch.toLowerCase().trim();
    if (!q) return services;
    return services.filter(s => {
      const matchName = s.name.toLowerCase().includes(q);
      const matchSub = s.subTitle.toLowerCase().includes(q);
      const matchTag = (s.tag || '').toLowerCase().includes(q);
      return matchName || matchSub || matchTag;
    });
  }, [serviceSearch, services]);

  const filteredModels = useMemo(() => {
    let list = customModels;
    if (modelCapabilityFilter === 'video') {
      list = list.filter(m => m.isVideo);
    } else if (modelCapabilityFilter === 'image') {
      list = list.filter(m => m.isImage);
    } else if (modelCapabilityFilter === 'multimodal') {
      list = list.filter(isMultimodalWorkflowModel);
    }

    if (!modelSearch.trim()) return list;
    const q = modelSearch.toLowerCase().trim();
    return list.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q)
    );
  }, [customModels, modelSearch, modelCapabilityFilter]);

  const isServiceConfigured = useCallback((serviceId: string, defaultEnabled?: boolean) => {
    if (serviceId === 'comfly_gateway') return Boolean(apiKey.trim());
    if (serviceId === 'deepseek_official') return Boolean(deepSeekApiKey.trim());
    if (serviceId === 'lianchi_images') return Boolean(lianchiApiKey.trim());
    if (serviceId === 'wanbang_ecommerce') return Boolean(wanbangKey.trim() && wanbangSecret.trim());
    if (serviceId === 'apia_parser') return Boolean(scraperId.trim() && scraperSecret.trim());
    if (serviceId === 'qiyun_parser') return Boolean(qiyunAppId.trim() && qiyunAppKey.trim());
    if (serviceId === 'cloud_storage') return Boolean(storageEnabled && storageAccountId && storageAccessKeyId);
    return Boolean(defaultEnabled);
  }, [apiKey, deepSeekApiKey, lianchiApiKey, wanbangKey, wanbangSecret, scraperId, scraperSecret, qiyunAppId, qiyunAppKey, storageEnabled, storageAccountId, storageAccessKeyId]);

  return (
    <>
      {/* Middle service list column — 窄屏隐藏，改由详情区顶部下拉选择 */}
      <ApiServicesNavList
        services={filteredServices}
        serviceSearch={serviceSearch}
        setServiceSearch={setServiceSearch}
        selectedServiceId={selectedServiceId}
        setSelectedServiceId={setSelectedServiceId}
        isServiceConfigured={isServiceConfigured}
      />

      {/* Right detail panel */}
      <div className="flex-1 overflow-y-auto bg-white min-h-0 min-w-0 overflow-x-hidden">
        <div className={`${settingsPanelContainer} ${settingsPanelPad} space-y-4 sm:space-y-5`}>
          {/* 窄屏：服务切换下拉 */}
          <div className="md:hidden @[640px]/settings-modal:hidden">
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">接口服务</label>
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 font-medium outline-none cursor-pointer truncate"
            >
              {services.map((service) => (
                <option key={service.id} value={service.id} title={`${service.name} — ${service.subTitle}`}>
                  {service.name.split(' ')[0]}
                </option>
              ))}
            </select>
          </div>
          
          {selectedServiceId === 'defaults' && defaultsPanel}

          {/* 1. 🌟 Comfly AI 大模型网关接口 */}
          {selectedServiceId === 'comfly_gateway' && (
            <ApiServicesGatewayPanel
              isGatewayEnabled={isGatewayEnabled}
              setIsGatewayEnabled={setIsGatewayEnabled}
              apiKey={apiKey}
              setApiKey={setApiKey}
              baseUrl={baseUrl}
              setBaseUrl={setBaseUrl}
              showKey={showKey}
              setShowKey={setShowKey}
              handleSaveApiConfig={handleSaveApiConfig}
              handleTestPing={handleTestPing}
              isTesting={isTesting}
              filteredModels={filteredModels}
              customModels={customModels}
              modelSearch={modelSearch}
              setModelSearch={setModelSearch}
              modelCapabilityFilter={modelCapabilityFilter}
              setModelCapabilityFilter={setModelCapabilityFilter}
              handleToggleCapability={handleToggleCapability}
              handleDeleteModel={handleDeleteModel}
              handleMoveModel={handleMoveModel || onMoveModel}
              handleResetDefaultModels={handleResetDefaultModels}
              handleOpenGatewayDiscovery={handleOpenGatewayDiscovery}
              isFetchingGateway={isFetchingGateway}
              allGatewayModels={allGatewayModels}
              setIsAddingModelModalOpen={setIsAddingModelModalOpen}
              draggedModelId={draggedModelId}
              dragOverModelId={dragOverModelId}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          )}

          {selectedServiceId === 'deepseek_official' && (
            <ApiServicesDeepSeekPanel
              apiKey={deepSeekApiKey}
              setApiKey={setDeepSeekApiKey}
              showKey={showDeepSeekKey}
              setShowKey={setShowDeepSeekKey}
              isTesting={isTestingDeepSeek}
              onTest={handleTestDeepSeek}
              onSave={handleSaveDeepSeekConfig}
            />
          )}

          {selectedServiceId === 'lianchi_images' && (
            <ApiServicesLianchiPanel
              apiKey={lianchiApiKey}
              setApiKey={setLianchiApiKey}
              showKey={showLianchiKey}
              setShowKey={setShowLianchiKey}
              isTesting={isTestingLianchi}
              onTest={handleTestLianchi}
              onSave={handleSaveLianchiConfig}
              onFetchModels={handleOpenLianchiDiscovery}
              isFetchingModels={isFetchingLianchi}
              modelCount={lianchiModelCount}
            />
          )}

          {/* 2. 🌟 万邦电商 */}
          {selectedServiceId === 'wanbang_ecommerce' && (
            <ApiServicesWanbangPanel
              wanbangKey={wanbangKey}
              setWanbangKey={setWanbangKey}
              wanbangSecret={wanbangSecret}
              setWanbangSecret={setWanbangSecret}
              isWanbangEnabled={isWanbangEnabled}
              setIsWanbangEnabled={setIsWanbangEnabled}
              handleSaveWanbangConfig={handleSaveWanbangConfig}
              handleTestWanbang={handleTestWanbang}
              isTestingWanbang={isTestingWanbang}
            />
          )}

          {/* 3. 🌟 APIA 解析 */}
          {selectedServiceId === 'apia_parser' && (
            <ApiServicesApiaPanel
              scraperId={scraperId}
              setScraperId={setScraperId}
              scraperSecret={scraperSecret}
              setScraperSecret={setScraperSecret}
              isApiaEnabled={isApiaEnabled}
              setIsApiaEnabled={setIsApiaEnabled}
              handleSaveScraperConfig={handleSaveScraperConfig}
              handleTestScraper={handleTestScraper}
              isTestingScraper={isTestingScraper}
            />
          )}

          {/* 4. 🌟 奇云解析 */}
          {selectedServiceId === 'qiyun_parser' && (
            <ApiServicesQiyunPanel
              qiyunAppId={qiyunAppId}
              setQiyunAppId={setQiyunAppId}
              qiyunAppKey={qiyunAppKey}
              setQiyunAppKey={setQiyunAppKey}
              isQiyunEnabled={isQiyunEnabled}
              setIsQiyunEnabled={setIsQiyunEnabled}
              handleSaveQiyunConfig={handleSaveQiyunConfig}
              handleTestQiyun={handleTestQiyun}
              isTestingQiyun={isTestingQiyun}
            />
          )}

          {/* 5. 🌟 云端永久对象存储配置 (Cloudflare R2 / OSS / COS / S3) */}
          {selectedServiceId === 'cloud_storage' && (
            <ApiServicesStoragePanel
              storageEnabled={storageEnabled}
              setStorageEnabled={setStorageEnabled}
              storageProvider={storageProvider}
              setStorageProvider={setStorageProvider}
              storageAccountId={storageAccountId}
              setStorageAccountId={setStorageAccountId}
              storageEndpoint={storageEndpoint}
              setStorageEndpoint={setStorageEndpoint}
              storageAccessKeyId={storageAccessKeyId}
              setStorageAccessKeyId={setStorageAccessKeyId}
              storageSecretAccessKey={storageSecretAccessKey}
              setStorageSecretAccessKey={setStorageSecretAccessKey}
              showStorageSecret={showStorageSecret}
              setShowStorageSecret={setShowStorageSecret}
              storageBucketName={storageBucketName}
              setStorageBucketName={setStorageBucketName}
              storagePublicDomain={storagePublicDomain}
              setStoragePublicDomain={setStoragePublicDomain}
              isTestingStorage={isTestingStorage}
              setIsTestingStorage={setIsTestingStorage}
              isMigratingStorage={isMigratingStorage}
              setIsMigratingStorage={setIsMigratingStorage}
              handleSaveStorageConfig={handleSaveStorageConfig}
              showToast={showToast}
            />
          )}
        </div>
      </div>
    </>
  );
}
