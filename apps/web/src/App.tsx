import { useState, useEffect, Suspense, lazy } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, clearWorkshopStudioDraft } from '@/store';
import { GenerationEngineHost } from '@/features/generate/GenerationEngineHost';
import { abortActiveGenerationEngine } from '@/features/generate/useGenerationEngine';
import { syncAppTokenCookie } from '@/shared/api/apiClient';
import { syncWorkspaceCookie } from '@/shared/api/workspaceClient';
import { migrateLegacyCredentialsOnce } from '@/shared/api/credentialClient';
import { repairWorkflowModelsInStorage, resolveStoredMultimodalModelId } from '@beike/domain/workflowModels';
import { usePreventBrowserFileOpen } from '@/shared/hooks/useFileDropZone';
import { useViewportDensity } from '@/shared/hooks/useMediaQuery';
import { useCompactLayout } from '@/shared/hooks/useCompactLayout';
import AppSidebar from '@/shared/ui/AppSidebar';
import AIAssistantButton from '@/features/assistant/components/AIAssistantButton';
import AppErrorBoundary from '@/shared/ui/AppErrorBoundary';
import GlobalContextMenu from '@/shared/ui/GlobalContextMenu';
import { GeneratingEffectsProvider } from '@/shared/ui/AIGeneratingCard';
import { ViewKeepAlivePanel } from '@/shared/ui/ViewKeepAlive';
import { usePerformanceMode } from '@/shared/utils/performancePreference';

import { useDesktopShortcuts } from '@/shared/hooks/useDesktopShortcuts';
import { parseViewFromSearchParams, syncViewToUrl } from '@/app/routes';
import { useCanvasStore } from '@/features/canvas/store/useCanvasStore';

import HomePage from '@/features/home/HomePage';

// 🌟 React.lazy 动态代码分割与自动容错重试机制（模态框/抽屉按需加载，防无限循环刷新）
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: any) {
      console.warn('[Vite Lazy] Chunk import failed, retrying in 300ms...', err);
      await new Promise(r => setTimeout(r, 300));
      try {
        return await factory();
      } catch (retryErr: any) {
        console.warn('[Vite Lazy] Second retry in 800ms...', retryErr);
        await new Promise(r => setTimeout(r, 800));
        try {
          return await factory();
        } catch (finalErr) {
          // 防御性保护：10 秒内至多自动刷新一次，杜绝开发态 HMR 闪断时的无限死循环刷新
          if (typeof window !== 'undefined') {
            try {
              const lastReload = Number(sessionStorage.getItem('__vite_lazy_reload_ts') || '0');
              const now = Date.now();
              if (now - lastReload > 10000) {
                sessionStorage.setItem('__vite_lazy_reload_ts', String(now));
                window.location.reload();
              }
            } catch {
              /* ignore storage errors */
            }
          }
          throw finalErr;
        }
      }
    }
  });
}

const SettingsWorkspaceView = lazyWithRetry(() => import('@/features/settings/SettingsWorkspaceView'));
const UniversalCollectorModal = lazyWithRetry(() => import('@/features/collect/components/UniversalCollectorModal'));
const AIAssistantDrawer = lazyWithRetry(() => import('@/features/assistant/components/AIAssistantDrawer'));
const ImageLightboxModal = lazyWithRetry(() => import('@/shared/modals/ImageLightboxModal'));
const CanvasWorkspaceView = lazyWithRetry(() => import('@/features/canvas/CanvasWorkspaceView'));
// 首页只下载创作入口。完整工作区及其 xlsx、jszip、动画等依赖，在实际进入时再下载。
const GenerateWorkspace = lazyWithRetry(() => import('@/features/generate/GenerateWorkspace'));
const WorkshopStudio = lazyWithRetry(() => import('@/features/workshop/WorkshopStudio'));
const HeadlinePosterStudio = lazyWithRetry(() => import('@/features/headline-poster/HeadlinePosterStudio'));
const KeywordReviewStudio = lazyWithRetry(() => import('@/features/keyword-review/KeywordReviewStudio'));
const AssetCenter = lazyWithRetry(() => import('@/features/assets/components/AssetCenter'));
const CanvasRecentProjects = lazyWithRetry(() => import('@/features/canvas/components/CanvasRecentProjects'));
// 点阵背景为纯装饰，延后下载，使首页核心控件和灵感流优先可用。
const GlobalDynamicBackground = lazyWithRetry(() => import('@/shared/media/GlobalDynamicBackground'));

export default function App() {
  const [isCollectorOpen, setIsCollectorOpen] = useState(false);

  const {
    currentView,
    setCurrentView,
    currentStep,
    batchStage,
    setStep,
    navigateToSettings,
    backFromSettings,
  } = useAppStore(
    useShallow((s) => ({
      currentView: s.currentView,
      setCurrentView: s.setCurrentView,
      currentStep: s.currentStep,
      batchStage: s.batchStage,
      setStep: s.setStep,
      navigateToSettings: s.navigateToSettings,
      backFromSettings: s.backFromSettings,
    })),
  );
  const density = useViewportDensity();
  const { ref: mainContentRef } = useCompactLayout();
  usePerformanceMode();

  usePreventBrowserFileOpen();

  // 桌面原生全局快捷键 (Cmd/Ctrl + 1~4, Cmd/Ctrl + , Cmd/Ctrl + N, Cmd/Ctrl + Enter)
  useDesktopShortcuts({
    onOpenSettings: navigateToSettings,
  });

  // 全局生图引擎挂在独立宿主上，避免进度更新重绘首页

  useEffect(() => {
    syncAppTokenCookie();
    syncWorkspaceCookie();
    repairWorkflowModelsInStorage();
    const selectedModel = resolveStoredMultimodalModelId();
    if (useAppStore.getState().selectedVisionModel !== selectedModel) {
      useAppStore.getState().setSelectedVisionModel(selectedModel);
    }
    void migrateLegacyCredentialsOnce();
  }, []);

  // URL 同步 currentView / currentStep
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const view = parseViewFromSearchParams(window.location.search);
    const params = new URLSearchParams(window.location.search);
    const step = params.get('step');
    const project = params.get('project');
    setCurrentView(view);
    if (view === 'canvas' && project) {
      useCanvasStore.getState().selectProject(project);
    }
    if (view === 'workshop' && step) {
      const n = parseInt(step, 10);
      if (n >= 1 && n <= 4) useAppStore.getState().setBatchStage(n);
    } else if (step) {
      const n = parseInt(step, 10);
      if (n >= 1 && n <= 5) {
        const s = useAppStore.getState();
        const hasWork =
          Boolean(s.product) ||
          s.generatedPrompts.length > 0 ||
          s.clonedSocialImages.length > 0 ||
          s.generationTasks.length > 0;
        setStep(hasWork ? n : 1);
      }
    }
  }, [setCurrentView, setStep]);

  // 🌟 画布独立全屏工作台：进入项目后隐藏全局 Sidebar，呈现完全独立的画板创作界面
  const activeCanvasProjectId = useCanvasStore((s) => s.activeProjectId);
  const isCanvasFullscreen = currentView === 'canvas' && !!activeCanvasProjectId;
  // 🌟 Codex 风格独立全屏设置界面：进入后接管窗口，左侧由设置专属侧栏驱动，带「← 返回应用」
  const isSettingsFullscreen = currentView === 'settings';
  // 种草工坊与大字报工作台使用独立全屏布局。
  const isWorkshopFullscreen = currentView === 'workshop' || currentView === 'headline_poster' || currentView === 'keyword_review';
  const isDedicatedFullscreen = isCanvasFullscreen || isSettingsFullscreen || isWorkshopFullscreen;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const extra: Record<string, string> = {};
    if (currentView === 'workshop') {
      extra.step = String(batchStage);
    } else if (currentView === 'canvas' && activeCanvasProjectId) {
      extra.project = activeCanvasProjectId;
    }
    syncViewToUrl(
      currentView,
      Object.keys(extra).length > 0 ? extra : undefined,
    );
  }, [currentView, currentStep, batchStage, activeCanvasProjectId]);

  const enterOriginalWorkshop = () => {
    const store = useAppStore.getState();
    store.setWorkshopMode('storyboard_generate');
    store.setActiveWorkshopTab('studio');
    setCurrentView('workshop');
  };

  const enterHeadlinePoster = () => {
    setCurrentView('headline_poster');
  };

  return (
    <GeneratingEffectsProvider>
    <GenerationEngineHost />
    <div className="h-screen w-screen bg-[#FAFAFC] text-slate-900 flex flex-col overflow-hidden selection:bg-blue-100 selection:text-blue-900" data-density={density}>
      {/* 设置全屏独立视图 */}
      {isSettingsFullscreen ? (
        <div className="flex-1 w-full h-full min-h-0 overflow-hidden relative z-20">
          <Suspense fallback={
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 text-sm bg-[#F9FAFB]">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
              <span>设置中心加载中…</span>
            </div>
          }>
            <AppErrorBoundary
              title="系统设置异常"
              resetLabel="返回应用"
              onReset={backFromSettings}
            >
              <SettingsWorkspaceView onBack={backFromSettings} />
            </AppErrorBoundary>
          </Suspense>
        </div>
      ) : (
        /* 🌟 2. 主体区域 (左侧 Sidebar + 右侧主工作区，通体贯穿无边框点阵背景) */
        <div className="flex-1 min-w-0 flex overflow-hidden relative">
          {/* 🌟 全局轻奢自适应动态背景（首页右上角流体粒子 + 工作区交互式点阵微澜 + 智能降级兜底） */}
          <Suspense fallback={null}>
            {(!isDedicatedFullscreen || isWorkshopFullscreen) && <GlobalDynamicBackground />}
          </Suspense>

          {!isDedicatedFullscreen && (
            <AppSidebar
              currentView={currentView}
              onNavigateHub={() => setCurrentView('home')}
              onNavigateGenerate={() => setCurrentView('generate')}
              onNavigateAssets={() => setCurrentView('assets')}
              onOpenSettings={navigateToSettings}
            />
          )}

          {/* 🌟 3. 右侧主工作区 */}
          <div ref={mainContentRef} className="flex-1 min-w-0 flex flex-col h-full overflow-hidden group/main relative z-10 bg-transparent">
            {/* 页面主视图：展馆首页 vs 生成工作区 vs 沉浸式买家秀工坊 vs 资产中心 vs 无限画布 */}
            <main className="flex-1 min-w-0 overflow-hidden flex flex-col relative z-10 bg-transparent">
              <Suspense fallback={
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 text-sm">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                  <span>工作区加载中…</span>
                </div>
              }>
                <ViewKeepAlivePanel view="home" currentView={currentView}>
                  <AppErrorBoundary title="首页异常" resetLabel="重新加载" onReset={() => window.location.reload()}>
                    <HomePage 
                      onEnterWorkshop={enterOriginalWorkshop}
                      onOpenHeadlinePoster={enterHeadlinePoster}
                      onOpenKeywordReview={() => setCurrentView('keyword_review')}
                      onOpenCollectorHub={() => setIsCollectorOpen(true)}
                      recentProjects={<CanvasRecentProjects onEnterCanvas={() => setCurrentView('canvas')} />}
                    />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="generate" currentView={currentView}>
                  <AppErrorBoundary title="生成工作区异常" resetLabel="清空会话" onReset={() => {
                    abortActiveGenerationEngine();
                    useAppStore.setState({ generationTasks: [] });
                  }}>
                    <GenerateWorkspace 
                      onOpenSettings={navigateToSettings}
                    />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="assets" currentView={currentView}>
                  <AppErrorBoundary
                    title="资产中心异常"
                    resetLabel="重新加载"
                    onReset={() => {
                      if (typeof window !== 'undefined') {
                        window.location.reload();
                      }
                    }}
                  >
                    <AssetCenter />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="canvas" currentView={currentView}>
                  <AppErrorBoundary
                    title="画布异常"
                    resetLabel="重新加载"
                    onReset={() => {
                      if (typeof window !== 'undefined') {
                        window.location.reload();
                      }
                    }}
                  >
                    <CanvasWorkspaceView />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="keyword_review" currentView={currentView}>
                  <AppErrorBoundary title="关键词审核异常" resetLabel="返回首页" onReset={() => setCurrentView('home')}>
                    <KeywordReviewStudio onBack={() => setCurrentView('home')} onOpenSettings={navigateToSettings} />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                {currentView === 'workshop' ? (
                  <AppErrorBoundary
                    title="种草工坊异常"
                    resetLabel="重置工坊"
                    onReset={() => {
                      clearWorkshopStudioDraft();
                      const store = useAppStore.getState();
                      store.resetModeSession('storyboard_generate');
                    }}
                  >
                    <WorkshopStudio 
                      onOpenSettings={navigateToSettings}
                    />
                  </AppErrorBoundary>
                ) : currentView === 'headline_poster' ? (
                  <AppErrorBoundary
                    title="大字报生成异常"
                    resetLabel="返回首页"
                    onReset={() => setCurrentView('home')}
                  >
                    <HeadlinePosterStudio onBack={() => setCurrentView('home')} onOpenSettings={navigateToSettings} />
                  </AppErrorBoundary>
                ) : null}
              </Suspense>
            </main>
          </div>
        </div>
      )}

      {/* 全局大图放大查看与下载模态框 */}
      <Suspense fallback={null}>
        <ImageLightboxModal />
      </Suspense>

      {/* 🌟 全局桌面级上下文右键菜单（接管图片/视频快捷操作，彻底消除检查元素与冗余项） */}
      <GlobalContextMenu />

      {/* 🌟 右下角常驻多模态 AI 问答助手与抽屉面板（设置视图时静默以保持沉浸） */}
      {!isSettingsFullscreen && <AIAssistantButton />}
      <Suspense fallback={null}>
        <AppErrorBoundary
          title="AI 助手组件异常"
          resetLabel="关闭助手"
          onReset={() => {
            useAppStore.getState().setIsAssistantOpen(false);
          }}
        >
          <AIAssistantDrawer onOpenSettings={navigateToSettings} />
        </AppErrorBoundary>
      </Suspense>

      {/* 🌟 全渠道智能采集与资产汇总中心 */}
      <Suspense fallback={null}>
        {isCollectorOpen && (
          <UniversalCollectorModal
            isOpen={isCollectorOpen}
            onClose={() => setIsCollectorOpen(false)}
            onEnterWorkshop={() => {
              setIsCollectorOpen(false);
              enterOriginalWorkshop();
            }}
          />
        )}
      </Suspense>
    </div>
    </GeneratingEffectsProvider>
  );
}
