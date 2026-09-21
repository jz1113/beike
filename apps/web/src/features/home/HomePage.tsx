import { useState, type ReactNode } from 'react';
import { useAppStore } from '@/store';
import { isVideoMediaUrl } from '@/shared/media/mediaHelper';
import { useQuickRefMediaDrop } from '@/shared/hooks/useQuickRefMediaDrop';
import PromptActionBar from './components/prompt-bar/PromptActionBar';
import FeatureCapsules from './components/FeatureCapsules';
import InspirationFeed from './components/inspiration/InspirationFeed';
import { type InspirationUseOptions } from './components/inspiration/InspirationModal';

interface Props {
  onEnterWorkshop: () => void;
  onOpenHeadlinePoster: () => void;
  onOpenCollectorHub?: () => void;
  recentProjects?: ReactNode;
}

export default function HomePage({
  onEnterWorkshop,
  onOpenHeadlinePoster,
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

  const { dropZoneProps: pageMediaDropProps, toastMsg } = useQuickRefMediaDrop();

  const handleUsePrompt = (prompt: string, refMedia?: string, opts?: InspirationUseOptions) => {
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
      className="flex-1 min-w-0 w-full overflow-y-auto bg-transparent text-slate-900 select-none pb-16 relative"
    >
      {toastMsg && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900 text-white text-xs font-semibold shadow-xl">
          {toastMsg}
        </div>
      )}
      <div className="w-full px-4 pb-5 pt-7 sm:px-6 sm:pt-10 lg:px-8 2xl:px-10">
        <section className="mx-auto w-full max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1640px]">
          <div className="relative z-20 mx-auto max-w-[1120px] text-center">
            <div className="mx-auto flex max-w-2xl flex-col items-center px-4">
              <p className="font-brush mb-3 inline-flex items-baseline gap-2 text-slate-400">
                <span className="text-[18px] tracking-[0.09em] text-slate-500 sm:text-[20px]">贝壳云图</span>
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#df6a48]" />
                <span className="text-[13px] tracking-[0.18em] text-slate-400 sm:text-[14px]">CREATIVE STUDIO</span>
              </p>
              <h1 className="font-brush whitespace-nowrap text-[clamp(30px,3.7vw,60px)] leading-[1.04] tracking-[0.025em] text-[#0a0a0a]" aria-label="把灵感，变成画面">
                把灵感，变成画面
              </h1>
              <p className="font-brush mt-2 text-[13px] tracking-[0.02em] text-slate-400 sm:text-[14px]">
                从一张参考图或一句描述开始
              </p>
            </div>
            <div role="tablist" aria-label="首页创作模式" className="mx-auto mt-6 inline-flex w-[min(100%,420px)] rounded-full bg-slate-100 p-1 shadow-inner">
              <button
                type="button"
                role="tab"
                aria-selected={homeMode === 'generate'}
                onClick={() => setHomeMode('generate')}
                className={`flex-1 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${homeMode === 'generate' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}
              >
                生成
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={homeMode === 'canvas'}
                onClick={() => setHomeMode('canvas')}
                className={`flex-1 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${homeMode === 'canvas' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}
              >
                画布
              </button>
            </div>
          </div>

          {homeMode === 'generate' ? (
            <div className="relative z-20 mt-8">
              <div className="mx-auto max-w-[1120px]">
                <PromptActionBar showBrandHero={false} />
              </div>
              <div className="mt-4 w-full">
                <FeatureCapsules
                  onEnterWorkshop={onEnterWorkshop}
                  onOpenHeadlinePoster={onOpenHeadlinePoster}
                  onOpenCollectorHub={onOpenCollectorHub}
                />
              </div>
            </div>
          ) : (
            <div className="relative z-20 mx-auto mt-9 w-full max-w-[1640px]">
              <div className="w-full">{recentProjects}</div>
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
