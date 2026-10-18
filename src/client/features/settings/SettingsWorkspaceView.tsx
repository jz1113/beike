import './settingsWorkspace.css';
import { CANVAS_SETTINGS_PAGES, clearQueuedSettingsSection, peekQueuedSettingsSection, settingsSectionLabel, SETTINGS_NAV_ITEMS, type CanvasSettingsPage, type SettingsNavSection } from './model/settingsNavigation';
import { CanvasPreview } from './components/SettingsPreview';
import { LanguageSettingsPanel } from './components/LanguageSettingsPanel';
import { AppearanceSettingsPanel } from './components/AppearanceSettingsPanel';
import { useI18n } from '@client/shared/i18n';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '@client/shared/hooks/useToast';
import { SettingsSidebar } from './components/SettingsSidebar';
import { X } from 'lucide-react';
import { useSettingsLeaveGuard } from './hooks/useSettingsLeaveGuard';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import { getUsageSummary, USAGE_LOG_EVENT, type UsageRange, type UsageSummary } from '@client/shared/utils/usageTracker';
import { getStoredMultimodalModelId, workflowModelRouteId } from '@shared/domain/models/workflowModels';
import GatewayModelModal from './components/GatewayModelModal';
import ApiServicesTab from './tabs/ApiServicesTab';
import { ModelManagementPanel } from './components/ModelManagementPanel';
import { MODEL_CHANNELS, type ModelChannel } from './model/modelManagement';
import UsageTab from './tabs/UsageTab';
import AddModelModal from './components/AddModelModal';
import { useSystemConfigQuery } from './hooks/useSystemConfigQuery';
import { useSettingsConfig } from './hooks/useSettingsConfig';
import { useCustomModels } from './hooks/useCustomModels';
import { useGatewayUser } from './hooks/useGatewayUser';
import { ModalityHubView } from './components/ModalityHubView';
import type { ModalityKind } from './model/modalityModelTypes';

interface Props {
  onBack?: () => void;
}

export default function SettingsWorkspaceView({ onBack }: Props) {
  void useSystemConfigQuery(true);

  const {
    backFromSettings,
    quickVideoModel,
  } = useAppStore(
    useShallow((s) => ({
      backFromSettings: s.backFromSettings,
      quickVideoModel: s.quickVideoModel,
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
  const [navSection, setNavSection] = useState<SettingsNavSection>(() => peekQueuedSettingsSection() ?? 'appearance');
  useEffect(() => {
    clearQueuedSettingsSection();
  }, []);
  const [canvasPage, setCanvasPage] = useState<CanvasSettingsPage>('connections');
  const [showModelBoard, setShowModelBoard] = useState(false);

  // 2. 中间选中的 API 接口
  const [selectedServiceId, setSelectedServiceId] = useState<string>('comfly_gateway');
  const [serviceSearch, setServiceSearch] = useState('');

  // 3. 用量统计面板状态
  const [usageRange, setUsageRange] = useState<UsageRange>('30d');
  const [usageRefreshKey, setUsageRefreshKey] = useState<number>(0);

  const usageSummary: UsageSummary = useMemo(() => {
    void usageRefreshKey;
    return getUsageSummary(usageRange);
  }, [usageRange, usageRefreshKey]);

  useEffect(() => {
    const refresh = () => setUsageRefreshKey(key => key + 1);
    window.addEventListener(USAGE_LOG_EVENT, refresh);
    return () => window.removeEventListener(USAGE_LOG_EVENT, refresh);
  }, []);

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

  const { t } = useI18n();

  const activeTitle = useMemo(() => {
    if (showModelBoard) return '模型管理';
    if (navSection === 'language') return t('settings.title');
    const navKey = `settings.nav.${navSection}`;
    const translated = t(navKey);
    if (translated && translated !== navKey) return translated;
    return settingsSectionLabel(navSection, canvasPage);
  }, [showModelBoard, navSection, canvasPage, t]);

  const modalityCounts: Partial<Record<SettingsNavSection, number>> = useMemo(() => ({
    chat: 48,
    image: 60,
    video: 80,
    three_d: 4,
    music: 7,
    voice: 22,
  }), []);

  const gatewayBalanceFormatted = gatewayUser.userInfo?.balanceAvailable === false ? undefined : gatewayUser.userInfo?.quotaFormatted;
  const storageOpen = navSection === 'storage';

  return (
    <div className="settings-workspace fixed inset-0 z-[80] flex items-center justify-center p-4 text-slate-900 dark:text-[#EDEDED] font-sans sm:p-8" role="presentation">
      <button type="button" aria-label="关闭设置" className="absolute inset-0 bg-slate-950/25 dark:bg-black/60" onClick={handleBackToApp} />
      {toastMsg && (
        <div role="status" aria-live="polite" className="max-w-[calc(100%-2rem)] break-words absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl flex items-center gap-2 border border-slate-700 animate-fade-in dark:bg-white dark:text-slate-950">
          <span>{toastMsg}</span>
        </div>
      )}
      <div role="dialog" aria-modal="true" aria-label="设置" className="settings-shell relative flex h-[min(760px,calc(100%-64px))] w-[min(1120px,calc(100%-64px))] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#141416]">
        <button type="button" onClick={handleBackToApp} aria-label="关闭" className="absolute right-4 top-4 z-30 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <SettingsSidebar navSection={navSection} setNavSection={changeSection} gatewayBalanceFormatted={gatewayBalanceFormatted} modalityCounts={modalityCounts} />
        {navSection === 'canvas' && (
          <nav aria-label="画布功能" className="settings-canvas-rail hidden md:flex w-44 shrink-0 h-full flex-col overflow-y-auto border-r border-slate-200/80 bg-[#f7f8fa] px-3 py-5 dark:border-white/[0.08] dark:bg-[#101012]">
            <div className="px-2 pb-3 text-[13px] font-medium text-slate-500 dark:text-[#8E8E93]">画布功能</div>
            <div className="space-y-0.5">
              {CANVAS_SETTINGS_PAGES.map(page => (
                <button
                  key={page.id}
                  type="button"
                  aria-current={canvasPage === page.id ? 'page' : undefined}
                  onClick={() => setCanvasPage(page.id)}
                  className={`flex w-full items-center justify-between rounded-full px-2.5 py-2 text-[13px] ${canvasPage === page.id ? 'bg-[#e8edf5] font-semibold text-slate-900 dark:bg-[#1F1F24] dark:text-white' : 'text-slate-700 hover:bg-white dark:text-[#C7C7CC] dark:hover:bg-white/[0.06]'}`}
                >
                  <span>{page.label}</span>
                  {page.count !== undefined && <span className="text-[11px] text-slate-400">{page.count}</span>}
                </button>
              ))}
            </div>
          </nav>
        )}
        <main className="flex-1 min-w-0 h-full flex flex-col bg-white overflow-hidden relative z-10 dark:bg-[#141416]">
          <div className="h-16 px-6 md:px-8 border-b border-slate-100 bg-white flex items-center shrink-0 dark:border-white/[0.08] dark:bg-[#161619]">
            <h1 className="pr-10 text-base sm:text-lg font-semibold text-slate-900 tracking-tight truncate dark:text-white">{activeTitle}</h1>
          </div>
          <div className="md:hidden px-4 py-3 border-b border-slate-100 flex items-center gap-2 dark:border-white/[0.08]">
            <select aria-label="设置分类" value={navSection} onChange={event => changeSection(event.target.value as SettingsNavSection)} className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-white/10 dark:bg-[#151518] dark:text-[#EDEDED]">
              {SETTINGS_NAV_ITEMS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            {navSection === 'canvas' && (
              <select aria-label="画布功能" value={canvasPage} onChange={event => setCanvasPage(event.target.value as CanvasSettingsPage)} className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-white/10 dark:bg-[#151518] dark:text-[#EDEDED]">
                {CANVAS_SETTINGS_PAGES.map(page => <option key={page.id} value={page.id}>{page.label}</option>)}
              </select>
            )}
          </div>
          {!config.configLoaded && (navSection === 'api' || storageOpen) && <div role={config.configLoadError ? 'alert' : 'status'} className="px-5 py-3 text-xs text-slate-600 border-b border-slate-100 dark:text-slate-300 dark:border-white/10">
            {config.configLoadError || '正在加载服务配置…'}
            {config.configLoadError && <button type="button" onClick={() => void config.reloadConfig()} className="ml-3 text-indigo-600">重新加载</button>}
          </div>}
          {showModelBoard ? (
            <div className="flex-1 overflow-y-auto min-h-0 settings-page-scroll p-4 sm:p-6">
              <button type="button" onClick={() => setShowModelBoard(false)} className="mb-4 text-xs text-slate-500 hover:text-slate-900 dark:text-[#8E8E93] dark:hover:text-white">返回 API 接入</button>
              <ModelManagementPanel models={models} onAdd={openAddModel} onConfigure={configureChannel} onDiscover={discoverModels}
                isDiscovering={models.isFetchingGateway || models.isFetchingOpenAI || models.isFetchingLianchi}
                defaultRouteIds={[activeVisionModel, activeImageGenModel, activeVideoGenModel]} />
            </div>
          ) : navSection === 'api' || storageOpen ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden @container/settings-modal bg-white dark:bg-[#141416]">
              <div className="flex-1 min-h-0 flex overflow-hidden">
                <ApiServicesTab config={config} models={models} group={storageOpen ? 'storage' : 'all'}
                  selectedServiceId={storageOpen ? 'cloud_storage' : selectedServiceId}
                  setSelectedServiceId={id => changeService(setSelectedServiceId, id)}
                  serviceSearch={serviceSearch} setServiceSearch={setServiceSearch}
                  onAddModel={openAddModel} onManageModels={() => setShowModelBoard(true)}
                  defaultRouteIds={[activeVisionModel, activeImageGenModel, activeVideoGenModel]} showToast={showToast} />
              </div>
            </div>
          ) : navSection === 'appearance' ? (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <AppearanceSettingsPanel />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 settings-page-scroll p-4 sm:p-6 lg:p-8">
              <div className="settings-page-content w-full min-w-0">
                {navSection === 'canvas' && <CanvasPreview page={canvasPage} />}
                {['chat', 'image', 'video', 'three_d', 'music', 'voice', 'avatar'].includes(navSection) && (
                  <ModalityHubView
                    kind={navSection as ModalityKind}
                    showToast={showToast}
                  />
                )}
                {navSection === 'language' && <LanguageSettingsPanel />}
                {navSection === 'profile' && (
                  <UsageTab
                    usageRange={usageRange}
                    setUsageRange={setUsageRange}
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
