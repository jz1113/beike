import { useState, type ReactNode } from 'react';
import { useAppStore } from '@client/store';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { useQuickRefMediaDrop } from '@client/shared/hooks/useQuickRefMediaDrop';
import { useToast } from '@client/shared/hooks/useToast';
import PromptActionBar from '@client/shared/prompt-bar';
import FeatureCapsules from './components/FeatureCapsules';
import InspirationFeed from './components/inspiration/InspirationFeed';
import { type InspirationUseOptions } from './components/inspiration/InspirationModal';

interface Props {
  onEnterWorkshop: () => void;
  onOpenHeadlinePoster: () => void;
  onOpenKeywordReview: () => void;
  onOpenPptGenerator?: () => void;
  onOpenAvatarStudio?: () => void;
  onOpenVideoSales?: () => void;
  onOpenCollectorHub?: () => void;
  recentProjects?: ReactNode;
}

export default function HomePage({
  onEnterWorkshop,
  onOpenHeadlinePoster,
  onOpenKeywordReview,
  onOpenPptGenerator,
  onOpenAvatarStudio,
  onOpenVideoSales,
  onOpenCollectorHub,
  recentProjects,
}: Props) {
  const [homeMode, setHomeMode] = useState<'generate' | 'canvas'>('generate');
  const setQuickPrompt = useAppStore((s) => s.setQuickPrompt);
  const setQuickRefImage = useAppStore((s) => s.setQuickRefImage);
  const setQuickRefImages = useAppStore((s) => s.setQuickRefImages);
  const setQuickGenMode = useAppStore((s) => s.setQuickGenMode);
  const setQuickVideoRefMode = useAppStore((s) => s.setQuickVideoRefMode);
  const setQuickVideoDuration = useAppStore((s) => s.setQuickVideoDuration);
  const setQuickVideoModel = useAppStore((s) => s.setQuickVideoModel);
  const setQuickVideoAspectId = useAppStore((s) => s.setQuickVideoAspectId);
  const setQuickVideoResolution = useAppStore((s) => s.setQuickVideoResolution);

  const { dropZoneProps: pageMediaDropProps, toastMsg: dropToastMsg } = useQuickRefMediaDrop();
  const { message: featureToastMsg, show: showFeatureToast } = useToast();
  const activeToast = featureToastMsg || dropToastMsg;

  const handleUsePrompt = (prompt: string, refMedia?: string, opts?: InspirationUseOptions) => {
    setHomeMode('generate');
    const isVideo = !!(refMedia && isVideoMediaUrl(refMedia));
    setQuickPrompt(prompt);

    if (opts?.referenceImages?.length) {
      setQuickGenMode('video');
      setQuickVideoRefMode(opts.videoRefMode || 'omni');
      setQuickRefImages(opts.referenceImages);
      if (opts.videoDuration) setQuickVideoDuration(opts.videoDuration);
      if (opts.videoModel) setQuickVideoModel(opts.videoModel);
      if (opts.videoAspectId) setQuickVideoAspectId(opts.videoAspectId);
      if (opts.videoResolution) setQuickVideoResolution(opts.videoResolution);
    } else if (isVideo && refMedia) {
      setQuickGenMode('video');
      setQuickVideoRefMode('omni');
      setQuickRefImage(refMedia);
    } else if (refMedia) {
      setQuickGenMode('image');
      setQuickRefImage(refMedia);
    } else {
      setQuickGenMode('image');
      setQuickRefImage(null);
    }
  };

  return (
    <div
      data-hub-scroll
      {...pageMediaDropProps}
      className="flex-1 min-w-0 w-full overflow-y-auto bg-transparent text-slate-900 dark:text-slate-100 select-none pb-16 relative"
    >
      {activeToast && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900/95 dark:bg-[#20232A]/95 backdrop-blur-md border border-transparent dark:border-white/10 text-white dark:text-[#EDEDED] text-xs font-semibold shadow-xl">
          {activeToast}
        </div>
      )}
      <div className="w-full px-4 pb-5 pt-7 sm:px-6 sm:pt-10 lg:px-8 2xl:px-10">
        <section className="mx-auto w-full max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1640px]">
          <div className="relative z-20 mx-auto flex max-w-[1120px] flex-col items-center">
            <h1 className="text-[28px] font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[34px]">
              今天要做点什么？
            </h1>
            <span aria-hidden="true" className="mt-3 h-[3px] w-10 rounded-full bg-[#df6a48]" />
            <div role="tablist" aria-label="首页创作模式" className="mt-6 inline-flex rounded-full bg-black/[0.04] dark:bg-[#1B1B1E] p-1 shadow-2xs ring-1 ring-black/[0.06] dark:ring-white/[0.08] backdrop-blur-md">
              <button
                type="button"
                role="tab"
                aria-selected={homeMode === 'generate'}
                onClick={() => setHomeMode('generate')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all cursor-pointer ${homeMode === 'generate' ? 'bg-white dark:bg-[#2C2C32] text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-[#EDEDED]'}`}
              >
                生成
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={homeMode === 'canvas'}
                onClick={() => setHomeMode('canvas')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all cursor-pointer ${homeMode === 'canvas' ? 'bg-white dark:bg-[#2C2C32] text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-900 dark:hover:text-[#EDEDED]'}`}
              >
                画布
              </button>
            </div>
          </div>

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
                  onOpenPptGenerator={onOpenPptGenerator}
                  onOpenAvatarStudio={onOpenAvatarStudio}
                  onOpenVideoSales={onOpenVideoSales}
                  onOpenCollectorHub={onOpenCollectorHub}
                  onPlaceholderClick={(title) => showFeatureToast(`「${title}」功能正在开发中，敬请期待`)}
                />
              </div>
            </div>
          ) : (
            <div className="relative z-20 mx-auto mt-8 w-full max-w-[1120px]">
              {recentProjects}
            </div>
          )}
        </section>

        <div className="relative z-0 mt-5 w-full">
          <InspirationFeed onUsePrompt={handleUsePrompt} />
        </div>
      </div>

    </div>
  );
}
