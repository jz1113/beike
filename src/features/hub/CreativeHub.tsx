'use client';
import { useCallback, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useFileDropZone } from '@/lib/useFileDropZone';
import { isImageOrVideoFile, processDroppedMediaFiles } from '@/lib/mediaUpload';
import PromptActionBar from './PromptActionBar';
import FeatureCapsules from './FeatureCapsules';
import InspirationFeed from './InspirationFeed';
import type { InspirationUseOptions } from './InspirationModal';

interface Props {
  onEnterBuyerShow: () => void;
  onOpenHistory: () => void;
  onOpenPromptVault: () => void;
  onOpenSettings: () => void;
  onOpenCollectorHub?: () => void;
}

export default function CreativeHub({ 
  onEnterBuyerShow, 
  onOpenHistory, 
  onOpenPromptVault, 
  onOpenSettings,
  onOpenCollectorHub
}: Props) {
  const {
    setQuickPrompt,
    setQuickRefImage,
    setQuickRefImages,
    setHubGenMode,
    setQuickVideoRefMode,
    setQuickVideoDuration,
    setQuickVideoModel,
    setQuickVideoAspectId,
    setQuickVideoResolution,
    addQuickRefImage,
  } = useAppStore();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  }, []);

  const rejectDrop = useCallback(() => {
    showToast('无法识别拖入的文件，请使用 JPG/PNG/WebP 等图片或 MP4/MOV 视频');
  }, [showToast]);

  const ingestPageMediaFiles = useCallback(
    (files: File[]) => {
      void processDroppedMediaFiles(files, (url) => {
        addQuickRefImage(url);
      }, {
        onAllSkipped: rejectDrop,
        onError: (msg) => showToast(msg),
      }).catch(() => showToast('无法读取拖入的文件'));
    },
    [addQuickRefImage, rejectDrop, showToast],
  );

  const { dropZoneProps: pageMediaDropProps } = useFileDropZone({
    onFiles: ingestPageMediaFiles,
    accept: isImageOrVideoFile,
    onReject: rejectDrop,
  });

  const handleUsePrompt = (prompt: string, refMedia?: string, opts?: InspirationUseOptions) => {
    const isVideo = !!(refMedia && (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(refMedia) || refMedia.startsWith('data:video/')));
    setQuickPrompt(prompt);

    if (opts?.referenceImages?.length) {
      setHubGenMode('video');
      setQuickVideoRefMode(opts.videoRefMode || 'omni');
      setQuickRefImages(opts.referenceImages);
      if (opts.videoDuration) setQuickVideoDuration(opts.videoDuration);
      if (opts.videoModel) setQuickVideoModel(opts.videoModel);
      if (opts.videoAspectId) setQuickVideoAspectId(opts.videoAspectId);
      if (opts.videoResolution) setQuickVideoResolution(opts.videoResolution);
    } else if (isVideo && refMedia) {
      // 视频灵感：携带参考视频 + 切到全能参考
      setHubGenMode('video');
      setQuickVideoRefMode('omni');
      setQuickRefImage(refMedia);
    } else if (refMedia) {
      // 显式「用作参考图」才带图
      setHubGenMode('image');
      setQuickRefImage(refMedia);
    } else {
      // 文生图「做同款」：只填提示词，清掉参考素材，避免误成图生图
      setHubGenMode('image');
      setQuickRefImage(null);
    }
  };

  return (
    <div
      data-hub-scroll
      {...pageMediaDropProps}
      className="flex-1 min-w-0 w-full overflow-y-auto bg-[#F8F9FC] text-slate-900 select-none pb-16 relative"
    >
      {toastMsg && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900 text-white text-xs font-semibold shadow-xl">
          {toastMsg}
        </div>
      )}
      <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-10 py-5 sm:py-6 space-y-6">
        {/* 🌟 1. 顶部核心：对话生图控制大卡片 */}
        <div className="max-w-6xl xl:max-w-7xl 2xl:max-w-[1460px] mx-auto w-full space-y-4">
          <PromptActionBar onOpenProductVault={onOpenHistory} />
          <FeatureCapsules 
            onEnterBuyerShow={onEnterBuyerShow} 
            onOpenCollectorHub={onOpenCollectorHub}
          />
        </div>

        {/* 🌟 2. 下方：即梦风格紧凑无缝灵感瀑布流 */}
        <div className="w-full">
          <InspirationFeed
            onUsePrompt={handleUsePrompt}
            onOpenProductVault={onOpenHistory}
          />
        </div>
      </div>
    </div>
  );
}
