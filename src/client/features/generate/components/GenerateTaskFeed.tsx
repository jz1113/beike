import { useState, useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type GenerationTask } from '@client/store';
import {
  getAspectRatioFromSize,
  formatDisplayModel,
  formatDepthQualityLabel,
  formatImageQualityLabel,
  isDepthMediaType,
} from '@shared/domain/media/drawing';
import { isGenerateVideoTask, type FlatBatchItem } from '../model/generateWorkspaceLayout';
import { useGenerateTaskActions } from '../hooks/useGenerateTaskActions';
import { dockSafeArea } from '@client/shared/ui/layoutClasses';
import FeedBatchHeader from './FeedBatchHeader';
import FeedSingleCard from './FeedSingleCard';
import FeedExpandedGrid from './FeedExpandedGrid';

export interface GenerateTaskFeedProps {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  pageMediaDropProps: Record<string, unknown>;
  taskBatches: { batchId: string; tasks: GenerationTask[] }[];
  visibleFlatBatches: FlatBatchItem[];
  hasMoreBatches: boolean;
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  onShowToast: (msg: string) => void;
}

export function GenerateTaskFeed({
  scrollContainerRef,
  pageMediaDropProps,
  taskBatches,
  visibleFlatBatches,
  hasMoreBatches,
  loadMoreSentinelRef,
  onShowToast,
}: GenerateTaskFeedProps) {
  const {
    setPreviewTask,
    deleteGenerationTask,
    generationHistoryReady,
  } = useAppStore(useShallow(state => ({
    setPreviewTask: state.setPreviewTask,
    deleteGenerationTask: state.deleteGenerationTask,
    generationHistoryReady: state.generationHistoryReady,
  })));

  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);

  const premiumGeneratingTaskId = useMemo(() => {
    for (let i = visibleFlatBatches.length - 1; i >= 0; i--) {
      const t = visibleFlatBatches[i].batch.tasks[0];
      if (!t) continue;
      if (t.status !== 'SUCCESS' || !t.resultUrl) return t.id;
    }
    return null;
  }, [visibleFlatBatches]);

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

  const {
    handleReuseTask,
    handleRetryTask,
    handleRegenerateTask,
    handleRegenerateBatch,
    handleRetryWithFile,
  } = useGenerateTaskActions(onShowToast);

  return (
    <div
      ref={scrollContainerRef}
      data-generate-scroll
      {...pageMediaDropProps}
      className={`flex-1 overflow-y-auto px-4 sm:px-6 py-4 ${dockSafeArea} relative`}
    >
      {taskBatches.length === 0 && (
        <div className="min-h-[45vh] flex flex-col items-center justify-center gap-2 text-center px-4" role="status" aria-live="polite">
          <p className="text-base font-medium text-slate-600">{generationHistoryReady ? '从一个想法开始创作' : '正在恢复对话历史…'}</p>
          {generationHistoryReady && <p className="text-sm text-slate-500">输入描述，或上传参考素材后开始生成。</p>}
        </div>
      )}
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
                          onShowDetails={() => {
                            const task = batch.tasks.find((item) => item.status === 'SUCCESS' && item.resultUrl);
                            if (task) setPreviewTask(task, batch.tasks);
                            else onShowToast('本批次尚无可预览结果，可在卡片查看生成状态');
                          }}
                        />

                        {/* 2. 媒体内容展示区域 */}
                        {isSingle ? (
                          /* 2.1 单张大图/视频卡片 (单图独立画幅，不限制上方标头宽度) */
                          <div className="w-[280px] max-w-full">
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
                              onRetryWithFile={handleRetryWithFile}
                              onDelete={(task) => {
                                deleteGenerationTask(task.id);
                                if (task.taskId && task.taskId !== task.id) {
                                  deleteGenerationTask(task.taskId);
                                }
                                setOpenMenuTaskId(null);
                                onShowToast('已从对话记录中移除此卡片');
                              }}
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
                            onRegenerate={handleRegenerateBatch}
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
                              onShowToast(task.status === 'IN_PROGRESS'
                                ? '已移除卡片并取消尚未发送的请求，已发送的生成仍可能继续'
                                : '已清除该卡片');
                            }}
                            onDeleteFailedTasks={(tasksToClear) => {
                              const failedTasks = tasksToClear.filter((task) => task.status === 'FAILURE');
                              failedTasks.forEach((t) => {
                                deleteGenerationTask(t.id);
                                if (t.taskId && t.taskId !== t.id) {
                                  deleteGenerationTask(t.taskId);
                                }
                              });
                              setOpenMenuTaskId(null);
                              onShowToast(`已清除 ${failedTasks.length} 个失败卡片`);
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
          <div className="col-span-full h-6 w-full pointer-events-none" aria-hidden />
        </div>
      )}
    </div>
  );
}
