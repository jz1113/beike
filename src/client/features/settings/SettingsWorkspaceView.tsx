import './settingsWorkspace.css';
import { SETTINGS_NAV_GROUPS, type SettingsNavSection } from './model/settingsNavigation';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '@client/shared/hooks/useToast';
import { SettingsSidebar } from './components/SettingsSidebar';
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
  const [navSection, setNavSection] = useState<SettingsNavSection>('api_services');

  // 2. 中间选中的 API 接口
  const [selectedServiceId, setSelectedServiceId] = useState<string>('comfly_gateway');
  const [serviceSearch, setServiceSearch] = useState('');
  const [otherServiceId, setOtherServiceId] = useState('wanbang_ecommerce');

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
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
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
    setNavSection('api_services');
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

  const navGroups = SETTINGS_NAV_GROUPS;

  const activeTitle = useMemo(() => {
    for (const g of navGroups) {
      const match = g.items.find((i) => i.id === navSection);
      if (match) return match.label;
    }
    return '系统设置';
  }, [navGroups, navSection]);

  const gatewayBalanceFormatted = gatewayUser.userInfo?.balanceAvailable === false ? undefined : gatewayUser.userInfo?.quotaFormatted;

  return (
    <div className="settings-workspace w-full h-full flex flex-col text-slate-900 font-sans overflow-hidden relative">
      {/* Toast 提示条 */}
      {toastMsg && (
        <div role="status" aria-live="polite" className="max-w-[calc(100%-2rem)] break-words absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl flex items-center gap-2 border border-slate-700 animate-fade-in">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 🌟 1. 独立双栏主舞台（左侧专有导航栏 + 右侧宽屏卡片内容区） */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* ===================== COLUMN 1: 左侧专有侧边栏 ===================== */}
        <SettingsSidebar onBack={handleBackToApp} navSection={navSection} setNavSection={changeSection} gatewayBalanceFormatted={gatewayBalanceFormatted} />

        {/* ===================== COLUMN 2: 右侧宽屏主内容区 ===================== */}
        <main className="flex-1 min-w-0 h-full flex flex-col bg-white overflow-hidden relative z-10">
          {/* 顶栏控制条：包含窗口拖拽与标题 */}
          <div
            className="h-16 px-6 md:px-8 border-b border-slate-100 bg-white/95 backdrop-blur-md flex items-center justify-between shrink-0 select-none cursor-default"
          >
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight truncate">
                {activeTitle}
              </h1>
            </div>

            <div className="flex items-center gap-2.5">
            </div>
          </div>

          {/* 主内容展示区 */}
          <div className="md:hidden px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <button type="button" onClick={handleBackToApp} className="text-xs text-slate-600 shrink-0">返回应用</button>
            <select aria-label="设置分类" value={navSection} onChange={event => changeSection(event.target.value as SettingsNavSection)} className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-xs">{navGroups.flatMap(group => group.items).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          </div>
          {!config.configLoaded && <div role={config.configLoadError ? 'alert' : 'status'} className="px-5 py-3 text-xs text-slate-600 border-b border-slate-100">
            {config.configLoadError || '正在加载服务配置…'}
            {config.configLoadError && <button type="button" onClick={() => void config.reloadConfig()} className="ml-3 text-indigo-600">重新加载</button>}
          </div>}
          {navSection === 'api_services' || navSection === 'other_services' ? (
            <div className="flex-1 min-h-0 flex overflow-hidden @container/settings-modal bg-white">
              <ApiServicesTab config={config} models={models} group={navSection === 'api_services' ? 'models' : 'other'}
                selectedServiceId={navSection === 'api_services' ? selectedServiceId : otherServiceId}
                setSelectedServiceId={id => changeService(navSection === 'api_services' ? setSelectedServiceId : setOtherServiceId, id)}
                serviceSearch={serviceSearch} setServiceSearch={setServiceSearch}
                onAddModel={openAddModel} onManageModels={() => changeSection('models')}
                defaultRouteIds={[activeVisionModel, activeImageGenModel, activeVideoGenModel]} showToast={showToast} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 settings-page-scroll p-4 sm:p-6 lg:p-8">
              <div className="settings-page-content w-full min-w-0">



              {navSection === 'models' && <ModelManagementPanel models={models} onAdd={openAddModel} onConfigure={configureChannel} onDiscover={discoverModels}
                isDiscovering={models.isFetchingGateway || models.isFetchingOpenAI || models.isFetchingLianchi}
                defaultRouteIds={[activeVisionModel, activeImageGenModel, activeVideoGenModel]} />}
              {navSection === 'defaults' && <DefaultsTab
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
                  />}

              {navSection === 'usage' && (
                <div className="min-w-0">
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
                </div>
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
