import { useState, useEffect, useMemo, useCallback } from 'react';
import { handleWindowDrag, handleWindowDoubleClick } from '@/shared/desktop/windowDrag';
import { useToast } from '@/shared/hooks/useToast';
import {
  ArrowLeft,
  Search,
  Layers,
  Activity,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store';
import { getUsageSummary, type UsageSummary } from '@/shared/utils/usageTracker';
import { getStoredMultimodalModelId } from '@beike/domain/workflowModels';
import GatewayModelModal from './GatewayModelModal';
import ApiServicesTab from './tabs/ApiServicesTab';
import DefaultsTab from './tabs/DefaultsTab';
import UsageTab from './tabs/UsageTab';
import AddModelModal from './components/AddModelModal';
import { useSystemConfigQuery } from './hooks/useSystemConfigQuery';
import { useSettingsConfig } from './hooks/useSettingsConfig';
import { useCustomModels } from './hooks/useCustomModels';
import { useGatewayUser } from './hooks/useGatewayUser';

interface Props {
  onBack?: () => void;
}

type SettingsNavSection = 'api_services' | 'usage';

interface NavGroupItem {
  id: SettingsNavSection;
  label: string;
  icon: typeof Layers;
  keywords: string[];
}

interface NavGroup {
  groupTitle: string;
  items: NavGroupItem[];
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

  const handleBackToApp = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      backFromSettings();
    }
  }, [onBack, backFromSettings]);

  // 全局 Escape 键快捷返回
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement | null;
        const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
        if (!isInput) {
          handleBackToApp();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBackToApp]);

  // Toast 提示
  const { message: toastMsg, show: showToast } = useToast();

  // 1. 左侧大类导航
  const [navSection, setNavSection] = useState<SettingsNavSection>('api_services');
  const [navSearchQuery, setNavSearchQuery] = useState('');

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

  // 分组导航配置（对标 Codex 图 2）
  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        groupTitle: '模型与服务',
        items: [
          {
            id: 'api_services',
            label: '服务接口配置',
            icon: Layers,
            keywords: ['api', 'comfly', '网关', 'key', 'token', '接口', '服务', '电商', '万邦', '奇云', '存储', '默认', '模型', '路由'],
          },
        ],
      },
      {
        groupTitle: '数据与统计',
        items: [
          {
            id: 'usage',
            label: '用量统计',
            icon: Activity,
            keywords: ['用量', '额度', '余额', '统计', '消耗', 'token', '花费', '账单'],
          },
        ],
      },
    ],
    []
  );

  // 搜索过滤匹配项
  const filteredGroups = useMemo(() => {
    const q = navSearchQuery.trim().toLowerCase();
    if (!q) return navGroups;
    return navGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.keywords.some((kw) => kw.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [navGroups, navSearchQuery]);

  const activeTitle = useMemo(() => {
    for (const g of navGroups) {
      const match = g.items.find((i) => i.id === navSection);
      if (match) return match.label;
    }
    return '系统设置';
  }, [navGroups, navSection]);

  const gatewayBalanceFormatted = gatewayUser.userInfo?.quotaFormatted;

  return (
    <div className="w-full h-full flex flex-col bg-[#F9FAFB] text-slate-900 font-sans select-none overflow-hidden relative">
      {/* Toast 提示条 */}
      {toastMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl flex items-center gap-2 border border-slate-700 animate-fade-in">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 🌟 1. 独立双栏主舞台（左侧专有导航栏 + 右侧宽屏卡片内容区） */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ===================== COLUMN 1: 左侧专有侧边栏 ===================== */}
        <aside
          data-settings-sidebar
          className="w-64 sm:w-72 xl:w-80 shrink-0 h-full bg-[#F5F6F8] border-r border-slate-200/90 flex flex-col justify-between overflow-hidden relative z-20"
        >
          {/* 顶栏可拖拽区与「← 返回应用」主入口（严格对标图 2 红框） */}
          <div className="flex flex-col pt-3 sm:pt-4 px-3 sm:px-4">
            <div
              data-tauri-drag-region
              onMouseDown={handleWindowDrag}
              onDoubleClick={handleWindowDoubleClick}
              className="h-7 w-full mb-1 cursor-default"
            />

            {/* 图 2 红框核心控件：「← 返回应用」 */}
            <button
              type="button"
              onClick={handleBackToApp}
              className="w-full h-10 px-3 rounded-xl bg-white hover:bg-slate-100/90 active:bg-slate-200/80 border border-slate-200/80 shadow-2xs flex items-center gap-2.5 text-slate-800 hover:text-slate-950 font-bold text-xs sm:text-[13px] transition-all cursor-pointer group"
              title="返回应用 (Esc)"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600 group-hover:text-slate-900 transition-transform group-hover:-translate-x-0.5" />
              <span>返回应用</span>
              <span className="ml-auto text-[10px] text-slate-600 font-mono border border-slate-200/90 px-1.5 py-0.5 rounded-md bg-slate-50">
                Esc
              </span>
            </button>

            {/* 搜索框（对标图 2 搜索设置...） */}
            <div className="relative mt-3 mb-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={navSearchQuery}
                onChange={(e) => setNavSearchQuery(e.target.value)}
                placeholder="搜索设置..."
                className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white/90 hover:bg-white focus:bg-white border border-slate-200/80 focus:border-indigo-500 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 transition-all"
              />
              {navSearchQuery && (
                <button
                  type="button"
                  onClick={() => setNavSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* 分组导航列表（对标图 2） */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 space-y-4">
            {filteredGroups.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">未找到相关设置项</div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.groupTitle} className="space-y-1">
                  <div className="px-2.5 text-[11px] font-bold text-slate-600 tracking-wider">
                    {group.groupTitle}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = navSection === item.id;
                      const isUsage = item.id === 'usage';

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setNavSection(item.id)}
                          className={`w-full px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer group ${
                            isActive
                              ? 'bg-slate-200/80 text-slate-950 font-bold shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-4 h-4 shrink-0 transition-colors ${
                                isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-700'
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>

                          {isUsage && gatewayBalanceFormatted !== undefined && (
                            <span
                              className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                                isActive
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              }`}
                            >
                              {gatewayBalanceFormatted > 999
                                ? (gatewayBalanceFormatted / 1000).toFixed(1) + 'k'
                                : gatewayBalanceFormatted.toFixed(1)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 底部信息：状态与安全提示 */}
          <div className="p-3 sm:p-4 border-t border-slate-200/80 bg-[#F0F2F5] shrink-0">
            <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">本地凭据已安全同步</span>
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5 truncate font-mono">
              贝壳云图工作台 · 设置中心
            </div>
          </div>
        </aside>

        {/* ===================== COLUMN 2: 右侧宽屏主内容区 ===================== */}
        <main className="flex-1 min-w-0 h-full flex flex-col bg-white overflow-hidden relative z-10">
          {/* 顶栏控制条：包含窗口拖拽与标题 */}
          <div
            data-tauri-drag-region
            onMouseDown={handleWindowDrag}
            onDoubleClick={handleWindowDoubleClick}
            className="h-14 px-6 md:px-8 border-b border-slate-100 bg-white/95 backdrop-blur-md flex items-center justify-between shrink-0 select-none cursor-default"
          >
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
                {activeTitle}
              </h1>
            </div>

            <div className="flex items-center gap-2.5">
            </div>
          </div>

          {/* 主内容展示区 */}
          {navSection === 'api_services' ? (
            <div className="flex-1 min-h-0 flex overflow-hidden @container/settings-modal bg-white">
              <ApiServicesTab
                defaultsPanel={<DefaultsTab
                    customModels={models.customModels}
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
                selectedServiceId={selectedServiceId}
                setSelectedServiceId={setSelectedServiceId}
                serviceSearch={serviceSearch}
                setServiceSearch={setServiceSearch}
                isGatewayEnabled={config.isGatewayEnabled}
                setIsGatewayEnabled={config.setIsGatewayEnabled}
                apiKey={config.apiKey}
                setApiKey={config.setApiKey}
                baseUrl={config.baseUrl}
                setBaseUrl={config.setBaseUrl}
                showKey={config.showKey}
                setShowKey={config.setShowKey}
                appAccessToken={config.appAccessToken}
                setAppAccessToken={config.setAppAccessToken}
                handleSaveApiConfig={config.handleSaveApiConfig}
                handleTestPing={config.handleTestPing}
                isTesting={config.isTesting}
                deepSeekApiKey={config.deepSeekApiKey}
                setDeepSeekApiKey={config.setDeepSeekApiKey}
                showDeepSeekKey={config.showDeepSeekKey}
                setShowDeepSeekKey={config.setShowDeepSeekKey}
                isTestingDeepSeek={config.isTestingDeepSeek}
                handleTestDeepSeek={config.handleTestDeepSeek}
                handleSaveDeepSeekConfig={config.handleSaveDeepSeekConfig}
                openAIBaseUrl={config.openAIBaseUrl}
                setOpenAIBaseUrl={config.setOpenAIBaseUrl}
                openAIApiKey={config.openAIApiKey}
                setOpenAIApiKey={config.setOpenAIApiKey}
                showOpenAIKey={config.showOpenAIKey}
                setShowOpenAIKey={config.setShowOpenAIKey}
                openAIEnabled={config.openAIEnabled}
                setOpenAIEnabled={config.setOpenAIEnabled}
                openAIAllowInsecureHttp={config.openAIAllowInsecureHttp}
                setOpenAIAllowInsecureHttp={config.setOpenAIAllowInsecureHttp}
                switchOpenAIToHttpGateway={config.switchOpenAIToHttpGateway}
                isTestingOpenAI={config.isTestingOpenAI}
                handleTestOpenAI={config.handleTestOpenAI}
                handleSaveOpenAIConfig={config.handleSaveOpenAIConfig}
                handleOpenOpenAIDiscovery={() => models.handleOpenOpenAIDiscovery(config.openAIBaseUrl, config.openAIApiKey, config.openAIAllowInsecureHttp, true)}
                handleImportCodexCatalog={models.handleImportCodexCatalog}
                openAIModelError={models.openAIModelError}
                openAIModelSuggestedBaseUrl={models.openAIModelSuggestedBaseUrl}
                openAIModelSource={models.openAIModelSource}
                isFetchingOpenAI={models.isFetchingOpenAI}
                openAIModelCount={models.openAIModels.length}
                lianchiApiKey={config.lianchiApiKey}
                setLianchiApiKey={config.setLianchiApiKey}
                showLianchiKey={config.showLianchiKey}
                setShowLianchiKey={config.setShowLianchiKey}
                isTestingLianchi={config.isTestingLianchi}
                handleTestLianchi={config.handleTestLianchi}
                handleSaveLianchiConfig={config.handleSaveLianchiConfig}
                handleOpenLianchiDiscovery={() => models.handleOpenLianchiDiscovery(config.lianchiApiKey, true)}
                isFetchingLianchi={models.isFetchingLianchi}
                lianchiModelCount={models.lianchiModels.length}
                handleOpenGatewayDiscovery={models.handleOpenGatewayDiscovery}
                isFetchingGateway={models.isFetchingGateway}
                allGatewayModels={models.allGatewayModels}
                customModels={models.customModels}
                modelSearch={models.modelSearch}
                setModelSearch={models.setModelSearch}
                modelCapabilityFilter={models.modelCapabilityFilter}
                setModelCapabilityFilter={models.setModelCapabilityFilter}
                handleToggleCapability={models.handleToggleCapability}
                handleDeleteModel={models.handleDeleteModel}
                handleMoveModel={models.handleMoveModel}
                handleReorderModels={models.handleReorderModels}
                handleResetDefaultModels={models.handleResetDefaultModels}
                comflyPrices={models.comflyPrices}
                isFetchingPrices={models.isFetchingPrices}
                handleSortByComflyPrice={models.handleSortByComflyPrice}
                setIsAddingModelModalOpen={setIsAddingModelModalOpen}
                wanbangKey={config.wanbangKey}
                setWanbangKey={config.setWanbangKey}
                wanbangSecret={config.wanbangSecret}
                setWanbangSecret={config.setWanbangSecret}
                isWanbangEnabled={config.isWanbangEnabled}
                setIsWanbangEnabled={config.setIsWanbangEnabled}
                handleTestWanbang={config.handleTestWanbang}
                isTestingWanbang={config.isTestingWanbang}
                scraperId={config.scraperId}
                setScraperId={config.setScraperId}
                scraperSecret={config.scraperSecret}
                setScraperSecret={config.setScraperSecret}
                isApiaEnabled={config.isApiaEnabled}
                setIsApiaEnabled={config.setIsApiaEnabled}
                qiyunAppId={config.qiyunAppId}
                setQiyunAppId={config.setQiyunAppId}
                qiyunAppKey={config.qiyunAppKey}
                setQiyunAppKey={config.setQiyunAppKey}
                isQiyunEnabled={config.isQiyunEnabled}
                setIsQiyunEnabled={config.setIsQiyunEnabled}
                handleSaveQiyunConfig={config.handleSaveQiyunConfig}
                handleTestQiyun={config.handleTestQiyun}
                isTestingQiyun={config.isTestingQiyun}
                storageEnabled={config.storageEnabled}
                setStorageEnabled={config.setStorageEnabled}
                storageProvider={config.storageProvider}
                setStorageProvider={config.setStorageProvider}
                storageAccountId={config.storageAccountId}
                setStorageAccountId={config.setStorageAccountId}
                storageEndpoint={config.storageEndpoint}
                setStorageEndpoint={config.setStorageEndpoint}
                storageAccessKeyId={config.storageAccessKeyId}
                setStorageAccessKeyId={config.setStorageAccessKeyId}
                storageSecretAccessKey={config.storageSecretAccessKey}
                setStorageSecretAccessKey={config.setStorageSecretAccessKey}
                showStorageSecret={config.showStorageSecret}
                setShowStorageSecret={config.setShowStorageSecret}
                storageBucketName={config.storageBucketName}
                setStorageBucketName={config.setStorageBucketName}
                storagePublicDomain={config.storagePublicDomain}
                setStoragePublicDomain={config.setStoragePublicDomain}
                isTestingStorage={config.isTestingStorage}
                setIsTestingStorage={config.setIsTestingStorage}
                isMigratingStorage={config.isMigratingStorage}
                setIsMigratingStorage={config.setIsMigratingStorage}
                handleSaveWanbangConfig={config.handleSaveWanbangConfig}
                handleSaveScraperConfig={config.handleSaveScraperConfig}
                handleTestScraper={config.handleTestScraper}
                isTestingScraper={config.isTestingScraper}
                handleSaveStorageConfig={config.handleSaveStorageConfig}
                showToast={showToast}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 bg-[#F8F9FA] p-4 sm:p-6 lg:p-8">
              <div className="w-full max-w-5xl 2xl:max-w-6xl mx-auto">



              {navSection === 'usage' && (
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden p-6 sm:p-8">
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
          gatewayName={models.gatewaySource === 'lianchi' ? '联池' : models.gatewaySource === 'openai' ? (models.openAIModelSource === 'codex' ? 'Codex' : 'OpenAI') : '网关'}
          activeModelIds={new Set(models.customModels.map((m) => m.id))}
          isLoading={models.gatewaySource === 'lianchi' ? models.isFetchingLianchi : models.gatewaySource === 'openai' ? models.isFetchingOpenAI : models.isFetchingGateway}
          onToggleAddModel={(model) => {
            const exists = models.customModels.some((m) => m.id === model.id);
            models.handleToggleGatewayModel(model);
            showToast(exists ? `已移出模型 ${model.id}` : `✨ 已接入模型 ${model.id}`);
          }}
          onAddAllUsefulModels={() => {
            const count = models.handleAddAllUsefulGatewayModels(models.gatewaySource === 'lianchi' ? models.lianchiModels : models.gatewaySource === 'openai' ? models.openAIModels : models.allGatewayModels);
            showToast(`🎉 成功接入 ${count} 款核心模型！`);
            models.setIsGatewayModalOpen(false);
          }}
        />
      )}

      {/* 🌟 3. 手动添加自定义模型模态窗 */}
      <AddModelModal
        isOpen={isAddingModelModalOpen}
        onClose={() => setIsAddingModelModalOpen(false)}
        onAdd={models.handleAddCustomModel}
      />
    </div>
  );
}
