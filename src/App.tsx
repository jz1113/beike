import { useState, useEffect, lazy, Suspense } from 'react';
import { useAppStore, clearBuyerShowStudioDraft } from '@/store/useAppStore';
import { useGenerationEngine } from '@/features/generate/useGenerationEngine';
import { syncAppTokenCookie } from '@/lib/apiClient';
import { migrateLegacyCredentialsOnce } from '@/lib/credentialClient';
import { repairWorkflowModelsInStorage, resolveStoredMultimodalModelId } from '@/lib/workflowModels';
import { usePreventBrowserFileOpen } from '@/lib/useFileDropZone';
import AppSidebar from '@/shared/ui/AppSidebar';
import Navbar from '@/shared/ui/Navbar';
import ProductHistoryModal from '@/shared/modals/ProductHistoryModal';
import PromptHistoryModal from '@/shared/modals/PromptHistoryModal';
import SettingsModal from '@/features/settings/SettingsModal';
import UniversalCollectorModal from '@/features/collect/UniversalCollectorModal';
import ImageLightboxModal from '@/shared/modals/ImageLightboxModal';
import AIAssistantButton from '@/features/assistant/AIAssistantButton';
import AIAssistantDrawer from '@/features/assistant/AIAssistantDrawer';
import AppErrorBoundary from '@/shared/ui/AppErrorBoundary';

const CreativeHub = lazy(() => import('@/features/hub/CreativeHub'));
const GenerateWorkspace = lazy(() => import('@/features/generate/GenerateWorkspace'));
const BuyerShowStudio = lazy(() => import('@/features/buyer-show/BuyerShowStudio'));
const AssetCenter = lazy(() => import('@/features/assets/AssetCenter'));

export default function Home() {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPromptHistoryOpen, setIsPromptHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCollectorOpen, setIsCollectorOpen] = useState(false);

  const { currentView, setCurrentView, currentStep, setStep } = useAppStore();

  usePreventBrowserFileOpen();

  // 全局生图引擎：与视图解耦，切页后仍提交/轮询
  useGenerationEngine();

  useEffect(() => {
    syncAppTokenCookie();
    repairWorkflowModelsInStorage();
    resolveStoredMultimodalModelId();
    void migrateLegacyCredentialsOnce();
  }, []);

  // URL 同步 currentView / currentStep
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const step = params.get('step');
    if (view === 'hub' || view === 'generate' || view === 'buyer_show' || view === 'assets') {
      setCurrentView(view);
    }
    if (step) {
      const n = parseInt(step, 10);
      if (n >= 1 && n <= 4) {
        const s = useAppStore.getState();
        const hasWork =
          Boolean(s.product) ||
          s.generatedPrompts.length > 0 ||
          s.clonedSocialImages.length > 0 ||
          s.generationTasks.length > 0;
        // 无进行中的工坊内容时不跳进历史 step（避免打开就停在空的 Step3）
        setStep(hasWork ? n : 1);
      }
    }
  }, [setCurrentView, setStep]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('view', currentView);
    if (currentView === 'buyer_show') {
      params.set('step', String(currentStep));
    } else {
      params.delete('step');
    }
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', next);
  }, [currentView, currentStep]);

  return (
    <div className="h-screen w-screen bg-[#F8F9FA] text-slate-900 flex overflow-hidden selection:bg-blue-100 selection:text-blue-900">
      {/* 🌟 1. 左侧常驻导航条 */}
      <AppSidebar
        currentView={currentView}
        onNavigateHub={() => setCurrentView('hub')}
        onNavigateGenerate={() => setCurrentView('generate')}
        onNavigateBuyerShow={() => {
          useAppStore.getState().setWorkshopMode('social_face_product_swap');
          setCurrentView('buyer_show');
        }}
        onNavigateAssets={() => setCurrentView('assets')}
        onOpenProductVault={() => setIsHistoryOpen(true)}
        onOpenPromptVault={() => setIsPromptHistoryOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 🌟 2. 右侧主工作区 */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {/* 顶部轻奢导航栏 (仅在买家秀工坊流程中展示 4 步进度条，展馆和生成工作区纯净展示) */}
        {currentView === 'buyer_show' && (
          <Navbar 
            currentView={currentView}
            onBackToHub={() => setCurrentView('hub')}
          />
        )}

        {/* 页面主视图：展馆首页 vs 生成工作区 vs 沉浸式买家秀工坊 vs 资产中心 */}
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm">加载中…</div>}>
          {currentView === 'hub' ? (
            <CreativeHub 
              onEnterBuyerShow={() => {
                useAppStore.getState().setWorkshopMode('social_face_product_swap');
                setCurrentView('buyer_show');
              }}
              onOpenHistory={() => setIsHistoryOpen(true)}
              onOpenPromptVault={() => setIsPromptHistoryOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenCollectorHub={() => setIsCollectorOpen(true)}
            />
          ) : currentView === 'generate' ? (
            <AppErrorBoundary title="生成工作区异常" resetLabel="清空会话" onReset={() => useAppStore.setState({ hubGenerations: [] })}>
              <GenerateWorkspace 
                onOpenProductVault={() => setIsHistoryOpen(true)}
                onOpenPromptVault={() => setIsPromptHistoryOpen(true)}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            </AppErrorBoundary>
          ) : currentView === 'assets' ? (
            <AssetCenter 
              onEnterBuyerShow={() => setCurrentView('buyer_show')}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          ) : (
            <AppErrorBoundary
              title="买家秀工坊异常"
              resetLabel="重置工坊"
              onReset={() => {
                clearBuyerShowStudioDraft();
                const store = useAppStore.getState();
                store.resetModeSession('social_face_product_swap');
                store.resetModeSession('storyboard_generate');
              }}
            >
              <BuyerShowStudio 
                onOpenHistory={() => setIsHistoryOpen(true)}
                onOpenPromptHistory={() => setIsPromptHistoryOpen(true)}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            </AppErrorBoundary>
          )}
          </Suspense>
        </main>
      </div>

      {/* 全局大图放大查看与下载模态框 */}
      <ImageLightboxModal />

      {/* 🌟 右下角常驻多模态 AI 问答助手与抽屉面板 */}
      <AIAssistantButton />
      <AIAssistantDrawer onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* 🌟 全渠道智能采集与资产汇总中心 */}
      <UniversalCollectorModal
        isOpen={isCollectorOpen}
        onClose={() => setIsCollectorOpen(false)}
        onEnterBuyerShow={() => {
          setIsCollectorOpen(false);
          setCurrentView('buyer_show');
        }}
      />

      {/* 全局明亮轻奢弹窗：商品库 / 提示词库 / 模型配置中心 */}
      <ProductHistoryModal 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
      />

      <PromptHistoryModal 
        isOpen={isPromptHistoryOpen} 
        onClose={() => setIsPromptHistoryOpen(false)} 
      />

      {isSettingsOpen && (
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
        />
      )}
    </div>
  );
}
