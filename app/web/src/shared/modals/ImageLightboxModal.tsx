import { extractTaskReferenceImages } from './lightbox/taskReferenceImages';
import { proxyMediaUrl } from '@/lib/apiClient';
import '@/lib/permanentDeleteGeneration';
import { downloadMediaOrOpen, openExternalUrl } from '@/lib/downloadMedia';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { useToast } from '@/lib/useToast';
import { useSafeTimeout } from '@/lib/useSafeTimeout';
import { TOAST_DURATION_MS } from '@/lib/constants/timing';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { formatPromptParagraphs, buildMultiAnglePrompt, buildSmartEditPrompt } from '@beike/domain/drawing';
import type { GenerationTask } from '@/types/app-store';
import { LightboxInfoPanel } from './lightbox/LightboxInfoPanel';
import { LightboxToolPanel } from './lightbox/LightboxToolPanel';
import { MultiAngleModal } from './lightbox/MultiAngleModal';
import { SmartEditModal } from './lightbox/SmartEditModal';
import { OutpaintModal } from './lightbox/OutpaintModal';
import { calculateTargetDimensions } from './lightbox/lightboxDimensions';

export function ImageLightboxModal() {
  const {
    previewTask,
    previewQueue,
    setPreviewTask,
    generationTasks,
    currentView,
    setCurrentView,
    setQuickPrompt,
    setQuickRefImage,
    setQuickGenMode,
    quickRefImage,
    addGenerationTask,
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
      currentView: s.currentView,
      setCurrentView: s.setCurrentView,
      setQuickPrompt: s.setQuickPrompt,
      setQuickRefImage: s.setQuickRefImage,
      setQuickGenMode: s.setQuickGenMode,
      quickRefImage: s.quickRefImage,
      addGenerationTask: s.addGenerationTask,
      quickModel: s.quickModel,
      quickQuality: s.quickQuality,
      quickAspectId: s.quickAspectId,
      setQuickModel: s.setQuickModel,
      setQuickQuality: s.setQuickQuality,
      setQuickAspectId: s.setQuickAspectId,
    })),
  );

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);

  // 生产对话生成界面特有的子弹窗状态
  const [isMultiAngleOpen, setIsMultiAngleOpen] = useState(false);
  const [isSmartEditOpen, setIsSmartEditOpen] = useState(false);
  const [isOutpaintOpen, setIsOutpaintOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const { show: showToast } = useToast();
  const { setSafeTimeout } = useSafeTimeout();

  const isGenerateView = currentView === 'generate';

  const promptText = previewTask?.prompt || '';
  const promptParagraphs = useMemo(() => formatPromptParagraphs(promptText), [promptText]);
  const isLongPrompt = promptText.length > 120 || promptParagraphs.length > 2;


  useEffect(() => {
    setIsPromptExpanded(false);
    setIsImageLoading(true);
  }, [previewTask?.id, previewTask?.resultUrl]);

  const isVideo = Boolean(
    previewTask?.mediaType === 'video' ||
      previewTask?.mediaType === 'depth-video' ||
      previewTask?.model === 'video-depth-anything' ||
      (previewTask?.id || '').startsWith('depth_video_') ||
      (previewTask?.resultUrl &&
        (previewTask.resultUrl.includes('.mp4') || previewTask.resultUrl.includes('video'))),
  );

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

  

  const successTasks = useMemo(() => {
    if (!previewTask) return [];

    if (previewQueue && previewQueue.length > 0) {
      const validQueue = previewQueue.filter(
        (t) => t && t.resultUrl && (t.status === 'SUCCESS' || !t.status),
      );
      if (validQueue.length > 0) {
        return validQueue;
      }
    }

    if (previewTask.batchId) {
      const batchList = generationTasks.filter(
        (t) => t.batchId === previewTask.batchId && t.status === 'SUCCESS' && t.resultUrl,
      );
      if (batchList.length > 0) {
        return batchList;
      }
    }

    return [previewTask];
  }, [previewTask, previewQueue, generationTasks]);

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
      setPreviewTask(successTasks[prevIdx], successTasks);
    }
  };

  const handleNext = () => {
    if (total > 1 && currentIndex >= 0) {
      const nextIdx = (currentIndex + 1) % total;
      setPreviewTask(successTasks[nextIdx], successTasks);
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
          setPreviewTask(successTasks[prevIdx], successTasks);
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (total > 1 && currentIndex >= 0) {
          const nextIdx = (currentIndex + 1) % total;
          setPreviewTask(successTasks[nextIdx], successTasks);
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
  }, [previewTask, currentIndex, successTasks, total, setPreviewTask, isVideo]);




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
    } finally {
      setIsDownloading(false);
    }
  };

  

  const handleUsePromptOnly = useCallback(() => {
    if (!previewTask?.prompt) return;
    setQuickPrompt(previewTask.prompt);
    setQuickGenMode(isVideo ? 'video' : 'image');
    setQuickRefImage(null);
    setCurrentView('generate');
    setPreviewTask(null);
    showToast('✨ 已填入提示词，可立即生成');
  }, [previewTask?.prompt, isVideo, setQuickPrompt, setQuickGenMode, setQuickRefImage, setCurrentView, setPreviewTask, showToast]);

  const handleUseAsReference = useCallback(() => {
    if (!previewTask?.resultUrl) return;
    if (previewTask.prompt) {
      setQuickPrompt(previewTask.prompt);
    }
    setQuickGenMode(isVideo ? 'video' : 'image');
    setQuickRefImage(previewTask.resultUrl);
    setCurrentView('generate');
    setPreviewTask(null);
    showToast('✨ 已设置为参考素材');
  }, [previewTask?.resultUrl, previewTask?.prompt, isVideo, setQuickPrompt, setQuickGenMode, setQuickRefImage, setCurrentView, setPreviewTask, showToast]);


  const handleReEdit = useCallback(() => {
    if (!previewTask) return;
    if (previewTask.prompt) {
      setQuickPrompt(previewTask.prompt);
    }
    if (previewTask.resultUrl) {
      setQuickRefImage(previewTask.resultUrl);
    }
    setCurrentView('generate');
    setPreviewTask(null);
    showToast('✏️ 已填入输入框进行编辑');
  }, [previewTask, setQuickPrompt, setQuickRefImage, setCurrentView, setPreviewTask, showToast]);

  const handleRegenerate = useCallback(() => {
    if (!previewTask) return;
    if (previewTask.prompt) {
      setQuickPrompt(previewTask.prompt);
    }
    setCurrentView('generate');
    setPreviewTask(null);
    showToast('🚀 已准备再次生成');
  }, [previewTask, setQuickPrompt, setCurrentView, setPreviewTask, showToast]);

  const handleToolAction = useCallback((actionKey: string, label: string) => {
    if (actionKey === 'multi_angle') {
      setIsMultiAngleOpen(true);
    } else if (actionKey === 'smart_edit') {
      setIsSmartEditOpen(true);
    } else if (actionKey === 'outpaint') {
      setIsOutpaintOpen(true);
    } else {
      showToast(`✨ ${label} 功能已准备就绪`);
    }
  }, [showToast]);

  const handleSubmitNovelView = useCallback(
    ({
      azimuth,
      elevation,
      angleName,
      model,
      quality,
      aspectRatio,
    }: {
      azimuth: number;
      elevation: number;
      angleName: string;
      model?: string;
      quality?: string;
      aspectRatio?: string;
    }) => {
      setIsMultiAngleOpen(false);
      setPreviewTask(null);
      setCurrentView('generate');

      if (!previewTask || !previewTask.resultUrl) {
        showToast(`🎥 已提交多角度生成任务（${angleName}视角）`);
        return;
      }

      const multiAnglePrompt = buildMultiAnglePrompt({
        originalPrompt: previewTask.prompt || '',
        azimuth,
        elevation,
        angleName,
      });

      const chosenModel = model || previewTask.model || 'gpt-image-2';
      const chosenQuality = quality || previewTask.quality || 'medium';
      const targetSize = calculateTargetDimensions(
        aspectRatio,
        chosenQuality,
        previewTask.size || '2448x3264',
      );

      const newTaskId = `fast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newTask: GenerationTask = {
        id: newTaskId,
        title: `多角度视角转换(${angleName})`,
        prompt: multiAnglePrompt,
        model: chosenModel,
        size: targetSize,
        quality: chosenQuality,
        referenceImageUrl: previewTask.resultUrl,
        referenceImages: [previewTask.resultUrl],
        images: [previewTask.resultUrl],
        useReferenceImage: true,
        taskType: 'multi_angle',
        angleName,
        sourceImageUrl: previewTask.resultUrl,
        status: 'IN_PROGRESS',
        progress: '15%',
        createdAt: Date.now(),
      };

      addGenerationTask(newTask, false);
      showToast(`🎥 已提交多角度视角转换任务（${angleName}）`);
    },
    [previewTask, addGenerationTask, setPreviewTask, setCurrentView, showToast],
  );

  const handleSubmitSmartEdit = useCallback(
    ({
      markers,
      prompt,
      model,
      quality,
      aspectRatio,
    }: {
      markers: any[];
      prompt: string;
      model: string;
      quality: string;
      aspectRatio?: string;
    }) => {
      setIsSmartEditOpen(false);
      setPreviewTask(null);
      setCurrentView('generate');

      if (previewTask && previewTask.resultUrl) {
        // 🌟 1. 组装具备空间方位定位与一致性约束的高质量智能改图提示词
        const smartEditPrompt = buildSmartEditPrompt({
          originalPrompt: previewTask.prompt || '',
          userPrompt: prompt,
          markers,
        });

        // 🌟 2. 比例与尺寸精准匹配
        const chosenModel = model || previewTask.model || 'gpt-image-2';
        const chosenQuality = quality || previewTask.quality || 'medium';
        const targetSize = calculateTargetDimensions(
          aspectRatio,
          chosenQuality,
          previewTask.size || '2448x3264',
        );

        const newTaskId = `fast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newTask: GenerationTask = {
          id: newTaskId,
          title: `智能改图: ${prompt.slice(0, 15)}`,
          prompt: smartEditPrompt,
          model: chosenModel,
          size: targetSize,
          quality: chosenQuality,
          referenceImageUrl: previewTask.resultUrl,
          referenceImages: [previewTask.resultUrl],
          images: [previewTask.resultUrl],
          useReferenceImage: true,
          taskType: 'smart_edit',
          sourceImageUrl: previewTask.resultUrl,
          status: 'IN_PROGRESS',
          progress: '15%',
          createdAt: Date.now(),
        };
        addGenerationTask(newTask, false);
      }

      showToast(`✨ 已提交局部修改任务：${prompt.slice(0, 15)}...`);
    },
    [previewTask, addGenerationTask, setPreviewTask, setCurrentView, showToast],
  );

  const handleSubmitOutpaint = useCallback(
    ({
      ratio,
      prompt,
      model,
      quality,
    }: {
      ratio: string;
      scale: number;
      prompt: string;
      model?: string;
      quality?: string;
    }) => {
      setIsOutpaintOpen(false);
      setPreviewTask(null);
      setCurrentView('generate');

      if (previewTask && previewTask.resultUrl) {
        const chosenModel = model || previewTask.model || 'gpt-image-2';
        const chosenQuality = quality || previewTask.quality || 'medium';
        const targetSize = calculateTargetDimensions(
          ratio === 'original' ? 'smart' : ratio,
          chosenQuality,
          previewTask.size || '2448x3264',
        );

        const newTaskId = `fast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newTask: GenerationTask = {
          id: newTaskId,
          title: `扩图(${ratio})`,
          prompt: prompt || previewTask.prompt || '保持画风和内容自然延伸扩展画幅',
          model: chosenModel,
          size: targetSize,
          quality: chosenQuality,
          referenceImageUrl: previewTask.resultUrl,
          referenceImages: [previewTask.resultUrl],
          images: [previewTask.resultUrl],
          useReferenceImage: true,
          status: 'IN_PROGRESS',
          progress: '15%',
          createdAt: Date.now(),
        };
        addGenerationTask(newTask, false);
      }

      showToast(`📐 已提交扩图任务（比例：${ratio}）`);
    },
    [previewTask, addGenerationTask, setPreviewTask, setCurrentView, showToast],
  );

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
        {/* 🌟 1. 左侧主体展示区：左翻页按键 + 大图/视频容器 (含左上角AI生成、底部<1/4>) + 右翻页按键 (外置宽松排布) */}
        <div className="relative flex items-center justify-center flex-1 max-w-full md:max-w-[calc(100%-420px)] h-[50vh] md:h-[80vh] gap-3 sm:gap-5 lg:gap-7 min-w-0 pointer-events-none">
          {/* 左侧外侧翻页按键 (稍微在往外一点，脱离图片) */}
          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all cursor-pointer shadow-xl hover:scale-110 active:scale-95 z-20 group pointer-events-auto"
              title="上一张 (←)"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.2] group-hover:-translate-x-0.5 transition-transform" />
            </button>
          )}

          {/* 中间媒体展示区 */}
          <div className="relative flex flex-col items-center justify-center h-full max-w-full min-w-0 flex-1 pointer-events-none">
            <div
              className="w-full flex-1 flex items-center justify-center overflow-hidden cursor-pointer min-h-0 relative group/view pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                if (!isVideo && previewTask.resultUrl) {
                  void openExternalUrl(previewTask.resultUrl);
                }
              }}
              title={isVideo ? undefined : "点击在新窗口查看原图"}
            >
              {isVideo ? (
                <div className="relative max-h-full max-w-full inline-flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl">
                  {/* 🌟 紧密贴合视频左上角「AI生成」标识 (对齐图 1 原版，随视频居中紧密贴合) */}
                  {!videoLoadFailed && (
                    <div className="absolute top-3 left-3 z-30 px-2 py-0.5 rounded bg-black/45 backdrop-blur-xs text-[10px] text-white/90 font-medium select-none pointer-events-none tracking-tight shadow-2xs">
                      AI生成
                    </div>
                  )}

                  {isVideoLoading && !videoLoadFailed && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                      <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
                    </div>
                  )}

                  {videoLoadFailed ? (
                    <div
                      className="p-6 rounded-2xl bg-black/80 border border-white/10 text-center flex flex-col items-center gap-3 z-10 select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-sm text-slate-300">视频播放源加载受限</p>
                      <button
                        type="button"
                        onClick={() => void openExternalUrl(previewTask.resultUrl!)}
                        className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        在新窗口打开原视频
                      </button>
                    </div>
                  ) : (
                    <video
                      key={currentVideoSrc}
                      ref={videoRef}
                      src={currentVideoSrc}
                      controls
                      autoPlay
                      loop
                      playsInline
                      preload="auto"
                      onCanPlay={handleVideoCanPlay}
                      onLoadedMetadata={handleVideoDuration}
                      onDurationChange={handleVideoDuration}
                      onLoadedData={() => setIsVideoLoading(false)}
                      onError={handleVideoError}
                      className={`max-h-[48vh] md:max-h-[82vh] max-w-full object-contain transition-all duration-300 pointer-events-auto bg-black ${
                        isVideoLoading ? 'opacity-0 scale-98' : 'opacity-100 scale-100'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              ) : (
                <div className="relative max-h-full max-w-full inline-flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl">
                  {/* 🌟 紧密贴合大图左上角「AI生成」标识 (对齐图 1 原版，随图片居中紧密贴合) */}
                  <div className="absolute top-3 left-3 z-30 px-2 py-0.5 rounded bg-black/45 backdrop-blur-xs text-[10px] text-white/90 font-medium select-none pointer-events-none tracking-tight shadow-2xs">
                    AI生成
                  </div>

                  {isImageLoading && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                      <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
                    </div>
                  )}
                  <img
                    key={previewTask.resultUrl}
                    src={proxyMediaUrl(previewTask.resultUrl, { width: 1920 })}
                    alt={previewTask.prompt}
                    onLoad={(e) => {
                      setIsImageLoading(false);
                      const target = e.currentTarget;
                      // 🌟 防御性检测：若代理接口返回了 400x400 兜底 SVG 占位图，自动无缝切换为直连原图
                      if (
                        !target.dataset.hasRetried &&
                        target.naturalWidth === 400 &&
                        target.naturalHeight === 400 &&
                        previewTask.resultUrl
                      ) {
                        target.dataset.hasRetried = 'true';
                        target.src = previewTask.resultUrl;
                      }
                    }}
                    onError={(e) => {
                      setIsImageLoading(false);
                      const target = e.currentTarget;
                      if (!target.dataset.hasRetried && previewTask.resultUrl) {
                        target.dataset.hasRetried = 'true';
                        target.src = previewTask.resultUrl;
                      } else if (!target.dataset.hasThumbFallback && previewTask.resultUrl) {
                        // 🌟 第二重容灾：若直连原图也遇到网络限制，使用已在列表页成功呈现的 640px 缓存缩略图
                        target.dataset.hasThumbFallback = 'true';
                        target.src = proxyMediaUrl(previewTask.resultUrl, { thumb: true, width: 640 });
                      }
                    }}
                    className={`max-h-[48vh] md:max-h-[82vh] max-w-full object-contain transition-all duration-300 select-none ${
                      isImageLoading ? 'opacity-0 scale-98' : 'opacity-100 scale-100'
                    }`}
                  />
                </div>
              )}
            </div>

            {/* 大图正下方居中页码胶囊 (仅显示数量，移除切换按键) */}
            {total > 1 && currentIndex >= 0 && (
              <div className="mt-3 shrink-0 flex items-center justify-center select-none pointer-events-none">
                <div className="flex items-center justify-center px-3 py-1 rounded-full bg-black/65 backdrop-blur-md text-white text-xs font-mono font-medium shadow-lg border border-white/15">
                  <span className="tabular-nums">
                    {currentIndex + 1} / {total}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 右侧外侧翻页按键 (位于大图与右侧面板之间) */}
          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all cursor-pointer shadow-xl hover:scale-110 active:scale-95 z-20 group pointer-events-auto"
              title="下一张 (→)"
            >
              <ChevronRight className="w-6 h-6 stroke-[2.2] group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

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
      {isGenerateView && (
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
