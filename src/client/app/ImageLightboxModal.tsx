import { extractTaskReferenceImages } from '../shared/modals/lightbox/taskReferenceImages';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import '@client/shared/api/permanentDeleteGeneration';
import { downloadMediaOrOpen } from '@client/shared/media/downloadMedia';
import { videoPlaybackManager } from '@client/shared/media/videoPlaybackManager';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import { useToast } from '@client/shared/hooks/useToast';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';
import { TOAST_DURATION_MS } from '@client/shared/constants/timing';
import { formatPromptParagraphs } from '@shared/domain/media/drawing';
import { LightboxInfoPanel } from '../shared/modals/lightbox/LightboxInfoPanel';
import { LightboxToolPanel } from '../shared/modals/lightbox/LightboxToolPanel';
import { MultiAngleModal } from './lightbox/LightboxMultiAngleModal';
import { SmartEditModal } from '../shared/modals/lightbox/SmartEditModal';
import { OutpaintModal } from './lightbox/OutpaintModal';
import { useLightboxEditActions } from './lightbox/useLightboxEditActions';
import { LightboxMediaPanel } from './lightbox/LightboxMediaPanel';
import { resolveTaskPreviewQueue } from '@client/shared/modals/lightbox/taskPreviewQueue';
import { useGenerateTaskActions } from '@client/features/generate/hooks/useGenerateTaskActions';
import { isGenerationVideoTask } from '@client/shared/media/generationTaskMedia';
import { replacePromptReferenceMentions } from '@shared/domain/prompts/prompt-engine/mentions';

export function ImageLightboxModal() {
  const {
    previewTask,
    previewQueue,
    setPreviewTask,
    generationTasks,
    sessions,
    currentView,
    setCurrentView,
    setQuickPrompt,
    setQuickRefImage,
    setQuickGenMode,
    quickRefImage,
    quickModel,
    quickQuality,
    quickAspectId,
    setQuickModel,
    setQuickQuality,
    setQuickAspectId,
  } = useAppStore(
    useShallow((s) => ({
      previewTask: s.previewTask,
      previewQueue: s.previewQueue,
      setPreviewTask: s.setPreviewTask,
      generationTasks: s.generationTasks,
      sessions: s.sessions,
      currentView: s.currentView,
      setCurrentView: s.setCurrentView,
      setQuickPrompt: s.setQuickPrompt,
      setQuickRefImage: s.setQuickRefImage,
      setQuickGenMode: s.setQuickGenMode,
      quickRefImage: s.quickRefImage,
      quickModel: s.quickModel,
      quickQuality: s.quickQuality,
      quickAspectId: s.quickAspectId,
      setQuickModel: s.setQuickModel,
      setQuickQuality: s.setQuickQuality,
      setQuickAspectId: s.setQuickAspectId,
    })),
  );

  const hasPreviewTask = Boolean(previewTask);
  useEffect(() => hasPreviewTask ? videoPlaybackManager.suspend() : undefined, [hasPreviewTask]);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const { show: showToast } = useToast();
  const { setSafeTimeout } = useSafeTimeout();
  const { handleReuseTask, handleRegenerateTask } = useGenerateTaskActions(showToast);

  const isVideo = Boolean(previewTask && isGenerationVideoTask(previewTask));
  const {
    isMultiAngleOpen, setIsMultiAngleOpen,
    isSmartEditOpen, setIsSmartEditOpen,
    isOutpaintOpen, setIsOutpaintOpen,
    handleToolAction, handleSubmitNovelView, handleSubmitSmartEdit, handleSubmitOutpaint,
  } = useLightboxEditActions(previewTask, isVideo, showToast);

  const isGenerateView = currentView === 'generate';

  const promptText = previewTask?.prompt || '';
  const promptParagraphs = useMemo(() => formatPromptParagraphs(promptText), [promptText]);
  const isLongPrompt = promptText.length > 120 || promptParagraphs.length > 2;


  useEffect(() => {
    setIsPromptExpanded(false);
    setIsImageLoading(true);
  }, [previewTask?.id, previewTask?.resultUrl]);

  // 计算视频播放源（优先走带 Range/防盗链代理的 proxyMediaUrl，避免跨域阻断与防盗链拦截）
  const initialVideoSrc = useMemo(() => {
    if (!previewTask?.resultUrl) return '';
    const raw = previewTask.resultUrl;
    if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('/')) {
      return raw;
    }
    return proxyMediaUrl(raw, { asVideo: true });
  }, [previewTask?.resultUrl]);

  const [currentVideoSrc, setCurrentVideoSrc] = useState(initialVideoSrc);
  const [videoMetadata, setVideoMetadata] = useState<{ resultUrl: string; duration: number } | null>(null);
  const actualVideoDuration = videoMetadata?.resultUrl === previewTask?.resultUrl
    ? videoMetadata?.duration : undefined;
  const handleVideoDuration = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const duration = event.currentTarget.duration;
    if (previewTask?.resultUrl && Number.isFinite(duration) && duration > 0) {
      setVideoMetadata({ resultUrl: previewTask.resultUrl, duration });
    }
  };
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(true);

  useEffect(() => {
    setCurrentVideoSrc(initialVideoSrc);
    setVideoLoadFailed(false);
    setIsVideoLoading(true);
  }, [initialVideoSrc]);

  // 视频加载异常时自动在 proxyMediaUrl 与原 URL 之间故障转移
  const handleVideoError = useCallback(() => {
    const raw = previewTask?.resultUrl;
    if (!raw) return;
    if (currentVideoSrc !== raw) {
      setCurrentVideoSrc(raw);
    } else {
      setVideoLoadFailed(true);
      setIsVideoLoading(false);
    }
  }, [previewTask?.resultUrl, currentVideoSrc]);

  // 视频就绪时优雅尝试播放，若浏览器 autoplay 策略阻止有声播放，则降级为静音自动播放，防止锁死在禁止符号
  const handleVideoCanPlay = useCallback(() => {
    setIsVideoLoading(false);
    setVideoLoadFailed(false);
    if (videoRef.current) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          if (videoRef.current) {
            videoRef.current.muted = true;
            void videoRef.current.play().catch(() => {});
          }
        });
      }
    }
  }, []);



  const livePreviewQueue = useMemo(() => resolveTaskPreviewQueue(
    previewTask, previewQueue, generationTasks, sessions,
  ), [previewTask, previewQueue, generationTasks, sessions]);
  const successTasks = useMemo(() => livePreviewQueue.filter(
    (task) => task.resultUrl && (task.status === 'SUCCESS' || !task.status),
  ), [livePreviewQueue]);

  // 聚合当前任务所属同批次/同队列/同会话所有兄弟任务中使用的参考素材池（彻底杜绝翻页后子任务缺少字段导致素材丢失）
  const batchReferenceImages = useMemo(() => {
    if (!previewTask) return [];
    const list: string[] = [];
    const pushIfValid = (val: any) => {
      if (typeof val === 'string' && val.trim().length > 0) {
        list.push(val.trim());
      } else if (Array.isArray(val)) {
        val.forEach(pushIfValid);
      }
    };

    const extractFromTask = (task: unknown) => {
      extractTaskReferenceImages(task).forEach(pushIfValid);
    };

    // 1. 优先提取当前 previewTask
    extractFromTask(previewTask);

    // 2. 提取当前翻页队列中的所有任务（如 1/6 ~ 6/6）
    if (successTasks && successTasks.length > 0) {
      successTasks.forEach(extractFromTask);
    }

    // 3. 提取 previewQueue 中的所有任务
    if (previewQueue && previewQueue.length > 0) {
      previewQueue.forEach(extractFromTask);
    }

    // 4. 提取 generationTasks 中属于同一 batchId 或同一会话的任务
    if (previewTask.batchId || previewTask.sessionId) {
      generationTasks.forEach((t) => {
        if (
          (previewTask.batchId && t.batchId === previewTask.batchId) ||
          (previewTask.sessionId && t.sessionId === previewTask.sessionId && t.prompt === previewTask.prompt)
        ) {
          extractFromTask(t);
        }
      });
    }

    // 过滤去重，排除与当前预览图完全相同的 URL
    return Array.from(new Set(list)).filter(
      (url) => Boolean(url) && url !== previewTask.resultUrl
    );
  }, [previewTask, successTasks, previewQueue, generationTasks]);

  const currentIndex = previewTask
    ? successTasks.findIndex(
        (t) =>
          t.id === previewTask.id ||
          (previewTask.taskId && t.taskId === previewTask.taskId) ||
          (t.resultUrl && t.resultUrl === previewTask.resultUrl),
      )
    : -1;
  const total = successTasks.length;

  const handlePrev = () => {
    if (total > 1 && currentIndex >= 0) {
      const prevIdx = (currentIndex - 1 + total) % total;
      setPreviewTask(successTasks[prevIdx], livePreviewQueue);
    }
  };

  const handleNext = () => {
    if (total > 1 && currentIndex >= 0) {
      const nextIdx = (currentIndex + 1) % total;
      setPreviewTask(successTasks[nextIdx], livePreviewQueue);
    }
  };

  useEffect(() => {
    if (previewTask) {
      setIsImageLoading(true);
    }
  }, [previewTask]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!previewTask) return;
      if (e.key === 'Escape') {
        setPreviewTask(null);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (total > 1 && currentIndex >= 0) {
          const prevIdx = (currentIndex - 1 + total) % total;
          setPreviewTask(successTasks[prevIdx], livePreviewQueue);
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (total > 1 && currentIndex >= 0) {
          const nextIdx = (currentIndex + 1) % total;
          setPreviewTask(successTasks[nextIdx], livePreviewQueue);
        }
      } else if (e.key === ' ' && isVideo && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) {
          videoRef.current.play();
        } else {
          videoRef.current.pause();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewTask, currentIndex, successTasks, livePreviewQueue, total, setPreviewTask, isVideo]);




  const handleDownload = async () => {
    if (!previewTask?.resultUrl || isDownloading) return;
    try {
      setIsDownloading(true);
      const ext = isVideo ? 'mp4' : 'png';
      const safeTitle = (previewTask.title || previewTask.prompt || 'beikeyuntu')
        .slice(0, 24)
        .replace(/[\\/:*?"<>|]/g, '_');
      const filename = `${safeTitle}_${Date.now()}.${ext}`;
      await downloadMediaOrOpen(previewTask.resultUrl, filename);
      setDownloadSuccess(true);
      setSafeTimeout(() => {
        setDownloadSuccess(false);
      }, TOAST_DURATION_MS);
    } catch (err) {
      console.error('下载素材异常:', err);
      showToast(err instanceof Error ? err.message : '下载失败，请打开原文件手动保存或重试');
    } finally {
      setIsDownloading(false);
    }
  };



  const handleUsePromptOnly = useCallback(() => {
    if (!previewTask?.prompt) return;
    useAppStore.setState({ quickVideoRefMode: 'omni', quickVideoFirstFrame: null,
      quickVideoLastFrame: null, quickVideoMultiFrames: [] });
    setQuickPrompt(replacePromptReferenceMentions(previewTask.prompt));
    setQuickGenMode(isVideo ? 'video' : 'image');
    setQuickRefImage(null);
    setCurrentView('generate');
    setPreviewTask(null);
    showToast('✨ 已填入提示词，可立即生成');
  }, [previewTask?.prompt, isVideo, setQuickPrompt, setQuickGenMode, setQuickRefImage, setCurrentView, setPreviewTask, showToast]);

  const handleUseAsReference = useCallback(() => {
    if (!previewTask?.resultUrl) return;
    useAppStore.setState({ quickVideoRefMode: 'omni', quickVideoFirstFrame: null,
      quickVideoLastFrame: null, quickVideoMultiFrames: [] });
    setQuickPrompt(replacePromptReferenceMentions(previewTask.prompt || useAppStore.getState().quickPrompt,
      isVideo ? '@视频1' : '@图片1'));
    setQuickGenMode(isVideo ? 'video' : 'image');
    setQuickRefImage(previewTask.resultUrl);
    setCurrentView('generate');
    setPreviewTask(null);
    showToast('✨ 已设置为参考素材');
  }, [previewTask?.resultUrl, previewTask?.prompt, isVideo, setQuickPrompt, setQuickGenMode, setQuickRefImage, setCurrentView, setPreviewTask, showToast]);


  const handleReEdit = useCallback(() => {
    if (!previewTask) return;
    handleReuseTask(previewTask);
    setCurrentView('generate');
    setPreviewTask(null);
    showToast('✏️ 已填入输入框进行编辑');
  }, [previewTask, handleReuseTask, setCurrentView, setPreviewTask, showToast]);

  const handleRegenerate = useCallback(async () => {
    if (!previewTask) return;
    if (!await handleRegenerateTask(previewTask)) return;
    setCurrentView('generate');
    setPreviewTask(null);
    showToast('🚀 已创建再次生成任务');
  }, [previewTask, handleRegenerateTask, setCurrentView, setPreviewTask, showToast]);

  if (!previewTask || !previewTask.resultUrl) return null;

  const dateStr = previewTask.createdAt
    ? new Date(previewTask.createdAt)
        .toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
        .replace(/\//g, '-')
    : new Date()
        .toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
        .replace(/\//g, '-');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-2 sm:p-4 pb-24 sm:pb-28 md:pb-20 animate-fade-in select-none"
      onClick={() => setPreviewTask(null)}
    >
      <div
        className="w-full max-w-7xl max-h-[88vh] flex flex-col md:flex-row items-center justify-center gap-4 sm:gap-6 relative pointer-events-none"
      >
        <LightboxMediaPanel
          previewTask={previewTask}
          isVideo={isVideo}
          total={total}
          currentIndex={currentIndex}
          handlePrev={handlePrev}
          handleNext={handleNext}
          videoRef={videoRef}
          currentVideoSrc={currentVideoSrc}
          videoLoadFailed={videoLoadFailed}
          isVideoLoading={isVideoLoading}
          isImageLoading={isImageLoading}
          handleVideoCanPlay={handleVideoCanPlay}
          handleVideoDuration={handleVideoDuration}
          handleVideoError={handleVideoError}
          setIsVideoLoading={setIsVideoLoading}
          setIsImageLoading={setIsImageLoading}
        />

        {/* 🌟 2. 右侧区域：主信息卡片 (完全对齐图 1) + 对话生图界面专有工具箱面板 (完全对齐图 2) */}
        <div
          className="w-full md:w-[360px] lg:w-[380px] xl:w-[400px] max-h-[50vh] md:max-h-[88vh] flex flex-col gap-3 shrink-0 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200/90 pr-1 select-none pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 2.1 主信息面板 (Header 贝壳云图+浅灰圆角下载按钮，日期，提示词展开/折叠，规格参数条，做同款+用作参考图) */}
          <LightboxInfoPanel
            previewTask={previewTask}
            isVideo={isVideo}
            actualVideoDuration={actualVideoDuration}
            dateStr={dateStr}
            isDownloading={isDownloading}
            downloadSuccess={downloadSuccess}
            handleDownload={handleDownload}
            promptText={promptText}
            promptParagraphs={promptParagraphs}
            isLongPrompt={isLongPrompt}
            isPromptExpanded={isPromptExpanded}
            setIsPromptExpanded={setIsPromptExpanded}
            onUsePromptOnly={handleUsePromptOnly}
            onUseAsReference={handleUseAsReference}
            fallbackReferenceImages={batchReferenceImages}
          />

          {/* 2.2 生产对话生成界面特有的扩展工具箱面板 (完全对齐图 2 红框区域) */}
          {isGenerateView && (
            <LightboxToolPanel
              previewTask={previewTask}
              isVideo={isVideo}
              isCurrentRefImage={quickRefImage === previewTask.resultUrl}
              onUseAsReference={handleUseAsReference}
              onReEdit={handleReEdit}
              onRegenerate={handleRegenerate}
              onToolAction={handleToolAction}
            />
          )}
        </div>
      </div>

      {/* 🌟 3. 对话生图特有的扩展功能子弹窗 (多角度、智能改图、扩图) */}
      {isGenerateView && !isVideo && (
        <>
          <MultiAngleModal
            isOpen={isMultiAngleOpen}
            onClose={() => setIsMultiAngleOpen(false)}
            imageUrl={previewTask.resultUrl}
            originalPrompt={previewTask.prompt}
            onSubmitNovelView={handleSubmitNovelView}
          />

          <SmartEditModal
            isOpen={isSmartEditOpen}
            onClose={() => setIsSmartEditOpen(false)}
            imageUrl={previewTask.resultUrl}
            originalPrompt={previewTask.prompt}
            onSubmitSmartEdit={handleSubmitSmartEdit}
            quickModel={quickModel}
            quickQuality={quickQuality}
            quickAspectId={quickAspectId}
            onChangeQuickModel={setQuickModel}
            onChangeQuickQuality={setQuickQuality}
            onChangeQuickAspectId={setQuickAspectId}
          />

          <OutpaintModal
            isOpen={isOutpaintOpen}
            onClose={() => setIsOutpaintOpen(false)}
            imageUrl={previewTask.resultUrl}
            originalPrompt={previewTask.prompt}
            onSubmitOutpaint={handleSubmitOutpaint}
          />
        </>
      )}
    </div>
  );
}

export default ImageLightboxModal;
