import { type GenerationTask } from '@client/store';
import { getAspectRatioClass, getBatchGridClass } from '../model/generateCanvasLayout';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import AIGeneratingCard from '@client/shared/ui/AIGeneratingCard';
import { getFeedImageUrl } from './FeedSingleCard';
import { AlertCircle, RotateCw, Maximize2, Trash2, X } from 'lucide-react';
import FeedCardActionBar from './FeedCardActionBar';

interface FeedExpandedGridProps {
  batch: { batchId: string; tasks: GenerationTask[] };
  primaryTask: GenerationTask;
  isBatchVideo: boolean;
  premiumGeneratingTaskId: string | null;
  openMenuTaskId: string | null;
  setOpenMenuTaskId: (id: string | null) => void;
  onPreview: (task: GenerationTask, allTasks: GenerationTask[]) => void;
  onReuse: (task: GenerationTask) => void;
  onRegenerate: (task: GenerationTask) => void;
  onCopyPrompt?: (task: GenerationTask) => void;
  onDownload?: (url: string, title?: string) => void;
  onDeleteBatch: (tasks: GenerationTask[]) => void;
  onDeleteTask?: (task: GenerationTask) => void;
  onDeleteFailedTasks?: (tasks: GenerationTask[]) => void;
  onRetryTask?: (task: GenerationTask) => void;
}

export default function FeedExpandedGrid({
  batch,
  primaryTask,
  isBatchVideo,
  premiumGeneratingTaskId,
  openMenuTaskId,
  setOpenMenuTaskId,
  onPreview,
  onReuse,
  onRegenerate,
  onDeleteBatch,
  onDeleteTask,
  onDeleteFailedTasks,
  onRetryTask,
}: FeedExpandedGridProps) {
  const isMenuOpen = openMenuTaskId === `batch-${batch.batchId}`;

  // 统计未完成/失败的任务与成功任务
  const uncompletedTasks = batch.tasks.filter(
    (t) => t.status === 'FAILURE' || (!t.resultUrl && t.status !== 'SUCCESS')
  );
  const successTasks = batch.tasks.filter(
    (t) => t.status === 'SUCCESS' && Boolean(t.resultUrl)
  );
  const showClearFailedBtn =
    uncompletedTasks.length > 0 &&
    successTasks.length > 0 &&
    typeof onDeleteFailedTasks === 'function';

  return (
    <div className="w-full space-y-2.5">
      {/* 1. 多图网格（4 张图在一行等分排列，带轻微圆角与间隙） */}
      <div className={`${getBatchGridClass(batch.tasks.length)} gap-2 sm:gap-2.5 w-full`}>
        {batch.tasks.map((task, idx) => {
          const isSuccess = task.status === 'SUCCESS' && Boolean(task.resultUrl);
          const isFailure = task.status === 'FAILURE';
          const isGenerating = !isSuccess && !isFailure;

          const firstGeneratingIdx = batch.tasks.findIndex(
            (t) => t.status !== 'SUCCESS' && t.status !== 'FAILURE' && !t.resultUrl
          );
          const showProgressBadge = isGenerating && idx === firstGeneratingIdx;

          return (
            <div
              key={`${task.id || 't'}-${idx}`}
              className={`relative w-full rounded-xl sm:rounded-2xl overflow-hidden shadow-2xs hover:shadow-md border border-slate-200/80 bg-slate-50 transition-all duration-300 group/card ${getAspectRatioClass(
                task.size
              )}`}
            >
              {/* 🌟 右上角快捷删除/清除此卡片按钮 (支持单卡片即时清除) */}
              {onDeleteTask && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTask(task);
                  }}
                  className={`absolute top-2 right-2 z-30 w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    isFailure
                      ? 'bg-black/45 hover:bg-red-600 text-white shadow-xs'
                      : isGenerating
                      ? 'bg-black/30 hover:bg-red-600 text-white/90 opacity-80 group-hover/card:opacity-100'
                      : 'bg-black/35 hover:bg-red-600 text-white/90 opacity-0 group-hover/card:opacity-100'
                  }`}
                  title={isFailure ? '清除此失败卡片' : isGenerating ? '取消并清除此生成任务' : '从当前对话移除此图'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {isFailure ? (
                /* 🌟 失败卡片专属呈现 (提供原因、重试与清除) */
                <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-red-50/95 space-y-2 select-none overflow-hidden">
                  <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
                  <div className="space-y-0.5 w-full min-w-0 px-1">
                    <p className="text-xs font-bold text-red-700">生成失败</p>
                    <p
                      className="text-[10px] text-red-500 w-full truncate leading-tight"
                      title={task.failReason || '模型渲染失败或接口超时'}
                    >
                      {task.failReason || '模型渲染失败或接口超时'}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 pt-1">
                    {onRetryTask && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetryTask(task);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-[11px] text-white font-medium transition-colors cursor-pointer shadow-xs active:scale-95 flex items-center gap-1"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>重试</span>
                      </button>
                    )}
                    {onDeleteTask && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTask(task);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/90 hover:bg-white text-[11px] text-slate-700 hover:text-red-600 font-medium transition-colors cursor-pointer border border-slate-200 shadow-xs active:scale-95 flex items-center gap-1"
                        title="清除此失败卡片"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>清除</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : isGenerating ? (
                /* 正在生成中 (柔光动画卡片) */
                <AIGeneratingCard
                  task={task}
                  showProgressBadge={showProgressBadge}
                  isVideo={isBatchVideo}
                  variant={task.id === premiumGeneratingTaskId ? 'premium' : 'lite'}
                />
              ) : (
                /* 生成成功 (高清图片展示) */
                <div className="relative w-full h-full">
                  <img
                    src={getFeedImageUrl(task.resultUrl, { thumb: true, width: 640 })}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.dataset.hasRetried && task.resultUrl) {
                        target.dataset.hasRetried = 'true';
                        target.src = proxyMediaUrl(task.resultUrl);
                      }
                    }}
                    className="w-full h-full object-cover cursor-pointer hover:scale-102 transition-transform duration-300 select-none"
                    onClick={() => onPreview(task, batch.tasks)}
                    title="点击放大查看"
                  />

                  {/* 左上角轻量「AI生成」标识 (图同款) */}
                  <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded bg-black/35 backdrop-blur-xs text-[10px] text-white/90 font-medium select-none pointer-events-none tracking-tight">
                    AI生成
                  </div>

                  {/* 悬停放大指引 */}
                  <div
                    onClick={() => onPreview(task, batch.tasks)}
                    className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center cursor-pointer pointer-events-none"
                  >
                    <div className="px-2.5 py-1 rounded-xl bg-black/75 backdrop-blur-md text-white text-[11px] font-medium flex items-center gap-1 shadow-md">
                      <Maximize2 className="w-3 h-3" />
                      <span>放大</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. 底部整组通用操作条 (参考图2规格: 高度40px、正方形更多按钮、冷灰质感底色) */}
      <FeedCardActionBar
        onReuse={() => onReuse(primaryTask)}
        onRegenerate={() => onRegenerate(primaryTask)}
        isMenuOpen={isMenuOpen}
        onToggleMenu={(e) => {
          e.stopPropagation();
          setOpenMenuTaskId(isMenuOpen ? null : `batch-${batch.batchId}`);
        }}
        onDelete={() => {
          onDeleteBatch(batch.tasks);
          setOpenMenuTaskId(null);
        }}
        deleteText="删除该批次结果"
        reEditTitle="重新编辑提示词与参数"
        regenerateTitle="在当前对话中再次生成这组图"
        failedCount={showClearFailedBtn ? uncompletedTasks.length : 0}
        onClearFailed={showClearFailedBtn ? () => onDeleteFailedTasks?.(uncompletedTasks) : undefined}
      />
    </div>
  );
}
