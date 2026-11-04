import { Suspense, useEffect, useRef, type ReactNode } from 'react';
import { useAppStore } from '@client/store';
import { useQuickRefMediaDrop } from '@client/shared/hooks/useQuickRefMediaDrop';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import PromptActionBar from '@client/shared/prompt-bar/PromptActionBar';
import FeatureCapsules from './components/FeatureCapsules';
import InspirationFeed from './components/inspiration/InspirationFeed';
import type { InspirationUseOptions } from './model/inspirationItem';
import { inspirationComposerState } from './model/inspirationComposer';

interface Props {
  homeMode: 'generate' | 'canvas';
  setHomeMode: (mode: 'generate' | 'canvas') => void;
  onEnterWorkshop: () => void;
  onOpenHeadlinePoster: () => void;
  onOpenKeywordReview: () => void;
  onOpenVideoSales: () => void;
  onOpenCollectorHub: () => void;
  recentProjects?: ReactNode;
}

export default function HomePage({
  onEnterWorkshop,
  onOpenHeadlinePoster,
  onOpenKeywordReview,
  onOpenVideoSales,
  onOpenCollectorHub,
  recentProjects,
  homeMode,
  setHomeMode,
}: Props) {

  const { dropZoneProps: pageMediaDropProps, toastMsg: dropToastMsg } = useQuickRefMediaDrop();
  const visible = useViewVisibility();
  const modeTabs = useRef<HTMLDivElement>(null);
  const modePanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (visible && useAppStore.getState().previousView === 'canvas') {
      modeTabs.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    } else if (visible && useAppStore.getState().previousView === 'asset_library') {
      const frame = requestAnimationFrame(() => modePanel.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [visible]);

  const handleUsePrompt = (prompt: string, refMedia?: string, opts?: InspirationUseOptions) => {
    setHomeMode('generate');
    useAppStore.setState(inspirationComposerState(prompt, refMedia, opts));
  };

  return (
    <div
      data-hub-scroll
      {...pageMediaDropProps}
      className="flex-1 min-w-0 w-full overflow-y-auto [scrollbar-gutter:stable] bg-transparent text-slate-900 dark:text-slate-100 select-none pb-16 relative"
    >
      {dropToastMsg && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900/95 dark:bg-[#20232A]/95 backdrop-blur-md border border-transparent dark:border-white/10 text-white dark:text-[#EDEDED] text-xs font-semibold shadow-xl">
          {dropToastMsg}
        </div>
      )}
      <div className="w-full px-4 pb-5 pt-7 sm:px-6 sm:pt-10 lg:px-8 2xl:px-10">
        <section className="mx-auto w-full max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1640px]">
          <div className="relative z-20 mx-auto flex max-w-[1120px] flex-col items-center">
            <h1 className="text-[28px] font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[34px]">
              今天要做点什么？
            </h1>
            <span aria-hidden="true" className="mt-3 h-[3px] w-10 rounded-full bg-[#df6a48]" />
            <div ref={modeTabs} role="tablist" aria-label="首页创作模式" className="mt-6 inline-flex rounded-full bg-black/[0.04] dark:bg-[#1B1B1E] p-1 shadow-2xs ring-1 ring-black/[0.06] dark:ring-white/[0.08] backdrop-blur-md">
              {(['generate', 'canvas'] as const).map(mode => (
                <button
                  key={mode}
                  id={`home-mode-${mode}`}
                  type="button"
                  role="tab"
                  aria-selected={homeMode === mode}
                  aria-controls="home-mode-panel"
                  tabIndex={homeMode === mode ? 0 : -1}
                  onClick={() => setHomeMode(mode)}
                  onKeyDown={event => {
                    let next: typeof mode;
                    switch (event.key) {
                      case 'Home': next = 'generate'; break;
                      case 'End': next = 'canvas'; break;
                      case 'ArrowLeft':
                      case 'ArrowRight': next = mode === 'generate' ? 'canvas' : 'generate'; break;
                      default: return;
                    }
                    event.preventDefault();
                    document.getElementById(`home-mode-${next}`)?.focus();
                    setHomeMode(next);
                  }}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all cursor-pointer ${homeMode === mode ? 'bg-white dark:bg-[#2C2C32] text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-[#EDEDED]'}`}
                >
                  {mode === 'generate' ? '生成' : '画布'}
                </button>
              ))}
            </div>
          </div>

          <div ref={modePanel} id="home-mode-panel" role="tabpanel" aria-labelledby={`home-mode-${homeMode}`}>
            {homeMode === 'generate' ? (
              <div className="relative z-20 mt-8">
                <div className="relative z-30 mx-auto max-w-[1120px]">
                  <PromptActionBar showBrandHero={false} />
                </div>
                <div className="relative z-10 mt-4 w-full">
                  <FeatureCapsules
                    onEnterWorkshop={onEnterWorkshop}
                    onOpenHeadlinePoster={onOpenHeadlinePoster}
                    onOpenKeywordReview={onOpenKeywordReview}
                    onOpenVideoSales={onOpenVideoSales}
                    onOpenCollectorHub={onOpenCollectorHub}
                  />
                </div>
              </div>
            ) : (
              <div className="relative z-20 mx-auto mt-8 w-full max-w-[1120px]">
                <Suspense fallback={<p role="status" className="text-sm text-slate-500">正在加载项目列表…</p>}>
                  {recentProjects}
                </Suspense>
              </div>
            )}
          </div>
        </section>

        <div className="relative z-0 mt-5 w-full">
          <InspirationFeed onUsePrompt={handleUsePrompt} />
        </div>
      </div>

    </div>
  );
}
