import './settingsWorkspace.css';
import { settingsSectionLabel, SETTINGS_NAV_ITEMS, type CanvasSettingsPage, type SettingsNavSection } from './model/settingsNavigation';
import { CanvasPreview, LanguagePreview, ModalityPreview, PrivacyPreview, StoragePreviewNote } from './components/SettingsPreview';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '@client/shared/hooks/useToast';
import { SettingsSidebar } from './components/SettingsSidebar';
import { X } from 'lucide-react';
import { useSettingsLeaveGuard } from './hooks/useSettingsLeaveGuard';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import { getUsageSummary, type UsageSummary } from '@client/shared/utils/usageTracker';
import { getStoredMultimodalModelId, workflowModelRouteId } from '@shared/domain/models/workflowModels';
import GatewayModelModal from './components/GatewayModelModal';
import ApiServicesTab from './tabs/ApiServicesTab';
import DefaultsTab from './tabs/DefaultsTab';
import { ModelManagementPanel } from './components/ModelManagementPanel';
import { MODEL_CHANNELS, type ModelChannel } from './model/modelManagement';
import UsageTab from './tabs/UsageTab';
import AddModelModal from './components/AddModelModal';
import { useSystemConfigQuery } from './hooks/useSystemConfigQuery';
import { useSettingsConfig } from './hooks/useSettingsConfig';
import { useCustomModels } from './hooks/useCustomModels';
import { useGatewayUser } from './hooks/useGatewayUser';

interface Props {
  onBack?: () => void;
}

export default function SettingsWorkspaceView({ onBack }: Props) {
  void useSystemConfigQuery(true);

  const {
    backFromSettings,
    setSelectedVisionModel,
    setSelectedImageGenModel,
    quickVideoModel,
    setQuickVideoModel,
  } = useAppStore(
    useShallow((s) => ({
      backFromSettings: s.backFromSettings,
      setSelectedVisionModel: s.setSelectedVisionModel,
      setSelectedImageGenModel: s.setSelectedImageGenModel,
      quickVideoModel: s.quickVideoModel,
      setQuickVideoModel: s.setQuickVideoModel,
    }))
  );

  const leaveSettings = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      backFromSettings();
    }
  }, [onBack, backFromSettings]);

  // Toast 提示
  const { message: toastMsg, show: showToast } = useToast();

  // 1. 左侧大类导航
  const [navSection, setNavSection] = useState<SettingsNavSection>('api');
  const [canvasPage, setCanvasPage] = useState<CanvasSettingsPage>('connections');
  const [showModelBoard, setShowModelBoard] = useState(false);

  // 2. 中间选中的 API 接口
  const [selectedServiceId, setSelectedServiceId] = useState<string>('comfly_gateway');
  const [serviceSearch, setServiceSearch] = useState('');

  // 3. 用量统计面板状态
  const [usageRange, setUsageRange] = useState<'30d' | '90d' | '1y'>('30d');
  const [usageModelSearch, setUsageModelSearch] = useState<string>('');
  const [usageRefreshKey, setUsageRefreshKey] = useState<number>(0);

  const usageSummary: UsageSummary = useMemo(() => {
    void usageRefreshKey;
    return getUsageSummary(usageRange);
  }, [usageRange, usageRefreshKey]);

  // 网关账户与余额 Hook
  const gatewayUser = useGatewayUser({ isOpen: true, showToast });

  // 4. 服务接口配置 Hook
  const config = useSettingsConfig({ isOpen: true, showToast });

  // 5. 自定义模型库 Hook
  const models = useCustomModels({
    isOpen: true,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    showToast,
  });

  // 6. 手动添加模型模态窗
  const [isAddingModelModalOpen, setIsAddingModelModalOpen] = useState(false);
  const [addingChannel, setAddingChannel] = useState<ModelChannel>('comfly');
  const busy = config.isSavingConfig || config.isMigratingStorage;
  const handleBackToApp = useSettingsLeaveGuard(config.hasUnsavedChanges, leaveSettings, busy, showToast);
  const changeSection = (section: SettingsNavSection) => {
    if (busy) { showToast('配置保存或存储迁移正在进行，请等待当前操作完成'); return; }
    setShowModelBoard(false);
    setNavSection(section);
  };
  const changeService = (setter: (id: string) => void, id: string) => {
    if (busy) { showToast('请等待当前配置保存或存储迁移完成'); return; }
    setter(id);
  };
  const { isGatewayModalOpen, closeGatewayDiscovery } = models;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (isAddingModelModalOpen) { event.preventDefault(); setIsAddingModelModalOpen(false); return; }
      if (isGatewayModalOpen) { event.preventDefault(); closeGatewayDiscovery(); return; }
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault(); handleBackToApp();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBackToApp, isAddingModelModalOpen, isGatewayModalOpen, closeGatewayDiscovery]);
  const openAddModel = (channel: ModelChannel) => { setAddingChannel(channel); setIsAddingModelModalOpen(true); };
  const configureChannel = (channel: ModelChannel) => {
    if (busy) { showToast('请等待当前配置保存或存储迁移完成'); return; }
    setSelectedServiceId(MODEL_CHANNELS.find(item => item.id === channel)!.serviceId);
    setServiceSearch('');
    setShowModelBoard(false);
    setNavSection('api');
  };
  const discoverModels = (channel: ModelChannel) => {
    if (channel === 'deepseek') { configureChannel(channel); return; }
    if (channel === 'openai') void models.handleOpenOpenAIDiscovery(config.openAIBaseUrl, config.openAIApiKey, config.openAIAllowInsecureHttp, true);
    else if (channel === 'lianchi') void models.handleOpenLianchiDiscovery(config.lianchiApiKey, true);
    else void models.handleOpenGatewayDiscovery();
  };

  // 7. 业务默认模型路由状态
  const [activeVisionModel, setActiveVisionModel] = useState('gemini-3.1-pro-preview');
  const [, setActiveAssistantModel] = useState('gpt-5.6-luna');
  const [activeImageGenModel, setActiveImageGenModel] = useState('gpt-image-2');
  const [activeVideoGenModel, setActiveVideoGenModel] = useState('doubao-seedance-2.5');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedVision = getStoredMultimodalModelId();
      setActiveVisionModel(savedVision);

      const savedImage = localStorage.getItem('ai_image_gen_model');
      if (savedImage) setActiveImageGenModel(savedImage);

      const savedVideo = localStorage.getItem('ai_video_gen_model');
      if (savedVideo) {
        setActiveVideoGenModel(savedVideo);
      } else if (quickVideoModel) {
        setActiveVideoGenModel(quickVideoModel);
      }
    }
  }, [quickVideoModel]);

  const activeTitle = useMemo(() => showModelBoard ? '模型管理' : settingsSectionLabel(navSection, canvasPage), [showModelBoard, navSection, canvasPage]);

  const gatewayBalanceFormatted = gatewayUser.userInfo?.balanceAvailable === false ? undefined : gatewayUser.userInfo?.quotaFormatted;
  const storageOpen = navSection === 'storage' || (navSection === 'canvas' && canvasPage === 'media');

  return (
    <div className="settings-workspace fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-8 text-slate-900 font-sans" role="presentation">
      <button type="button" aria-label="关闭设置" className="absolute inset-0 bg-slate-900/35" onClick={handleBackToApp} />
      {toastMsg && (
        <div role="status" aria-live="polite" className="max-w-[calc(100%-2rem)] break-words absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl flex items-center gap-2 border border-slate-700 animate-fade-in">
          <span>{toastMsg}</span>
        </div>
      )}
      <div role="dialog" aria-modal="true" aria-label="设置" className="settings-shell relative flex h-[min(880px,100%)] w-[min(1080px,100%)] overflow-hidden rounded-[28px] shadow-2xl">
        <button type="button" onClick={handleBackToApp} aria-label="关闭" className="absolute right-4 top-4 z-30 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900">
          <X className="h-4 w-4" />
        </button>
        <SettingsSidebar navSection={navSection} setNavSection={changeSection} canvasPage={canvasPage} setCanvasPage={setCanvasPage} gatewayBalanceFormatted={gatewayBalanceFormatted} />
        <main className="flex-1 min-w-0 h-full flex flex-col bg-white overflow-hidden relative z-10">
          <div className="h-16 px-6 md:px-8 border-b border-slate-100 bg-white flex items-center shrink-0">
            <h1 className="pr-10 text-base sm:text-lg font-semibold text-slate-900 tracking-tight truncate">{activeTitle}</h1>
          </div>
          <div className="md:hidden px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <select aria-label="设置分类" value={navSection} onChange={event => changeSection(event.target.value as SettingsNavSection)} className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-xs">
              {SETTINGS_NAV_ITEMS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            {navSection === 'canvas' && (
              <select aria-label="画布功能" value={canvasPage} onChange={event => setCanvasPage(event.target.value as CanvasSettingsPage)} className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-xs">
                {['connections', 'board', 'nodes', 'actions', 'token', 'media', 'pet', 'jimeng', 'codex', 'upscale'].map(id => <option key={id} value={id}>{settingsSectionLabel('canvas', id as CanvasSettingsPage)}</option>)}
              </select>
            )}
          </div>
          {!config.configLoaded && (navSection === 'api' || storageOpen) && <div role={config.configLoadError ? 'alert' : 'status'} className="px-5 py-3 text-xs text-slate-600 border-b border-slate-100">
            {config.configLoadError || '正在加载服务配置…'}
            {config.configLoadError && <button type="button" onClick={() => void config.reloadConfig()} className="ml-3 text-indigo-600">重新加载</button>}
          </div>}
          {showModelBoard ? (
            <div className="flex-1 overflow-y-auto min-h-0 settings-page-scroll p-4 sm:p-6">
              <button type="button" onClick={() => setShowModelBoard(false)} className="mb-4 text-xs text-slate-500 hover:text-slate-900">返回 API 接入</button>
              <ModelManagementPanel models={models} onAdd={openAddModel} onConfigure={configureChannel} onDiscover={discoverModels}
                isDiscovering={models.isFetchingGateway || models.isFetchingOpenAI || models.isFetchingLianchi}
                defaultRouteIds={[activeVisionModel, activeImageGenModel, activeVideoGenModel]} />
            </div>
          ) : navSection === 'api' || storageOpen ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden @container/settings-modal bg-white">
              {storageOpen && <div className="px-4 pt-4 lg:px-5"><StoragePreviewNote /></div>}
              <div className="flex-1 min-h-0 flex overflow-hidden">
                <ApiServicesTab config={config} models={models} group={storageOpen ? 'storage' : 'all'}
                  selectedServiceId={storageOpen ? 'cloud_storage' : selectedServiceId}
                  setSelectedServiceId={id => changeService(setSelectedServiceId, id)}
                  serviceSearch={serviceSearch} setServiceSearch={setServiceSearch}
                  onAddModel={openAddModel} onManageModels={() => setShowModelBoard(true)}
                  defaultRouteIds={[activeVisionModel, activeImageGenModel, activeVideoGenModel]} showToast={showToast} />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 settings-page-scroll p-4 sm:p-6 lg:p-8">
              <div className="settings-page-content w-full min-w-0">
                {navSection === 'privacy' && <PrivacyPreview />}
                {navSection === 'canvas' && canvasPage !== 'media' && <CanvasPreview page={canvasPage} />}
                {(navSection === 'chat' || navSection === 'image' || navSection === 'video') && <DefaultsTab
                  customModels={models.customModels}
                  areModelsLoaded={models.areModelsLoaded}
                  activeVisionModel={activeVisionModel}
                  setActiveVisionModel={setActiveVisionModel}
                  setActiveAssistantModel={setActiveAssistantModel}
                  setSelectedVisionModel={setSelectedVisionModel}
                  activeImageGenModel={activeImageGenModel}
                  setActiveImageGenModel={setActiveImageGenModel}
                  setSelectedImageGenModel={setSelectedImageGenModel}
                  activeVideoGenModel={activeVideoGenModel}
                  setActiveVideoGenModel={setActiveVideoGenModel}
                  setQuickVideoModel={setQuickVideoModel}
                  notifyModelsUpdated={models.notifyModelsUpdated}
                  showToast={showToast}
                  focus={navSection === 'chat' ? 'vision' : navSection === 'image' ? 'image' : 'video'}
                />}
                {(navSection === 'three_d' || navSection === 'music' || navSection === 'voice') && <ModalityPreview kind={navSection} />}
                {navSection === 'language' && <LanguagePreview />}
                {navSection === 'profile' && (
                  <UsageTab
                    usageRange={usageRange}
                    setUsageRange={setUsageRange}
                    usageModelSearch={usageModelSearch}
                    setUsageModelSearch={setUsageModelSearch}
                    setUsageRefreshKey={setUsageRefreshKey}
                    usageSummary={usageSummary}
                    showToast={showToast}
                    gatewayUserId={gatewayUser.userId}
                    gatewaySystemToken={gatewayUser.systemToken}
                    gatewayUserInfo={gatewayUser.userInfo}
                    isGatewayLoading={gatewayUser.isLoading}
                    isGatewayConfigured={gatewayUser.isConfigured}
                    isGatewayLowBalance={gatewayUser.isLowBalance}
                    gatewayLastUpdated={gatewayUser.lastUpdated}
                    gatewayError={gatewayUser.error}
                    onRefreshGatewayUser={gatewayUser.refreshUserInfo}
                    onSaveGatewayCredentials={gatewayUser.saveCredentials}
                    onClearGatewayCredentials={gatewayUser.clearCredentials}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 🌟 2. 网关模型库多厂商发现模态窗 */}
      {models.isGatewayModalOpen && (
        <GatewayModelModal
          isOpen={models.isGatewayModalOpen}
          onClose={() => models.setIsGatewayModalOpen(false)}
          allGatewayModels={models.gatewaySource === 'lianchi' ? models.lianchiModels : models.gatewaySource === 'openai' ? models.openAIModels : models.allGatewayModels}
          gatewayName={models.gatewaySource === 'lianchi' ? '联池' : models.gatewaySource === 'openai' ? (models.openAIModelSource === 'codex' ? 'Codex' : 'OpenAI') : 'Comfly'}
          channel={models.gatewaySource}
          error={models.gatewaySource === 'lianchi' ? models.lianchiModelError : models.gatewaySource === 'openai' ? models.openAIModelError : models.gatewayModelError}
          onRefresh={() => discoverModels(models.gatewaySource)}
          activeModelIds={new Set(models.customModels.map(workflowModelRouteId))}
          isLoading={models.gatewaySource === 'lianchi' ? models.isFetchingLianchi : models.gatewaySource === 'openai' ? models.isFetchingOpenAI : models.isFetchingGateway}
          onToggleAddModel={models.handleToggleGatewayModel}
          onAddModels={models.handleAddAllUsefulGatewayModels}
          onAddAllUsefulModels={() => {
            models.handleAddAllUsefulGatewayModels(models.gatewaySource === 'lianchi' ? models.lianchiModels : models.gatewaySource === 'openai' ? models.openAIModels : models.allGatewayModels);
            models.setIsGatewayModalOpen(false);
          }}
        />
      )}

      {/* 🌟 3. 手动添加自定义模型模态窗 */}
      {isAddingModelModalOpen && <AddModelModal
        initialChannel={addingChannel}
        existingRouteIds={new Set(models.customModels.map(workflowModelRouteId))}
        onClose={() => setIsAddingModelModalOpen(false)}
        onAdd={models.handleAddCustomModel}
      />}
    </div>
  );
}
