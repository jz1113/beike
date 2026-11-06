import { CanvasCreateDialog } from '@client/features/canvas/components/projects/CanvasCreateDialog';
import type { OpenSalesLibrary, SalesAssetSection, SalesLibraryChoice } from '@client/features/sales/model/salesWorkspace';
import CanvasMediaLibraryHost from './media-library/CanvasMediaLibraryHost';
import type { PendingMediaInsert } from './media-library/mediaIndex';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import { GenerationEngineHost } from '@client/features/generate/components/GenerationEngineHost';
import { abortActiveGenerationEngine } from '@client/features/generate/hooks/useGenerationEngine';
import { syncAppTokenCookie } from '@client/shared/api/apiClient';
import { syncWorkspaceCookie } from '@client/shared/api/workspaceClient';
import { repairWorkflowModelsInStorage, resolveStoredMultimodalModelId } from '@shared/domain/models/workflowModels';
import { usePreventBrowserFileOpen } from '@client/shared/hooks/useFileDropZone';
import { useViewportDensity } from '@client/shared/hooks/useMediaQuery';
import { useCompactLayout } from '@client/shared/hooks/useCompactLayout';
import AppSidebar from '@client/app/AppSidebar';
import AgentDocumentHost from '@client/features/assistant/components/document/AgentDocumentHost';
import AppErrorBoundary from '@client/shared/ui/AppErrorBoundary';
import GlobalContextMenu from '@client/app/context-menu/GlobalContextMenu';
import { ConfirmDialogHost } from '@client/shared/ui/ConfirmDialogHost';
import { DeconstructJobsHost } from '@client/app/DeconstructJobsHost';
import { AppPetHost } from '@client/app/AppPetHost';
import { GeneratingEffectsProvider } from '@client/shared/ui/AIGeneratingCard';
import { ViewKeepAlivePanel } from '@client/app/ViewKeepAlive';
import { useMountedAfterFirstOpen } from '@client/app/hooks/useMountedAfterFirstOpen';
import { usePerformanceMode } from '@client/shared/utils/performancePreference';
import { useDesktopShortcuts } from '@client/shared/hooks/useDesktopShortcuts';
import { buildViewSearchParams, parseAssetLibraryTab, parseViewFromSearchParams, syncViewToUrl } from '@client/app/routes';
import { openEcommerceCanvas } from '@client/app/openEcommerceCanvas';
import { OPEN_ECOMMERCE_CANVAS_EVENT } from '@client/shared/navigation/commerceCanvas';
import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import { CanvasLoadingSurface } from '@client/features/canvas/components/editor/CanvasLoadingSurface';
import '@client/features/canvas/store/registerCanvasWorkspace';
import AssetWorkspace, { type AssetWorkspaceTab } from './media-library/AssetWorkspace';
import { lazyWithRetry } from './lazyWithRetry';

const HomePage = lazyWithRetry(() => import('@client/features/home/HomePage'));
const SettingsWorkspaceView = lazyWithRetry(() => import('@client/features/settings/SettingsWorkspaceView'));
const AIAssistantDrawer = lazyWithRetry(() => import('@client/features/assistant/components/AIAssistantDrawer'));
const HomeImageTools = lazyWithRetry(() => import('@client/app/lightbox/HomeImageTools'));
const ImageLightboxModal = lazyWithRetry(() => import('@client/app/lightbox/ImageLightboxModal'));
const CanvasWorkspaceView = lazyWithRetry(() => import('@client/features/canvas/CanvasWorkspaceView'));
// 首页只下载创作入口。完整工作区及其 xlsx、jszip、动画等依赖，在实际进入时再下载。
const GenerateWorkspace = lazyWithRetry(() => import('@client/features/generate/GenerateWorkspace'));
const WorkshopCanvasBusiness = lazyWithRetry<{ project: import('@client/features/canvas/model/types').CanvasProject }>(() => import('./WorkshopCanvasIntegration').then(module => ({ default: module.WorkshopCanvasBusiness })));
const PosterCanvasBusiness = lazyWithRetry<{ project: import('@client/features/canvas/model/types').CanvasProject }>(() => import('./PosterCanvasIntegration').then(module => ({ default: module.PosterCanvasBusiness })));
const SalesCanvasBusiness = lazyWithRetry<{ project: import('@client/features/canvas/model/types').CanvasProject; onOpenLibrary: OpenSalesLibrary; libraryChoice?: SalesLibraryChoice | null; onChoiceHandled?: () => void }>(() => import('./SalesCanvasIntegration').then(module => ({ default: module.SalesCanvasBusiness })));
const AssetCenter = lazyWithRetry(() => import('@client/features/assets/components/AssetCenter'));
const ProjectMediaLibrary = lazyWithRetry(() => import('./media-library/ProjectMediaLibrary'));
const SkillsWorkspaceView = lazyWithRetry(() => import('@client/features/skills/SkillsWorkspaceView'));

function AssetCenterWithCanvas() {
  const canvasProjects = useCanvasStore((state) => state.projects);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  return <AssetCenter
    canvasProjects={canvasProjects}
    onDeleteCanvasProject={(projectId: string) => useCanvasStore.getState().deleteProject(projectId)}
    onDeleteCanvasNode={(projectId: string, nodeId: string) => useCanvasStore.getState().deleteNode(projectId, nodeId)}
    onSelectCanvasProject={(projectId: string) => {
      useCanvasStore.getState().selectProject(projectId);
      setCurrentView('canvas');
    }}
  />;
}
const CanvasCreativeTools = lazyWithRetry(() => import('@client/features/canvas/components/projects/CanvasCreativeTools'));
const CanvasRecentProjects = lazyWithRetry(() => import('@client/features/canvas/components/projects/CanvasRecentProjects'));
// 点阵背景为纯装饰，延后下载，使首页核心控件和灵感流优先可用。
const GlobalDynamicBackground = lazyWithRetry(() => import('@client/shared/media/widgets/GlobalDynamicBackground'));

export default function App() {
  const [libraryVisit, setLibraryVisit] = useState<{ section?: SalesAssetSection } | null>(null);
  const [salesChoice, setSalesChoice] = useState<SalesLibraryChoice | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMediaInsert|null>(null);
  const [homeImageTool, setHomeImageTool] = useState<'image-edit' | 'prompt-reverse' | 'product-angles' | null>(null);
  const [legacySalesDialog, setLegacySalesDialog] = useState(false);
  const [homeMode, setHomeMode] = useState<'generate' | 'canvas'>('generate');
  const [libraryTab, setLibraryTab] = useState(() => parseAssetLibraryTab(typeof window === 'undefined' ? '' : window.location.search));
  const [routeRevision, setRouteRevision] = useState(0);
  const [routeReady, setRouteReady] = useState(false);
  const initialSearch = useRef(typeof window === 'undefined' ? '' : window.location.search);
  const mountAssistant = useMountedAfterFirstOpen(useAppStore((s) => s.isAssistantOpen));
  const mountPreview = useMountedAfterFirstOpen(useAppStore((s) => Boolean(s.previewTask)));

  const {
    currentView,
    previousView,
    setCurrentView,
    setStep,
    navigateToSettings,
    backFromSettings,
  } = useAppStore(
    useShallow((s) => ({
      currentView: s.currentView,
      previousView: s.previousView,
      setCurrentView: s.setCurrentView,
      setStep: s.setStep,
      navigateToSettings: s.navigateToSettings,
      backFromSettings: s.backFromSettings,
    })),
  );
  useEffect(() => {
    const open = () => openEcommerceCanvas();
    window.addEventListener(OPEN_ECOMMERCE_CANVAS_EVENT, open);
    return () => window.removeEventListener(OPEN_ECOMMERCE_CANVAS_EVENT, open);
  }, []);
  useEffect(() => {
    if (currentView === 'workshop') openEcommerceCanvas();
  }, [currentView]);
  const openSalesLibrary: OpenSalesLibrary = (section) => {
    setLibraryTab('media');
    setLibraryVisit({ section });
    setCurrentView('asset_library');
  };
  const returnToProduction = () => {
    setLibraryVisit(null);
    const state = useCanvasStore.getState();
    setCurrentView(state.activeProjectId && state.projects.some(project => project.id === state.activeProjectId) ? 'canvas' : 'home');
  };
  const navigateAssetTab = (tab: AssetWorkspaceTab | 'media') => {
    const view = tab === 'media' ? 'asset_library' : 'assets';
    const search = buildViewSearchParams(view, tab === 'canvas' ? { tab } : undefined);
    if (window.location.search.slice(1) !== search) window.history.pushState(null, '', `${window.location.pathname}?${search}`);
    setLibraryTab(tab === 'canvas' ? 'canvas' : 'media');
    setLibraryVisit(null);
    setCurrentView(view);
  };
  useEffect(() => {
    const restoreRoute = () => {
      setRouteReady(false);
      initialSearch.current = window.location.search;
      setLibraryTab(parseAssetLibraryTab(window.location.search));
      setRouteRevision(value => value + 1);
    };
    window.addEventListener('popstate', restoreRoute);
    return () => window.removeEventListener('popstate', restoreRoute);
  }, []);
  const pageView = currentView === 'settings' ? (previousView && previousView !== 'settings' ? previousView : 'home') : currentView;
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
    void useAppStore.getState().refreshAssistantSkills().catch(() => {});
  }, []);

  // URL 同步 currentView / currentStep
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(initialSearch.current);
    const rawView = params.get('view');
    if (rawView === 'workshop' || rawView === 'buyer_show') {
      const openWorkshop = () => { openEcommerceCanvas(); setRouteReady(true); };
      if (!useCanvasStore.persist.hasHydrated()) return useCanvasStore.persist.onFinishHydration(openWorkshop);
      openWorkshop();
      return;
    }
    if (['video_sales', 'daihuo'].includes(params.get('view') || '')) {
      setLegacySalesDialog(true);
      setHomeMode('canvas');
      setCurrentView('home');
      setRouteReady(true);
      return;
    }
    const view = parseViewFromSearchParams(initialSearch.current);
    const step = params.get('step');
    const project = params.get('project');
    if (view === 'canvas') {
      const openCanvasRoute = () => {
        const store = useCanvasStore.getState();
        const selected = store.projects.find(item => item.id === project);
        store.selectProject(selected?.id ?? null);
        setHomeMode('canvas');
        setCurrentView(selected ? 'canvas' : 'home');
        setRouteReady(true);
      };
      if (!useCanvasStore.persist.hasHydrated()) return useCanvasStore.persist.onFinishHydration(openCanvasRoute);
      openCanvasRoute();
      return;
    }
    setCurrentView(view);
    if (step) {
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
  }, [setCurrentView, setStep, routeRevision]);

  // 🌟 画布独立全屏工作台：进入项目后隐藏全局 Sidebar，呈现完全独立的画板创作界面
  const activeCanvasProjectId = useCanvasStore((s) => s.activeProjectId);
  useEffect(() => {
    if (routeReady && currentView === 'canvas' && !activeCanvasProjectId) {
      setHomeMode('canvas');
      setCurrentView('home');
    }
  }, [routeReady, currentView, activeCanvasProjectId, setCurrentView]);
  useEffect(() => {
    if (pendingMedia && (currentView !== 'canvas' || activeCanvasProjectId !== pendingMedia.projectId)) setPendingMedia(null);
  }, [pendingMedia,currentView,activeCanvasProjectId]);
  const studioProject = useCanvasStore(s => s.projects.some(p => p.id === s.activeProjectId && (p.studioScene || !p.nodes.length)));
  const isCanvasFullscreen = currentView === 'canvas' && !!activeCanvasProjectId;
  const isDedicatedFullscreen = isCanvasFullscreen;

  useEffect(() => {
    if (typeof window === 'undefined' || !routeReady) return;
    const extra: Record<string, string> = {};
    if (currentView === 'assets' && libraryTab === 'canvas') extra.tab = 'canvas';
    else if (currentView === 'canvas' && activeCanvasProjectId) extra.project = activeCanvasProjectId;
    syncViewToUrl(currentView, Object.keys(extra).length ? extra : undefined);
  }, [routeReady, currentView, activeCanvasProjectId, libraryTab]);

  // 🌟 AI 助手仅在画布视图开放，离开画布时自动收起助手抽屉
  useEffect(() => {
    if (currentView !== 'canvas' && useAppStore.getState().isAssistantOpen) {
      useAppStore.getState().setIsAssistantOpen(false);
    }
  }, [currentView]);

  const returnToCreativeHome = () => {
    setHomeMode('generate');
    setCurrentView('home');
    useCanvasStore.getState().selectProject(null);
  };


  return (
    <GeneratingEffectsProvider>
    <GenerationEngineHost />
    <div className="h-screen w-screen bg-[#F7F7F8] dark:bg-[#121214] text-slate-900 dark:text-[#EDEDED] flex flex-col overflow-hidden selection:bg-blue-100 dark:selection:bg-indigo-900 selection:text-blue-900 dark:selection:text-indigo-200" data-density={density}>
      {/* 设置全屏独立视图 */}
      {currentView === 'settings' && (
        <Suspense fallback={null}>
          <AppErrorBoundary
            title="系统设置异常"
            resetLabel="返回应用"
            onReset={backFromSettings}
          >
            <SettingsWorkspaceView onBack={backFromSettings} />
          </AppErrorBoundary>
        </Suspense>
      )}
        <div className="flex-1 min-w-0 flex overflow-hidden relative">
          {/* 🌟 全局轻奢自适应动态背景（首页右上角流体粒子 + 工作区交互式点阵微澜 + 智能降级兜底） */}
          <Suspense fallback={null}>
            {!isDedicatedFullscreen && <GlobalDynamicBackground />}
          </Suspense>

          {!isDedicatedFullscreen && (
            <AppSidebar
              currentView={currentView}
              onNavigateHub={() => setCurrentView('home')}
              onNavigateAssets={() => navigateAssetTab('history')}
              onNavigateLibrary={() => navigateAssetTab('media')}
              onNavigateSkills={() => setCurrentView('skills')}
              onOpenSettings={navigateToSettings}
              onOpenSession={(id) => {
                const session = useAppStore.getState().sessions.find((item) => item.id === id);
                if (session?.canvasProjectId) {
                  useCanvasStore.getState().selectProject(session.canvasProjectId);
                  setHomeMode('canvas');
                  setCurrentView('canvas');
                  return;
                }
                useAppStore.getState().switchSession(id);
                setCurrentView('generate');
              }}
              onOpenAssistantSession={(id) => {
                const store = useAppStore.getState();
                store.switchAssistantSession(id);
                const canvas = useCanvasStore.getState();
                if (!canvas.projects.some((project) => project.id === canvas.activeProjectId)) {
                  const latest = canvas.projects[0];
                  if (latest) canvas.selectProject(latest.id);
                  else canvas.createProject();
                }
                setCurrentView('canvas');
                store.setIsAssistantOpen(true);
              }}
              onCreateConversation={() => {
                useAppStore.getState().createSession();
                setCurrentView('generate');
              }}
            />
          )}

          {/* 🌟 3. 右侧主工作区 */}
          <div ref={mainContentRef} className="flex-1 min-w-0 flex flex-col h-full overflow-hidden group/main relative z-10 bg-transparent">
            {/* 页面主视图：展馆首页 vs 生成工作区 vs 沉浸式电商图文 vs 资产中心 vs 无限画布 */}
            <main className="flex-1 min-w-0 overflow-hidden flex flex-col relative z-10 bg-transparent">
              <Suspense fallback={pageView === 'canvas' ? <CanvasLoadingSurface /> :
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 text-sm">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                  <span>工作区加载中…</span>
                </div>
              }>
                <ViewKeepAlivePanel view="home" currentView={pageView}>
                  <AppErrorBoundary title="首页异常" resetLabel="重新加载" onReset={() => window.location.reload()}>
                    <HomePage 
                      homeMode={homeMode} setHomeMode={setHomeMode}
                      creativeTools={<CanvasCreativeTools onOpenImageTool={setHomeImageTool} onEnterCanvas={() => setCurrentView('canvas')} />}
                      recentProjects={<CanvasRecentProjects compact maxDisplay={3} onOpenAll={() => navigateAssetTab('canvas')} onEnterCanvas={() => setCurrentView('canvas')} />}
                    />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="generate" currentView={pageView}>
                  <AppErrorBoundary title="生成工作区异常" resetLabel="清空会话" onReset={() => {
                    abortActiveGenerationEngine();
                    useAppStore.setState({ generationTasks: [] });
                  }}>
                    <GenerateWorkspace 
                      onOpenSettings={navigateToSettings}
                    />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="assets" currentView={pageView}>
                  <AppErrorBoundary title="生成历史异常" resetLabel="重新加载" onReset={() => { if (typeof window !== 'undefined') window.location.reload(); }}>
                    <AssetWorkspace tab={libraryTab === 'canvas' ? 'canvas' : 'history'} onTabChange={navigateAssetTab} onEnterCanvas={() => setCurrentView('canvas')}><AssetCenterWithCanvas /></AssetWorkspace>
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="canvas" currentView={pageView}>
                  <AppErrorBoundary title="画布异常" resetLabel="重新加载" onReset={() => { if (typeof window !== 'undefined') window.location.reload(); }}>
                    <CanvasWorkspaceView onHome={returnToCreativeHome} renderBusiness={project => <><PosterCanvasBusiness project={project} /><WorkshopCanvasBusiness project={project} /><SalesCanvasBusiness project={project} onOpenLibrary={openSalesLibrary} libraryChoice={salesChoice} onChoiceHandled={() => setSalesChoice(null)} /></>} />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>





                <ViewKeepAlivePanel view="skills" currentView={pageView}>
                  <AppErrorBoundary title="技能中心异常" resetLabel="返回首页" onReset={() => setCurrentView('home')}>
                    <SkillsWorkspaceView />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="asset_library" currentView={pageView}>
                  <AppErrorBoundary title="资产库异常" resetLabel="返回首页" onReset={() => setCurrentView('home')}>
                    <ProjectMediaLibrary visit={libraryVisit} onOpenHome={returnToCreativeHome} onReturn={returnToProduction} onSelectSales={choice => {
                      setSalesChoice(choice); returnToProduction();
                    }} onOpenProject={(projectId,{name,kind,url})=>{
                      setPendingMedia({projectId,item:{name,kind,url},requestId:crypto.randomUUID()});
                      useCanvasStore.getState().selectProject(projectId);
                      setCurrentView('canvas');
                    }}/>
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>


              </Suspense>
            </main>
          </div>
        </div>

      {/* 全局大图放大查看与下载模态框 */}
      <Suspense fallback={null}>
        {mountPreview && <ImageLightboxModal />}
        {homeImageTool && <HomeImageTools key={homeImageTool} tool={homeImageTool} onClose={() => setHomeImageTool(null)} />}
      </Suspense>

      {/* 🌟 全局桌面级上下文右键菜单（接管图片/视频快捷操作，彻底消除检查元素与冗余项） */}
      <GlobalContextMenu />
      {pageView !== "workshop" && <AppPetHost key={isCanvasFullscreen ? "canvas" : "app"} canvas={isCanvasFullscreen} />}
      <DeconstructJobsHost />
      <ConfirmDialogHost />

      {/* 🌟 仅在无限画布视图中常驻多模态 AI 问答助手与抽屉面板 */}
      {isCanvasFullscreen && studioProject && activeCanvasProjectId && <CanvasMediaLibraryHost key={activeCanvasProjectId} projectId={activeCanvasProjectId} pending={pendingMedia} onDelivered={setPendingMedia}/>}
      <AgentDocumentHost />
      <Suspense fallback={null}>
        {currentView === 'canvas' && mountAssistant && <AppErrorBoundary
          title="AI 助手组件异常"
          resetLabel="关闭助手"
          onReset={() => {
            useAppStore.getState().setIsAssistantOpen(false);
          }}
        >
          <AIAssistantDrawer onOpenSettings={navigateToSettings} />
        </AppErrorBoundary>}
      </Suspense>


      {legacySalesDialog && <CanvasCreateDialog legacySalesEntry onClose={() => setLegacySalesDialog(false)}
        onCreate={kind => {
          useCanvasStore.getState().createProject(undefined, kind);
          setLegacySalesDialog(false);
          setCurrentView('canvas');
        }} />}
    </div>
    </GeneratingEffectsProvider>
  );
}
