import { useAppStore } from '@/store/useAppStore';
import { isVideoMediaUrl } from '@/lib/mediaHelper';
import { useQuickRefMediaDrop } from '@/lib/useQuickRefMediaDrop';
import PromptActionBar from './components/prompt-bar/PromptActionBar';
import FeatureCapsules from './components/FeatureCapsules';
import CanvasRecentProjects from '@/features/canvas/components/CanvasRecentProjects';
import InspirationFeed from './components/inspiration/InspirationFeed';
import { type InspirationUseOptions } from './components/inspiration/InspirationModal';

interface Props {
  onEnterWorkshop: () => void;
  onEnterReplication: () => void;
  onOpenCollectorHub?: () => void;
}

export default function HomePage({
  onEnterWorkshop,
  onEnterReplication,
  onOpenCollectorHub,
}: Props) {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
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

  const handleEnterCanvas = () => {
    setCurrentView('canvas');
  };

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
      <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-10 pt-3 sm:pt-4 pb-5 sm:pb-6 space-y-6">
        <div className="w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1360px] mx-auto space-y-3.5 relative z-20">
          <PromptActionBar />
          <FeatureCapsules
            onEnterWorkshop={onEnterWorkshop}
            onEnterReplication={onEnterReplication}
            onOpenCollectorHub={onOpenCollectorHub}
          />
        </div>

        {/* 🌟 楼层一：最近项目 · 画布创作 */}
        <div className="w-full relative z-10 pt-1">
          <CanvasRecentProjects onEnterCanvas={handleEnterCanvas} />
        </div>

        {/* 🌟 楼层二：灵感探索瀑布流 */}
        <div className="w-full relative z-0 pt-1">
          <InspirationFeed onUsePrompt={handleUsePrompt} />
        </div>
      </div>

    </div>
  );
}

