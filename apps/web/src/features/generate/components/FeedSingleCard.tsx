import { type GenerationTask, useAppStore } from '@/store';
import { getAspectRatioClass } from '../generateCanvasLayout';
import { proxyMediaUrl } from '@/shared/api/apiClient';
import LazyVideoCover from '@/shared/media/LazyVideoCover';
import AIGeneratingCard from '@/shared/ui/AIGeneratingCard';
import { registerRefMedia } from '@/shared/media/refMediaRegistry';
import { registerDepthSubmit, peekDepthSubmit } from '@/shared/api/depthGeneration';
import {
  DEPTH_IMAGE_MODEL_ID,
  DEPTH_VIDEO_MODEL_ID,
  type DepthQuality,
  type DepthVideoStyle,
} from '@beike/domain/depthVideo';
import {
  AlertCircle,
  Upload,
  Maximize2,
  Trash2,
  X,
} from 'lucide-react';
import FeedCardActionBar from './FeedCardActionBar';

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

export function getFeedImageUrl(
  url?: string | null,
  opts?: { thumb?: boolean; width?: number }
): string {
  if (!url) return '';
  if (
    url.includes('/azhuo/') &&
    (url.includes('.aliyuncs.com') ||
      url.includes('.myqcloud.com') ||
      url.includes('.r2.cloudflarestorage.com') ||
      url.includes('.amazonaws.com'))
  ) {
    return proxyMediaUrl(url, opts ?? { thumb: true, width: 960 });
  }
  return url;
}

interface FeedSingleCardProps {
  primaryTask: GenerationTask;
  batchTasks: GenerationTask[];
  isBatchVideo: boolean;
  premiumGeneratingTaskId: string | null;
  openMenuTaskId: string | null;
  setOpenMenuTaskId: (id: string | null) => void;
  onPreview: (task: GenerationTask, allTasks: GenerationTask[]) => void;
  onReuse: (task: GenerationTask) => void;
  onRegenerate: (task: GenerationTask) => void;
  onRetry: (task: GenerationTask) => void;
  onCopyPrompt?: (task: GenerationTask) => void;
  onDownload?: (url: string, title?: string) => void;
  onDelete: (task: GenerationTask) => void;
  onShowToast: (msg: string) => void;
}

export default function FeedSingleCard({
  primaryTask,
  batchTasks,
  isBatchVideo,
  premiumGeneratingTaskId,
  openMenuTaskId,
  setOpenMenuTaskId,
  onPreview,
  onReuse,
  onRegenerate,
  onRetry,
  onDelete,
  onShowToast,
}: FeedSingleCardProps) {
  const { updateGenerationTask } = useAppStore();

  return (
    <div className="w-full space-y-3">
      <div
        className={`relative w-full rounded-2xl overflow-hidden shadow-xs hover:shadow-lg border border-slate-200/90 bg-white transition-all duration-300 ${getAspectRatioClass(
          primaryTask.size
        )}`}
      >
        {primaryTask.status === 'FAILURE' ? (
          /* 失败状态 */
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6 text-center bg-red-50/90 space-y-2.5 overflow-y-auto overflow-x-hidden">
            <AlertCircle className="w-8 h-8 text-red-500 shrink-0" />
            <div className="space-y-1 w-full min-w-0 px-1">
              <p className="text-xs font-bold text-red-700">生成失败</p>
              <p
                className="text-[11px] text-red-500 w-full max-w-full break-words [overflow-wrap:anywhere] leading-relaxed text-left"
                title={primaryTask.failReason || '接口响应异常'}
              >
                {primaryTask.failReason || '接口响应异常'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              {(isDepthImageTask(primaryTask) || isDepthVideoTask(primaryTask)) &&
              (primaryTask.failReason?.includes('无法读取上传文件') ||
                !peekDepthSubmit(primaryTask.id)) ? (
                <label className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs text-white font-bold transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5 active:scale-95">
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span>重新选择文件并生成</span>
                  <input
                    type="file"
                    accept={isDepthVideoTask(primaryTask) ? 'video/*' : 'image/*'}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const newBlobUrl = URL.createObjectURL(file);
                      registerRefMedia(newBlobUrl, file);
                      const mode = isDepthVideoTask(primaryTask)
                        ? 'depth-video'
                        : 'depth-image';
                      const style =
                        (primaryTask.depthStyle as DepthVideoStyle) || 'mocap';
                      const quality =
                        (primaryTask.quality as DepthQuality) || 'standard';
                      registerDepthSubmit(primaryTask.id, {
                        file,
                        style,
                        quality,
                        mode,
                      });
                      onShowToast('已重新绑定文件，开始生成…');
                      updateGenerationTask(primaryTask.id, {
                        status: 'IN_PROGRESS',
                        progress: '15%',
                        referenceImageUrl: newBlobUrl,
                        referenceImages: [newBlobUrl],
                        resultUrl: undefined,
                        failReason: undefined,
                        taskId: undefined,
                        dbId: undefined,
                      });
                    }}
                  />
                </label>
              ) : (
                <>
                  <button
                    onClick={() => onRetry(primaryTask)}
                    className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs text-white font-bold transition-colors cursor-pointer shadow-xs active:scale-95"
                  >
                    立即重试
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(primaryTask)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-xs text-slate-700 hover:text-red-600 font-bold transition-colors cursor-pointer shadow-xs active:scale-95 flex items-center gap-1 border border-slate-200"
                    title="清除此失败卡片"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清除此项</span>
                  </button>
                </>
              )}
            </div>
            {/* 右上角快捷清除 ✕ 按钮 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(primaryTask);
              }}
              className="absolute top-2 right-2 z-30 w-6 h-6 rounded-full bg-black/35 hover:bg-red-600 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs"
              title="清除此卡片"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : primaryTask.status === 'SUCCESS' && primaryTask.resultUrl ? (
          /* 生成成功状态 */
          <div className="relative w-full h-full group/media">
            {isBatchVideo ? (
              <div
                className="w-full h-full cursor-pointer bg-black"
                onClick={() => onPreview(primaryTask, batchTasks)}
                title="点击全屏放大查看"
              >
                <LazyVideoCover src={proxyMediaUrl(primaryTask.resultUrl!)} />
              </div>
            ) : (
              <img
                src={getFeedImageUrl(primaryTask.resultUrl, { thumb: true, width: 960 })}
                alt={primaryTask.title || '生成结果'}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.hasRetried && primaryTask.resultUrl) {
                    target.dataset.hasRetried = 'true';
                    target.src = proxyMediaUrl(primaryTask.resultUrl);
                  }
                }}
                className="w-full h-full object-cover transition-transform duration-300 group-hover/media:scale-102 cursor-pointer select-none"
                onClick={() => onPreview(primaryTask, batchTasks)}
                title="点击全屏放大查看"
              />
            )}

            {/* 左上角轻量「AI生成」标识 (图1同款) */}
            <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-black/35 backdrop-blur-xs text-[10px] text-white/90 font-medium select-none pointer-events-none tracking-tight">
              AI生成
            </div>

            <div className="absolute inset-0 bg-slate-950/25 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <div className="px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-white text-xs font-medium flex items-center gap-1.5 shadow-lg">
                <Maximize2 className="w-3.5 h-3.5" />
                <span>点击放大</span>
              </div>
            </div>
          </div>
        ) : (
          /* 生成中 / 未就绪动画状态 */
          <div className="absolute inset-0 z-10">
            <AIGeneratingCard
              task={primaryTask}
              progressNumber={
                primaryTask.progress && primaryTask.progress.includes('%')
                  ? parseInt(primaryTask.progress, 10)
                  : 35
              }
              showProgressBadge={true}
              isVideo={Boolean(isBatchVideo)}
              variant={primaryTask.id === premiumGeneratingTaskId ? 'premium' : 'lite'}
            />
          </div>
        )}
      </div>

      {/* 卡片下方胶囊按钮操作栏 (参考图2规格: 高度40px、正方形更多按钮、冷灰质感底色) */}
      <FeedCardActionBar
        onReuse={() => onReuse(primaryTask)}
        onRegenerate={() => onRegenerate(primaryTask)}
        isMenuOpen={openMenuTaskId === primaryTask.id}
        onToggleMenu={(e) => {
          e.stopPropagation();
          setOpenMenuTaskId(
            openMenuTaskId === primaryTask.id ? null : primaryTask.id
          );
        }}
        onDelete={() => {
          onDelete(primaryTask);
          setOpenMenuTaskId(null);
        }}
        deleteText="删除该批次结果"
        reEditTitle="重新编辑提示词与参数"
        regenerateTitle="在当前对话中再次生成"
      />
    </div>
  );
}
