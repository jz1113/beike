import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useAppStore, type GenerationTask } from '@/store/useAppStore';
import {
  getAspectRatioFromSize,
  formatDisplayModel,
  formatDepthQualityLabel,
  formatImageQualityLabel,
  isDepthMediaType,
  stripWorkshopPromptGuards,
  cleanPromptText,
} from '@beike/domain/drawing';
import { getGatewayClientHeaders, getGatewayClientOverrides } from '@/lib/gatewayClient';
import { apiFetch } from '@/lib/apiClient';
import { isGenerateVideoTask, type FlatBatchItem } from '../generateWorkspaceHelpers';
import {
  cloneDepthSubmit,
  peekDepthSubmit,
  resolveDepthSubmit,
} from '@/features/home/hooks/useDepthGeneration';
import { resolveRefMediaFile, registerRefMedia } from '@/lib/refMediaRegistry';
import {
  DEPTH_IMAGE_MODEL_ID,
  DEPTH_VIDEO_MODEL_ID,
  type DepthQuality,
  type DepthVideoStyle,
} from '@beike/domain/depthVideo';
import { dockSafeArea } from '@/shared/ui/layoutClasses';
import FeedBatchHeader from './FeedBatchHeader';
import FeedSingleCard from './FeedSingleCard';
import FeedExpandedGrid from './FeedExpandedGrid';

function isDepthVideoTask(task: GenerationTask): boolean {
  return (
    task.mediaType === 'depth-video' ||
    task.model === DEPTH_VIDEO_MODEL_ID ||
    (task.id || '').startsWith('depth_') ||
    (task.taskId || '').startsWith('depth_')
  );
}

function isDepthImageTask(task: GenerationTask): boolean {
  return task.mediaType === 'depth-image' || task.model === DEPTH_IMAGE_MODEL_ID;
}

async function restoreDepthSubmitForRetry(task: GenerationTask): Promise<boolean> {
  const refUrl = task.referenceImages?.[0] || task.referenceImageUrl;
  const payload = await resolveDepthSubmit(task.id, refUrl, {
    style: (task.depthStyle as DepthVideoStyle) || 'mocap',
    quality: (task.quality as DepthQuality) || 'standard',
    mode: isDepthVideoTask(task) ? 'depth-video' : 'depth-image',
  });
  if (payload?.file) {
    if (
      !task.referenceImageUrl ||
      (task.referenceImageUrl.startsWith('blob:') &&
        !resolveRefMediaFile(task.referenceImageUrl))
    ) {
      const freshUrl = URL.createObjectURL(payload.file);
      registerRefMedia(freshUrl, payload.file);
      useAppStore.getState().updateGenerationTask(task.id, {
        referenceImageUrl: freshUrl,
        referenceImages: [freshUrl],
      });
    }
    return true;
  }
  return false;
}

export interface GenerateTaskFeedProps {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  pageMediaDropProps: Record<string, unknown>;
  taskBatches: { batchId: string; tasks: GenerationTask[] }[];
  visibleFlatBatches: FlatBatchItem[];
  hasMoreBatches: boolean;
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  activeSessionTitle?: string;
  onShowToast: (msg: string) => void;
}

export function GenerateTaskFeed({
  scrollContainerRef,
  pageMediaDropProps,
  taskBatches,
  visibleFlatBatches,
  hasMoreBatches,
  loadMoreSentinelRef,
  activeSessionTitle,
  onShowToast,
}: GenerateTaskFeedProps) {
  const {
    setPreviewTask,
    setQuickPrompt,
    setQuickModel,
    setQuickQuality,
    addGenerationTask,
    updateGenerationTask,
    deleteGenerationTask,
  } = useAppStore();

  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);

  const premiumGeneratingTaskId = useMemo(() => {
    for (let i = visibleFlatBatches.length - 1; i >= 0; i--) {
      const t = visibleFlatBatches[i].batch.tasks[0];
      if (!t) continue;
      if (t.status !== 'SUCCESS' || !t.resultUrl) return t.id;
    }
    return null;
  }, [visibleFlatBatches]);

  const prevBatchCountRef = useRef(visibleFlatBatches.length);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  // 🌟 会话切换或页面加载时，自动定位到底部最新生成内容
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const timer = setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 60);
    return () => clearTimeout(timer);
  }, [activeSessionTitle, scrollContainerRef]);

  // 🌟 当有新任务生成或正在生成中时，自动平滑滚动到底部
  const lastBatch = visibleFlatBatches[visibleFlatBatches.length - 1]?.batch;
  const lastTask = lastBatch?.tasks[0];
  const lastTaskId = lastTask?.id;
  const isLastGenerating = Boolean(lastTask && (lastTask.status === 'IN_PROGRESS' || !lastTask.resultUrl));

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (visibleFlatBatches.length > prevBatchCountRef.current || isLastGenerating) {
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        });
      });
    }
    prevBatchCountRef.current = visibleFlatBatches.length;
  }, [visibleFlatBatches.length, lastTaskId, isLastGenerating, scrollContainerRef]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-task-menu]')) {
        setOpenMenuTaskId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleReuseTask = useCallback(
    (task: GenerationTask) => {
      if (isDepthVideoTask(task) || isDepthImageTask(task)) {
        useAppStore
          .getState()
          .setQuickGenMode(isDepthVideoTask(task) ? 'depth-video' : 'depth-image');
        if (task.depthStyle) {
          useAppStore.getState().setQuickDepthStyle(task.depthStyle as any);
        }
        if (task.quality) {
          useAppStore.getState().setQuickDepthQuality(task.quality as any);
        }
        onShowToast('已切换至深度动作捕捉模式，请上传视频后生成');
        return;
      }
      setQuickPrompt(task.prompt);
      if (task.model) setQuickModel(task.model);
      if (task.quality)
        setQuickQuality((task.quality as 'high' | 'medium' | 'low') || 'high');
      if (task.resultUrl) {
        useAppStore.getState().setQuickRefImage(task.resultUrl);
      }
    },
    [onShowToast, setQuickModel, setQuickPrompt, setQuickQuality]
  );

  const handleRetryTask = useCallback(
    async (task: GenerationTask) => {
      if (isDepthImageTask(task) || isDepthVideoTask(task)) {
        const inMem = peekDepthSubmit(task.id);
        if (inMem) {
          updateGenerationTask(task.id, {
            status: 'IN_PROGRESS',
            progress: '15%',
            resultUrl: undefined,
            failReason: undefined,
            taskId: undefined,
            dbId: undefined,
          });
          return;
        }

        const restored = await restoreDepthSubmitForRetry(task);
        if (restored) {
          updateGenerationTask(task.id, {
            status: 'IN_PROGRESS',
            progress: '15%',
            resultUrl: undefined,
            failReason: undefined,
            taskId: undefined,
            dbId: undefined,
          });
          return;
        }

        onShowToast('无法读取本地缓存，请点击卡片上的「重新选择文件并生成」继续');
        return;
      }

      if (task.taskId) {
        updateGenerationTask(task.id, {
          status: 'IN_PROGRESS',
          progress: '50%',
          failReason: undefined,
        });
        try {
          const pollEndpoint = isGenerateVideoTask(task)
            ? '/api/generate/video'
            : '/api/generate/image';
          const queryParams = new URLSearchParams({ taskId: task.taskId });
          const localUrl = getGatewayClientOverrides().customBaseUrl || '';
          const res = await apiFetch(`${pollEndpoint}?${queryParams.toString()}`, {
            headers: {
              ...getGatewayClientHeaders(),
              ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
            },
          }).catch(() => null);
          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (
              (data?.status === 'SUCCESS' || Boolean(data?.resultUrl)) &&
              data?.resultUrl
            ) {
              updateGenerationTask(task.id, {
                status: 'SUCCESS',
                resultUrl: data.resultUrl,
                progress: '100%',
                failReason: undefined,
              });
              return;
            }
          }
        } catch {
          /* retry via engine */
        }
      }

      updateGenerationTask(task.id, {
        status: 'IN_PROGRESS',
        progress: '15%',
        resultUrl: undefined,
        failReason: undefined,
        taskId: undefined,
        dbId: undefined,
      });
    },
    [onShowToast, updateGenerationTask]
  );

  const handleRegenerateTask = useCallback(
    async (task: GenerationTask) => {
      const newTaskId = `hub-gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      if (isDepthImageTask(task) || isDepthVideoTask(task)) {
        const inMem = peekDepthSubmit(task.id);
        if (inMem) {
          cloneDepthSubmit(task.id, newTaskId);
        } else {
          const refUrl = task.referenceImages?.[0] || task.referenceImageUrl;
          const restored = await resolveDepthSubmit(newTaskId, refUrl, {
            style: (task.depthStyle as DepthVideoStyle) || 'mocap',
            quality: (task.quality as DepthQuality) || 'standard',
            mode: isDepthVideoTask(task) ? 'depth-video' : 'depth-image',
          });
          if (!restored) {
            onShowToast(
              '该任务历史文件未在当前会话缓存，请点击卡片上的「重新选择文件并生成」'
            );
            return;
          }
        }
      }

      const newTask: GenerationTask = {
        ...task,
        batchId: undefined,
        id: newTaskId,
        dbId: undefined,
        taskId: undefined,
        prompt: stripWorkshopPromptGuards(cleanPromptText(task.prompt || '')),
        status: 'IN_PROGRESS',
        progress: '15%',
        resultUrl: undefined,
        failReason: undefined,
        createdAt: Date.now(),
      };
      addGenerationTask(newTask, false);
    },
    [addGenerationTask, onShowToast]
  );

  return (
    <div
      ref={scrollContainerRef}
      data-generate-scroll
      {...pageMediaDropProps}
      className={`flex-1 overflow-y-auto px-4 sm:px-6 py-4 ${dockSafeArea} relative`}
    >
      {taskBatches.length > 0 && (
        <div className="w-full space-y-8 animate-fade-in">
          {/* 🌟 向上滑动加载更早的历史记录 */}
          {hasMoreBatches && (
            <div ref={loadMoreSentinelRef} className="col-span-full h-8 w-full flex items-center justify-center text-xs text-slate-400 py-2" aria-hidden>
              <span>加载更早的历史记录...</span>
            </div>
          )}
          {visibleFlatBatches.map(({ batch, bIdx }) => {
            return (
              <div
                key={`${batch.batchId || 'batch'}-${bIdx}`}
                className={batch.tasks.length > 1 ? "col-span-full min-w-0" : "min-w-0"}
                style={{ contentVisibility: 'auto' }}
              >
                <div className="space-y-8">
                  {(() => {
                    const isBatchVideo = batch.tasks.some(isGenerateVideoTask);
                    const isBatchDepth = batch.tasks.some((t) =>
                      isDepthMediaType(t.mediaType)
                    );

                    const displayModel = formatDisplayModel(batch.model, isBatchVideo);
                    const displayRatio = getAspectRatioFromSize(batch.size);
                    const rawQuality = batch.quality || batch.tasks[0]?.quality;
                    const displayQuality = isBatchDepth
                      ? formatDepthQualityLabel(rawQuality)
                      : isBatchVideo
                      ? rawQuality || batch.tasks[0]?.videoResolution || '720P'
                      : formatImageQualityLabel(rawQuality);

                    const primaryTask = batch.tasks[0];
                    const isSingle = batch.tasks.length === 1;

                    const rawTitle =
                      batch.title || batch.prompt?.slice(0, 20) || 'AI 创作';
                    const cleanBatchTitle = rawTitle.replace(
                      /^第\s*\d+\s*张\s*[:：]\s*/,
                      ''
                    );
                    const displayBatchTitle = cleanBatchTitle;

                    const isMultiAngle =
                      primaryTask?.taskType === 'multi_angle' ||
                      Boolean(primaryTask?.angleName) ||
                      batch.tasks.some((t) => t.taskType === 'multi_angle') ||
                      displayBatchTitle.includes('多角度') ||
                      batch.prompt.includes('【全新单视角摄影转换】');

                    const isSmartEdit =
                      primaryTask?.taskType === 'smart_edit' ||
                      batch.tasks.some((t) => t.taskType === 'smart_edit') ||
                      displayBatchTitle.includes('智能改图') ||
                      batch.prompt.includes('【智能局部图像编辑任务】');

                    const angleName =
                      primaryTask?.angleName ||
                      batch.tasks.find((t) => t.angleName)?.angleName ||
                      (displayBatchTitle.match(/多角度视角转换\(([^)]+)\)/)?.[1] ?? undefined);

                    const sourceImageUrl =
                      primaryTask?.sourceImageUrl ||
                      primaryTask?.referenceImageUrl ||
                      primaryTask?.images?.[0] ||
                      batch.tasks.find((t) => t.sourceImageUrl || t.referenceImageUrl)?.sourceImageUrl;

                    return (
                      <div
                        key={`${batch.batchId || 'batch'}-${bIdx}`}
                        className="space-y-2.5 w-full transition-all duration-300"
                      >
                        {/* 1. 对话轮次元信息标头 (图3标杆同款: 多角度/智能改图/原图胶囊与参数紧凑并列，同行不换行) */}
                        <FeedBatchHeader
                          displayBatchTitle={displayBatchTitle}
                          batchPrompt={batch.prompt}
                          isBatchVideo={isBatchVideo}
                          displayModel={displayModel}
                          displayRatio={displayRatio}
                          displayQuality={displayQuality}
                          isMultiAngle={isMultiAngle}
                          angleName={angleName}
                          isSmartEdit={isSmartEdit}
                          sourceImageUrl={sourceImageUrl}
                          onPreviewSourceImage={(url) => {
                            setPreviewTask({
                              id: `preview-source-${Date.now()}`,
                              title: '基准原图 (参考图)',
                              prompt: batch.prompt,
                              model: batch.model,
                              size: batch.size,
                              quality: rawQuality || 'medium',
                              resultUrl: url,
                              status: 'SUCCESS',
                              progress: '100%',
                              useReferenceImage: false,
                            });
                          }}
                          onShowDetails={() =>
                            setPreviewTask(primaryTask, batch.tasks)
                          }
                        />

                        {/* 2. 媒体内容展示区域 */}
                        {isSingle ? (
                          /* 2.1 单张大图/视频卡片 (单图独立画幅，不限制上方标头宽度) */
                          <div className="w-56 sm:w-64 md:w-72 compact:w-44 compact:sm:w-48">
                            <FeedSingleCard
                              primaryTask={primaryTask}
                              batchTasks={batch.tasks}
                              isBatchVideo={isBatchVideo}
                              premiumGeneratingTaskId={premiumGeneratingTaskId}
                              openMenuTaskId={openMenuTaskId}
                              setOpenMenuTaskId={setOpenMenuTaskId}
                              onPreview={setPreviewTask}
                              onReuse={handleReuseTask}
                              onRegenerate={handleRegenerateTask}
                              onRetry={handleRetryTask}
                              onDelete={(task) => {
                                deleteGenerationTask(task.id);
                                if (task.taskId && task.taskId !== task.id) {
                                  deleteGenerationTask(task.taskId);
                                }
                                setOpenMenuTaskId(null);
                                onShowToast('已从对话记录中移除此卡片');
                              }}
                              onShowToast={onShowToast}
                            />
                          </div>
                        ) : (
                          /* 2.2 多张图并排平铺网格 (图同款) */
                          <FeedExpandedGrid
                            batch={batch}
                            primaryTask={primaryTask}
                            isBatchVideo={isBatchVideo}
                            premiumGeneratingTaskId={premiumGeneratingTaskId}
                            openMenuTaskId={openMenuTaskId}
                            setOpenMenuTaskId={setOpenMenuTaskId}
                            onPreview={setPreviewTask}
                            onReuse={handleReuseTask}
                            onRegenerate={handleRegenerateTask}
                            onDeleteBatch={(tasks) => {
                              tasks.forEach((t) => {
                                deleteGenerationTask(t.id);
                                if (t.taskId && t.taskId !== t.id)
                                  deleteGenerationTask(t.taskId);
                              });
                              setOpenMenuTaskId(null);
                              onShowToast('已从对话记录中移除此组图');
                            }}
                            onDeleteTask={(task) => {
                              deleteGenerationTask(task.id);
                              if (task.taskId && task.taskId !== task.id) {
                                deleteGenerationTask(task.taskId);
                              }
                              onShowToast('已清除该卡片');
                            }}
                            onDeleteFailedTasks={(tasksToClear) => {
                              tasksToClear.forEach((t) => {
                                deleteGenerationTask(t.id);
                                if (t.taskId && t.taskId !== t.id) {
                                  deleteGenerationTask(t.taskId);
                                }
                              });
                              setOpenMenuTaskId(null);
                              onShowToast(`已清除 ${tasksToClear.length} 个未成功卡片`);
                            }}
                            onRetryTask={handleRetryTask}
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
          {/* 🌟 底部定位锚点与安全间距 */}
          <div ref={bottomAnchorRef} className="col-span-full h-6 w-full pointer-events-none" aria-hidden />
        </div>
      )}
    </div>
  );
}
