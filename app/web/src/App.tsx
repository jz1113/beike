import { useState, useEffect, Suspense, lazy } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, clearWorkshopStudioDraft } from '@/store/useAppStore';
import { useGenerationEngine } from '@/features/generate/useGenerationEngine';
import { syncAppTokenCookie } from '@/lib/apiClient';
import { migrateLegacyCredentialsOnce } from '@/lib/credentialClient';
import { repairWorkflowModelsInStorage, resolveStoredMultimodalModelId } from '@beike/domain/workflowModels';
import { usePreventBrowserFileOpen } from '@/lib/useFileDropZone';
import { useViewportDensity } from '@/lib/useMediaQuery';
import { useCompactLayout } from '@/lib/useCompactLayout';
import AppSidebar from '@/shared/ui/AppSidebar';
import AIAssistantButton from '@/features/assistant/AIAssistantButton';
import AppErrorBoundary from '@/shared/ui/AppErrorBoundary';
import MacTitleBar from '@/shared/ui/MacTitleBar';
import GlobalContextMenu from '@/shared/ui/GlobalContextMenu';
import { GeneratingEffectsProvider } from '@/shared/ui/AIGeneratingCard';
import { ViewKeepAlivePanel } from '@/shared/ui/ViewKeepAlive';
import { usePerformanceMode } from '@/lib/performancePreference';
import GlobalDynamicBackground from '@/shared/media/GlobalDynamicBackground';

import { useDesktopShortcuts } from '@/lib/useDesktopShortcuts';
import { parseViewFromSearchParams, syncViewToUrl } from '@/app/routes';
import { useCanvasStore } from '@/features/canvas/store/useCanvasStore';

import HomePage from '@/features/home/HomePage';
import GenerateWorkspace from '@/features/generate/GenerateWorkspace';
import WorkshopStudio from '@/features/workshop/WorkshopStudio';
import ReplicationStudio from '@/features/replicate/ReplicationStudio';
import AssetCenter from '@/features/assets/AssetCenter';

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
const UniversalCollectorModal = lazyWithRetry(() => import('@/features/collect/UniversalCollectorModal'));
const AIAssistantDrawer = lazyWithRetry(() => import('@/features/assistant/AIAssistantDrawer'));
const ImageLightboxModal = lazyWithRetry(() => import('@/shared/modals/ImageLightboxModal'));
const CanvasWorkspaceView = lazyWithRetry(() => import('@/features/canvas/CanvasWorkspaceView'));

export default function App() {
  const [isCollectorOpen, setIsCollectorOpen] = useState(false);

  const {
    currentView,
    setCurrentView,
    currentStep,
    setStep,
    navigateToSettings,
    backFromSettings,
  } = useAppStore(
    useShallow((s) => ({
      currentView: s.currentView,
      setCurrentView: s.setCurrentView,
      currentStep: s.currentStep,
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
    const view = parseViewFromSearchParams(window.location.search);
    const params = new URLSearchParams(window.location.search);
    const step = params.get('step');
    const project = params.get('project');
    setCurrentView(view);
    if (view === 'canvas' && project) {
      useCanvasStore.getState().selectProject(project);
    }
    if (step) {
      const n = parseInt(step, 10);
      if (n >= 1 && n <= 5) {
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

  // 🌟 画布独立全屏工作台：进入项目后隐藏全局 Sidebar，呈现完全独立的画板创作界面
  const activeCanvasProjectId = useCanvasStore((s) => s.activeProjectId);
  const isCanvasFullscreen = currentView === 'canvas' && !!activeCanvasProjectId;
  // 🌟 Codex 风格独立全屏设置界面：进入后接管窗口，左侧由设置专属侧栏驱动，带「← 返回应用」
  const isSettingsFullscreen = currentView === 'settings';
  // 🌟 种草工坊与爆款复刻独立全屏工作台：打开后像画布一样是新的单独界面，隐藏全局 Sidebar，全屏沉浸
  const isWorkshopFullscreen = currentView === 'workshop' || currentView === 'replicate';
  const isDedicatedFullscreen = isCanvasFullscreen || isSettingsFullscreen || isWorkshopFullscreen;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const extra: Record<string, string> = {};
    if (currentView === 'workshop') {
      extra.step = String(currentStep);
    } else if (currentView === 'canvas' && activeCanvasProjectId) {
      extra.project = activeCanvasProjectId;
    }
    syncViewToUrl(
      currentView,
      Object.keys(extra).length > 0 ? extra : undefined,
    );
  }, [currentView, currentStep, activeCanvasProjectId]);

  const enterOriginalWorkshop = () => {
    const store = useAppStore.getState();
    store.setWorkshopMode('storyboard_generate');
    store.setActiveWorkshopTab('studio');
    setCurrentView('workshop');
  };

  const enterReplication = () => {
    useAppStore.getState().setWorkshopMode('social_face_product_swap');
    setCurrentView('replicate');
  };

  return (
    <GeneratingEffectsProvider>
    <div className="h-screen w-screen bg-[#FAFAFC] text-slate-900 flex flex-col overflow-hidden selection:bg-blue-100 selection:text-blue-900" data-density={density}>
      {/* 🌟 0. 顶部 macOS 专属全宽拖拽控制条 (画板、全屏设置与种草工坊时隐藏，由各页面头部接管) */}
      {!isDedicatedFullscreen && <MacTitleBar />}

      {/* 🌟 1. 设置全屏独立视图 (对标 Codex 桌面端，无弹窗遮罩，专属双栏架构) */}
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
          {(!isDedicatedFullscreen || currentView === 'workshop') && <GlobalDynamicBackground currentView={currentView} />}

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
                      onEnterReplication={enterReplication}
                      onOpenCollectorHub={() => setIsCollectorOpen(true)}
                    />
                  </AppErrorBoundary>
                </ViewKeepAlivePanel>

                <ViewKeepAlivePanel view="generate" currentView={currentView}>
                  <AppErrorBoundary title="生成工作区异常" resetLabel="清空会话" onReset={() => useAppStore.setState({ generationTasks: [] })}>
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
                    <AssetCenter 
                      onEnterWorkshop={enterOriginalWorkshop}
                      onOpenSettings={navigateToSettings}
                    />
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

                {currentView === 'workshop' ? (
                  <AppErrorBoundary
                    title="种草工坊异常"
                    resetLabel="重置工坊"
                    onReset={() => {
                      clearWorkshopStudioDraft();
                      const store = useAppStore.getState();
                      store.resetModeSession('social_face_product_swap');
                      store.resetModeSession('storyboard_generate');
                    }}
                  >
                    <WorkshopStudio 
                      onOpenSettings={navigateToSettings}
                    />
                  </AppErrorBoundary>
                ) : currentView === 'replicate' ? (
                  <AppErrorBoundary
                    title="爆款复刻异常"
                    resetLabel="重置复刻"
                    onReset={() => {
                      clearWorkshopStudioDraft();
                      useAppStore.getState().resetModeSession('social_face_product_swap');
                    }}
                  >
                    <ReplicationStudio
                      onOpenSettings={navigateToSettings}
                    />
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
