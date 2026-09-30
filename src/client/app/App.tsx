import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, clearWorkshopStudioDraft } from '@client/store';
import { GenerationEngineHost } from '@client/features/generate/components/GenerationEngineHost';
import { abortActiveGenerationEngine } from '@client/features/generate/hooks/useGenerationEngine';
import { syncAppTokenCookie } from '@client/shared/api/apiClient';
import { syncWorkspaceCookie } from '@client/shared/api/workspaceClient';
import { migrateLegacyCredentialsOnce } from '@client/shared/api/credentialClient';
import { repairWorkflowModelsInStorage, resolveStoredMultimodalModelId } from '@shared/domain/models/workflowModels';
import { usePreventBrowserFileOpen } from '@client/shared/hooks/useFileDropZone';
import { useViewportDensity } from '@client/shared/hooks/useMediaQuery';
import { useCompactLayout } from '@client/shared/hooks/useCompactLayout';
import AppSidebar from '@client/app/AppSidebar';
import AIAssistantButton from '@client/features/assistant/components/AIAssistantButton';
import AppErrorBoundary from '@client/shared/ui/AppErrorBoundary';
import GlobalContextMenu from '@client/app/GlobalContextMenu';
import { DeconstructJobsHost } from '@client/app/DeconstructJobsHost';
import { GeneratingEffectsProvider } from '@client/shared/ui/AIGeneratingCard';
import { ViewKeepAlivePanel } from '@client/app/ViewKeepAlive';
import { useMountedAfterFirstOpen } from '@client/app/hooks/useMountedAfterFirstOpen';
import { usePerformanceMode } from '@client/shared/utils/performancePreference';

import { useDesktopShortcuts } from '@client/shared/hooks/useDesktopShortcuts';
import { parseViewFromSearchParams, parseWorkshopTabFromSearchParams, syncViewToUrl } from '@client/app/routes';
import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import '@client/features/canvas/store/registerCanvasWorkspace';

// 🌟 React.lazy 动态代码分割与自动容错重试机制（模态框/抽屉按需加载，防无限循环刷新）
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: unknown) {
      console.warn('[Vite Lazy] Chunk import failed, retrying in 300ms...', err);
      await new Promise(r => setTimeout(r, 300));
      try {
        return await factory();
      } catch (retryErr: unknown) {
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

const HomePage = lazyWithRetry(() => import('@client/features/home/HomePage'));
const SettingsWorkspaceView = lazyWithRetry(() => import('@client/features/settings/SettingsWorkspaceView'));
const UniversalCollectorModal = lazyWithRetry(() => import('@client/features/collect/components/UniversalCollectorModal'));
const AIAssistantDrawer = lazyWithRetry(() => import('@client/features/assistant/components/AIAssistantDrawer'));
const ImageLightboxModal = lazyWithRetry(() => import('@client/app/ImageLightboxModal'));
const CanvasWorkspaceView = lazyWithRetry(() => import('@client/features/canvas/CanvasWorkspaceView'));
// 首页只下载创作入口。完整工作区及其 xlsx、jszip、动画等依赖，在实际进入时再下载。
const GenerateWorkspace = lazyWithRetry(() => import('@client/features/generate/GenerateWorkspace'));
const WorkshopStudio = lazyWithRetry(() => import('@client/features/workshop/WorkshopStudio'));
const HeadlinePosterStudio = lazyWithRetry(() => import('@client/features/headline-poster/HeadlinePosterStudio'));
const KeywordReviewStudio = lazyWithRetry(() => import('@client/features/keyword-review/KeywordReviewStudio'));
const AssetCenter = lazyWithRetry(() => import('@client/features/assets/components/AssetCenter'));
const AssetPromptLibrary = lazyWithRetry(() => import('@client/features/assets/components/AssetPromptLibrary'));

function AssetCenterWithCanvas() {
  const canvasProjects = useCanvasStore((state) => state.projects);
  return <AssetCenter
    canvasProjects={canvasProjects}
    onDeleteCanvasProject={(projectId) => useCanvasStore.getState().deleteProject(projectId)}
    onDeleteCanvasNode={(projectId, nodeId) => useCanvasStore.getState().deleteNode(projectId, nodeId)}
    onSelectCanvasProject={(projectId) => useCanvasStore.getState().selectProject(projectId)}
  />;
}
const CanvasRecentProjects = lazyWithRetry(() => import('@client/features/canvas/components/CanvasRecentProjects'));
// 点阵背景为纯装饰，延后下载，使首页核心控件和灵感流优先可用。
const GlobalDynamicBackground = lazyWithRetry(() => import('@client/shared/media/GlobalDynamicBackground'));

export default function App() {
  const [isCollectorOpen, setIsCollectorOpen] = useState(false);
  const [routeReady, setRouteReady] = useState(false);
  const initialSearch = useRef(typeof window === 'undefined' ? '' : window.location.search);
  const mountAssistant = useMountedAfterFirstOpen(useAppStore((s) => s.isAssistantOpen));
  const mountPreview = useMountedAfterFirstOpen(useAppStore((s) => Boolean(s.previewTask)));

  const {
    currentView,
    setCurrentView,
    batchStage,
    activeWorkshopTab,
    setStep,
    navigateToSettings,
    backFromSettings,
  } = useAppStore(
    useShallow((s) => ({
      currentView: s.currentView,
      setCurrentView: s.setCurrentView,
      batchStage: s.batchStage,
      activeWorkshopTab: s.activeWorkshopTab,
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
    const view = parseViewFromSearchParams(initialSearch.current);
    const params = new URLSearchParams(initialSearch.current);
    const step = params.get('step');
    const project = params.get('project');
    setCurrentView(view);
    if (view === 'workshop') {
      useAppStore.getState().setActiveWorkshopTab(parseWorkshopTabFromSearchParams(initialSearch.current));
    }
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
    setRouteReady(true);
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
    if (typeof window === 'undefined' || !routeReady) return;
    const extra: Record<string, string> = {};
    if (currentView === 'workshop') {
      if (activeWorkshopTab === 'studio') extra.step = String(batchStage);
      else extra.tab = activeWorkshopTab;
    } else if (currentView === 'canvas' && activeCanvasProjectId) {
      extra.project = activeCanvasProjectId;
    }
    syncViewToUrl(
      currentView,
      Object.keys(extra).length > 0 ? extra : undefined,
    );
  }, [routeReady, currentView, batchStage, activeWorkshopTab, activeCanvasProjectId]);

  const enterOriginalWorkshop = () => {
    const store = useAppStore.getState();
    store.setWorkshopMode('storyboard_generate');
    store.setActiveWorkshopTab('studio');
    useAppStore.setState({ pendingFreshWorkshopEntry: true, pendingBatchStage: null, pendingBatchPromptImport: null, isWorkshopConfigOpen: false });
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
      {isSettingsFullscreen && (
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
      )}
        {/* 主工作区保持挂载，进入设置时保留未导出的任务和进度。 */}
        <div className={isSettingsFullscreen ? 'hidden' : 'flex-1 min-w-0 flex overflow-hidden relative'} aria-hidden={isSettingsFullscreen} inert={isSettingsFullscreen}>
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
                    <AssetCenterWithCanvas />
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

                <ViewKeepAlivePanel view="workshop" currentView={currentView}>
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
                      AssetPromptLibraryComponent={AssetPromptLibrary}
                    />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>
                <ViewKeepAlivePanel view="headline_poster" currentView={currentView}>
                  <AppErrorBoundary
                    title="大字报生成异常"
                    resetLabel="返回首页"
                    onReset={() => setCurrentView('home')}
                  >
                    <HeadlinePosterStudio onBack={() => setCurrentView('home')} onOpenSettings={navigateToSettings} />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>
              </Suspense>
            </main>
          </div>
        </div>

      {/* 全局大图放大查看与下载模态框 */}
      <Suspense fallback={null}>
        {mountPreview && <ImageLightboxModal />}
      </Suspense>

      {/* 🌟 全局桌面级上下文右键菜单（接管图片/视频快捷操作，彻底消除检查元素与冗余项） */}
      <GlobalContextMenu />
      <DeconstructJobsHost />

      {/* 🌟 右下角常驻多模态 AI 问答助手与抽屉面板（设置视图时静默以保持沉浸） */}
      {!isSettingsFullscreen && <AIAssistantButton />}
      <Suspense fallback={null}>
        {mountAssistant && <AppErrorBoundary
          title="AI 助手组件异常"
          resetLabel="关闭助手"
          onReset={() => {
            useAppStore.getState().setIsAssistantOpen(false);
          }}
        >
          <AIAssistantDrawer onOpenSettings={navigateToSettings} />
        </AppErrorBoundary>}
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
