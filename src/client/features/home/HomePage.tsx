import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '@client/store';
import { useQuickRefMediaDrop } from '@client/shared/hooks/useQuickRefMediaDrop';
import { useViewVisibility } from '@client/shared/hooks/useSafeTimeout';
import PromptActionBar from '@client/shared/prompt-bar/PromptActionBar';
import InspirationFeed from './components/inspiration/InspirationFeed';
import { inspirationComposerState, type InspirationUseOptions } from './model/inspirationItem';

interface Props {
  homeMode: 'generate' | 'canvas';
  setHomeMode: (mode: 'generate' | 'canvas') => void;
  recentProjects?: ReactNode;
}

export default function HomePage({
  recentProjects,
  homeMode,
  setHomeMode,
}: Props) {

  const { dropZoneProps: pageMediaDropProps, toastMsg: dropToastMsg } = useQuickRefMediaDrop();
  const visible = useViewVisibility();
  const [canvasVisited, setCanvasVisited] = useState(homeMode === 'canvas');
  useEffect(() => { if (homeMode === 'canvas') setCanvasVisited(true); }, [homeMode]);
  const modePanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (visible && useAppStore.getState().previousView === 'canvas') {
      modePanel.current?.focus();
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
      className="flex-1 min-w-0 w-full overflow-y-auto [scrollbar-gutter:stable] bg-[#f8fafc] dark:bg-[#111318] text-slate-900 dark:text-slate-100 select-none pb-16 relative"
    >
      {dropToastMsg && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900/95 dark:bg-[#20232A]/95 backdrop-blur-md border border-transparent dark:border-white/10 text-white dark:text-[#EDEDED] text-xs font-semibold shadow-xl">
          {dropToastMsg}
        </div>
      )}
      <div className="w-full px-4 pb-5 pt-6 sm:px-6 sm:pt-8 lg:px-8 2xl:px-10">
        <section className="mx-auto w-full max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1640px]">
          <h1 className="relative z-20 mx-auto mb-6 max-w-[1200px] text-[24px] font-medium tracking-tight text-slate-950 dark:text-white sm:text-[28px]">
            {homeMode === 'canvas' ? '让灵感，在画布上展开' : '把想法，交给 Agent'}
          </h1>

          <div ref={modePanel} id="home-mode-panel" role="region" tabIndex={-1} aria-label={homeMode === 'canvas' ? '无限画布' : 'Agent 创作'} className={`mx-auto w-full max-w-[1200px] rounded-3xl ${homeMode === 'canvas' ? 'outline-none' : ''}`}>
            {homeMode === 'generate' && (
              <div className="relative z-30">
                <PromptActionBar showBrandHero={false} inputPlaceholder="输入想法、描述或上传参考，开始创作" />
              </div>
            )}
            {(homeMode === 'canvas' || canvasVisited) && (
              <div aria-hidden={homeMode !== 'canvas'} inert={homeMode !== 'canvas'} className={homeMode === 'canvas' ? 'relative z-20' : 'hidden'}>
                <Suspense fallback={<p role="status" className="text-sm text-slate-500">正在加载项目列表…</p>}>
                  {recentProjects}
                </Suspense>
              </div>
            )}
          </div>
        </section>

        <div className="relative z-0 mt-10 w-full">
          <InspirationFeed onUsePrompt={handleUsePrompt} />
        </div>
      </div>

    </div>
  );
}
