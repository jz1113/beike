import CanvasMediaLibraryHost from './media-library/CanvasMediaLibraryHost';
import type { PendingMediaInsert } from './media-library/mediaIndex';
import { memo, useState, useEffect, useRef, Suspense, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import { OPEN_ECOMMERCE_CANVAS_EVENT, type AppView } from '@client/store/appView';
import { GenerationEngineHost, abortActiveGenerationEngine } from '@client/features/generate/hooks/useGenerationEngine';
import { syncAppTokenCookie } from '@client/shared/api/apiClient';
import { syncWorkspaceCookie } from '@client/shared/api/workspaceClient';
import { repairWorkflowModelsInStorage, resolveStoredMultimodalModelId } from '@shared/domain/models/workflowModels';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { usePreventBrowserFileOpen } from '@client/shared/hooks/useFileDropZone';
import { useViewportDensity } from '@client/shared/hooks/useMediaQuery';
import { useCompactLayout } from '@client/shared/hooks/useCompactLayout';
import { ViewVisibilityContext } from '@client/shared/hooks/useSafeTimeout';
import { hasPendingUsageStorage, retryUsageStorage, USAGE_STORAGE_EVENT } from '@client/shared/utils/usageStorage';
import AppSidebar from '@client/app/AppSidebar';
import { AgentDocumentHost } from '@client/features/assistant/components/document/DocumentViewerModal';
import AppErrorBoundary from '@client/shared/ui/AppErrorBoundary';
import GlobalContextMenu from '@client/app/context-menu/GlobalContextMenu';
import { ConfirmDialogHost } from '@client/shared/ui/ConfirmDialogHost';
import { AppPetHost } from '@client/app/AppPetHost';
import { GeneratingEffectsProvider } from '@client/shared/ui/AIGeneratingCard';
import { usePerformanceMode } from '@client/shared/utils/performancePreference';
import { useDesktopShortcuts } from '@client/shared/hooks/useDesktopShortcuts';
import { buildViewSearchParams, lazyWithRetry, parseAssetLibraryTab, parseViewFromSearchParams, syncViewToUrl } from '@client/app/routes';
import { deleteCanvasProject, useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import { isBuiltInCanvasProject } from '@client/features/canvas/store/canvasProjectDefaults';
import { CanvasLoadingSurface, openCloudDraft } from '@client/features/canvas/store/canvasArchiveStorage';
import AssetWorkspace, { ProjectMediaLibrary, type AssetWorkspaceTab } from './media-library/AssetWorkspace';

const HomePage = lazyWithRetry(() => import('@client/features/home/HomePage'));
const SettingsWorkspaceView = lazyWithRetry(() => import('@client/features/settings/SettingsWorkspaceView'));
const AIAssistantDrawer = lazyWithRetry(() => import('@client/features/assistant/components/AIAssistantDrawer'));
const ImageLightboxModal = lazyWithRetry(() => import('@client/app/lightbox/ImageLightboxModal'));
const CanvasWorkspaceView = lazyWithRetry(() => import('@client/features/canvas/CanvasWorkspaceView'));
// 首页只下载创作入口。完整工作区及其 xlsx、jszip、动画等依赖，在实际进入时再下载。
const GenerateWorkspace = lazyWithRetry(() => import('@client/features/generate/GenerateWorkspace'));
const AssetCenter = lazyWithRetry(() => import('@client/features/assets/components/AssetCenter'));
const SkillsWorkspaceView = lazyWithRetry(() => import('@client/features/skills/SkillsWorkspaceView'));

const KEEP_ALIVE_VIEWS: AppView[] = ['home', 'generate', 'assets', 'asset_library', 'canvas', 'skills'];

interface ViewKeepAlivePanelProps {
  view: AppView;
  currentView: AppView;
  children: ReactNode;
}

/** 缓存已访问视图 DOM，切换时隐藏而非卸载；隐藏期间冻结 children，避免父级重绘。 */
function ViewKeepAlivePanel({ view, currentView, children }: ViewKeepAlivePanelProps) {
  const active = view === currentView;
  const [hasRendered, setHasRendered] = useState(active);
  const frozenChildren = useRef(children);
  if (active) frozenChildren.current = children;

  useEffect(() => {
    if (active) setHasRendered(true);
  }, [active]);

  if (!KEEP_ALIVE_VIEWS.includes(view)) {
    return active ? <ViewVisibilityContext.Provider value={active}>{children}</ViewVisibilityContext.Provider> : null;
  }

  if (!active && !hasRendered) return null;

  return (
    <ViewVisibilityContext.Provider value={active}>
      <div
        className={active ? 'flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden' : 'hidden'}
        aria-hidden={!active}
        inert={!active}
        data-view-panel={view}
      >
        {active ? children : frozenChildren.current}
      </div>
    </ViewVisibilityContext.Provider>
  );
}

/** 首次打开前延后加载；打开后保持挂载，保留后台处理和编辑状态。 */
function useMountedAfterFirstOpen(isOpen: boolean): boolean {
  const [hasOpened, setHasOpened] = useState(isOpen);
  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);
  return isOpen || hasOpened;
}

function isEcommerceCanvas(project: { workshop?: unknown; nativeCommerce?: { kind?: string } }) {
  return project.nativeCommerce?.kind === 'workshop' || Boolean(project.workshop);
}

/** A new collected product must have its own project so existing drafts are never mixed. */
function openEcommerceCanvas() {
  const canvas = useCanvasStore.getState();
  const { product, images } = useAppStore.getState();
  const firstImage = product?.picUrl || images[0]?.url;
  const productKey = product ? JSON.stringify([product.platform, product.itemId || product.id, product.skuId, product.title, firstImage]) : undefined;
  const projects = canvas.projects.filter(project => !isBuiltInCanvasProject(project.id));
  const existing = productKey
    ? projects.find(project => project.nativeCommerce?.kind === 'workshop' && project.nativeCommerce.productKey === productKey)
    : projects.find(project => project.id === canvas.activeProjectId && isEcommerceCanvas(project)) || projects.find(isEcommerceCanvas);
  if (existing) canvas.selectProject(existing.id);
  else {
    const created = canvas.createProject(undefined, 'workshop');
    if (product && productKey && created.studioScene && created.nativeCommerce) {
      const scene = { ...created.studioScene, nodes: created.studioScene.nodes.map(node => {
        if (node.id === `${created.id}-product` && firstImage) return { ...node, content: firstImage };
        if (node.id === `${created.id}-brief` && product.title) {
          const text = [`商品名称：${product.title}`, product.price ? `参考价格：${product.price}` : ''].filter(Boolean).join('\n');
          return { ...node, settings: { ...node.settings as object, aiGenerated: true, text } };
        }
        return node;
      }) };
      useCanvasStore.setState(state => ({ projects: state.projects.map(project => project.id === created.id && project.nativeCommerce
        ? { ...project, nativeCommerce: { ...project.nativeCommerce, productKey } }
        : project) }));
      canvas.syncStudioScene(created.id, scene);
    }
  }
  useAppStore.getState().setCurrentView('canvas');
}

function UsageStorageNotice() {
  const [pending, setPending] = useState(hasPendingUsageStorage);
  useEffect(() => {
    const refresh = () => setPending(hasPendingUsageStorage());
    window.addEventListener(USAGE_STORAGE_EVENT, refresh);
    refresh();
    return () => window.removeEventListener(USAGE_STORAGE_EVENT, refresh);
  }, []);
  if (!pending) return null;
  return <div role="alert" className="fixed bottom-4 left-1/2 z-[100] flex max-w-xl -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-400/40 bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
    <span>用量保存失败，已有历史已保留。新增记录暂留本页，请释放存储空间后重试，补存前不要关闭页面。</span>
    <button type="button" onClick={retryUsageStorage} className="shrink-0 underline">重试保存</button>
  </div>;
}

function AssetCenterWithCanvas() {
  const canvasProjects = useCanvasStore((state) => state.projects);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  return <AssetCenter
    canvasProjects={canvasProjects}
    onDeleteCanvasProject={deleteCanvasProject}
    onDeleteCanvasNode={(projectId: string, nodeId: string) => useCanvasStore.getState().deleteNode(projectId, nodeId)}
    onSelectCanvasProject={(projectId: string) => {
      useCanvasStore.getState().selectProject(projectId);
      setCurrentView('canvas');
    }}
  />;
}
const CanvasRecentProjects = lazyWithRetry(() => import('@client/features/canvas/components/projects/CanvasRecentProjects'));
// 点阵背景为纯装饰，延后下载，使首页核心控件和灵感流优先可用。
const LazyAppBackgroundLayer = lazyWithRetry(async () => ({
  default: (await import('@client/shared/media/backgrounds/AppBackgroundLayer')).AppBackgroundLayer,
}));
const GlobalDynamicBackground = memo(function GlobalDynamicBackground() {
  const { isDark, backgroundStyle, backgroundStudios } = useAppTheme();
  const studio = backgroundStyle === 'clean' ? undefined : backgroundStudios[backgroundStyle];
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none" aria-hidden="true">
      <LazyAppBackgroundLayer style={backgroundStyle} isDark={isDark} studio={studio} />
    </div>
  );
});

export default function App() {
  const [pendingMedia, setPendingMedia] = useState<PendingMediaInsert|null>(null);
  const [legacySalesEntry, setLegacySalesEntry] = useState(false);
  const [homeMode, setHomeMode] = useState<'generate' | 'canvas'>('generate');
  const [libraryTab, setLibraryTab] = useState(() => parseAssetLibraryTab(typeof window === 'undefined' ? '' : window.location.search));
  const [routeRevision, setRouteRevision] = useState(0);
  const [routeReady, setRouteReady] = useState(false);
  const [cloudDraftError, setCloudDraftError] = useState<string | null>(null);
  const [cloudDraftLoading, setCloudDraftLoading] = useState(false);
  const initialSearch = useRef(typeof window === 'undefined' ? '' : window.location.search);
  const mountAssistant = useMountedAfterFirstOpen(useAppStore((s) => s.isAssistantOpen));
  const mountPreview = useMountedAfterFirstOpen(useAppStore((s) => Boolean(s.previewTask)));

  const {
    currentView,
    previousView,
    setCurrentView,
    navigateToSettings,
    backFromSettings,
  } = useAppStore(
    useShallow((s) => ({
      currentView: s.currentView,
      previousView: s.previousView,
      setCurrentView: s.setCurrentView,
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
  const navigateAssetTab = (tab: AssetWorkspaceTab | 'media') => {
    const view = tab === 'media' ? 'asset_library' : 'assets';
    const search = buildViewSearchParams(view, tab === 'canvas' ? { tab } : undefined);
    if (window.location.search.slice(1) !== search) window.history.pushState(null, '', `${window.location.pathname}?${search}`);
    setLibraryTab(tab === 'canvas' ? 'canvas' : 'media');
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
    const cloudDraft = params.get('cloudDraft');
    setCloudDraftError(null);
    setCloudDraftLoading(false);
    if (rawView === 'canvas' && cloudDraft !== null) {
      const controller = new AbortController();
      setCloudDraftLoading(true);
      const open = () => {
        void openCloudDraft(cloudDraft, controller.signal).then(id => {
          if (controller.signal.aborted) return;
          useCanvasStore.getState().selectProject(id);
          setHomeMode('canvas');
          setCurrentView('canvas');
          setRouteReady(true);
        }).catch((error: unknown) => {
          if (!controller.signal.aborted) setCloudDraftError(error instanceof Error ? error.message : '无法打开线上草稿');
        }).finally(() => {
          if (!controller.signal.aborted) setCloudDraftLoading(false);
        });
      };
      const unsubscribe = !useCanvasStore.persist.hasHydrated() ? useCanvasStore.persist.onFinishHydration(open) : undefined;
      if (!unsubscribe) open();
      return () => { controller.abort(); unsubscribe?.(); };
    }
    setLegacySalesEntry(rawView === 'video_sales');
    if (rawView === 'video_sales') {
      setHomeMode('canvas');
      setCurrentView('home');
      setRouteReady(true);
      return;
    }
    if (rawView === 'workshop' || rawView === 'buyer_show') {
      const openWorkshop = () => { openEcommerceCanvas(); setRouteReady(true); };
      if (!useCanvasStore.persist.hasHydrated()) return useCanvasStore.persist.onFinishHydration(openWorkshop);
      openWorkshop();
      return;
    }
    const view = parseViewFromSearchParams(initialSearch.current);
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
    setRouteReady(true);
  }, [setCurrentView, routeRevision]);

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


  if (cloudDraftLoading) return <CanvasLoadingSurface />;
  if (cloudDraftError) return (
    <main className="grid min-h-screen place-content-center gap-4 p-8 text-center">
      <p role="alert">{cloudDraftError}</p>
      <button type="button" onClick={() => setRouteRevision(value => value + 1)}>重试打开草稿</button>
      <a href="/?view=home">返回首页</a>
    </main>
  );

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
            {!isDedicatedFullscreen && currentView !== 'generate' && !(currentView === 'home' && homeMode === 'generate') && <GlobalDynamicBackground />}
          </Suspense>

          {!isDedicatedFullscreen && (
            <AppSidebar
              currentView={currentView}
              onNavigateHub={() => { useAppStore.getState().setQuickGenMode('agent'); setHomeMode('generate'); setCurrentView('home'); }}
              onNavigateCanvas={() => { setHomeMode('canvas'); setCurrentView('home'); }}
              canvasHomeActive={currentView === 'home' && homeMode === 'canvas'}
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
                useAppStore.getState().setQuickGenMode('agent');
                useAppStore.getState().switchSession(id);
                setCurrentView('generate');
              }}
              onCreateConversation={() => {
                useAppStore.getState().setQuickGenMode('agent');
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
                      recentProjects={<CanvasRecentProjects compact maxDisplay={3} legacySalesEntry={legacySalesEntry} onDismissLegacySales={() => setLegacySalesEntry(false)} onOpenAll={() => navigateAssetTab('canvas')} onEnterCanvas={() => setCurrentView('canvas')} />}
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
                    <CanvasWorkspaceView onHome={returnToCreativeHome} />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="skills" currentView={pageView}>
                  <AppErrorBoundary title="技能中心异常" resetLabel="返回首页" onReset={() => setCurrentView('home')}>
                    <SkillsWorkspaceView />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="asset_library" currentView={pageView}>
                  <AppErrorBoundary title="资产库异常" resetLabel="返回首页" onReset={() => setCurrentView('home')}>
                    <ProjectMediaLibrary onOpenHome={returnToCreativeHome} onOpenProject={(projectId,{name,kind,url,cover})=>{
                      setPendingMedia({projectId,item:{name,kind,url,cover},requestId:crypto.randomUUID()});
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
      </Suspense>

      {/* 🌟 全局桌面级上下文右键菜单（接管图片/视频快捷操作，彻底消除检查元素与冗余项） */}
      <GlobalContextMenu />
      <AppPetHost key={isCanvasFullscreen ? "canvas" : "app"} canvas={isCanvasFullscreen} />
      <UsageStorageNotice />
      <ConfirmDialogHost />

      {/* 🌟 仅在无限画布视图中常驻多模态 AI 问答助手与抽屉面板 */}
      {isCanvasFullscreen && activeCanvasProjectId && <CanvasMediaLibraryHost key={activeCanvasProjectId} projectId={activeCanvasProjectId} pending={pendingMedia} onDelivered={setPendingMedia}/>}
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


    </div>
    </GeneratingEffectsProvider>
  );
}
