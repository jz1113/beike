import { isDeliverableWorkshopResult, isUsableWorkshopResult } from '../../model/generation/workshopReadiness';
import { ZoomIn } from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import { BatchProductItem } from '../../model/batchTypes';

export interface BatchStage4GalleryViewProps {
  successfulItems: BatchProductItem[];
  setActiveItemIndex: (index: number) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  setPreviewImageUrl: (url: string | null) => void;
  onReviewTask?: (itemId: string, taskId: string, decision: 'accepted' | 'rejected') => void;
  isReviewingOutputs?: boolean;
  readOnly?: boolean;
}

export function BatchStage4GalleryView({
  successfulItems,
  setActiveItemIndex,
  onPreviewGallery,
  setPreviewImageUrl,
  onReviewTask,
  isReviewingOutputs = false,
  readOnly = false,
}: BatchStage4GalleryViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {successfulItems.map((item) => {
        const tasks = item.tasks || [];
        const successTasks = tasks.filter(isUsableWorkshopResult);
        const previewUrls = successTasks.map(t => t.resultUrl).filter((url): url is string => !!url);

        return (
          <div
            key={item.id}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow dark:border-white/10 dark:bg-[#18191c]"
          >
            {/* 商品头部 */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 dark:border-white/10">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900 truncate dark:text-slate-100">{item.title}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {successTasks.length}/{tasks.length} 张已完成
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveItemIndex(successfulItems.findIndex(i => i.id === item.id))}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
              >
                查看详情
              </button>
            </div>

            {/* 图片画廊网格 */}
            {previewUrls.length > 0 ? (
              <div className="grid grid-cols-2 gap-1 p-1">
                {successTasks.map((task, idx) => {
                  const excluded = !isDeliverableWorkshopResult(task);
                  const canReview = !readOnly && !!onReviewTask;
                  const preview = () => {
                      if (onPreviewGallery) {
                        onPreviewGallery(previewUrls, idx, `${item.title} - 成图`);
                      } else {
                        setPreviewImageUrl(task.resultUrl!);
                      }
                  };
                  return <div key={task.id} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 group dark:bg-white/10">
                    <button type="button"
                      aria-label={`分镜 ${task.shot_no}：${canReview ? excluded ? '点击恢复采用' : '点击不采用' : '放大预览'}`}
                      aria-pressed={canReview ? excluded : undefined}
                      disabled={canReview && isReviewingOutputs}
                      onClick={() => { if (canReview) onReviewTask?.(item.id, task.id, excluded ? 'accepted' : 'rejected'); else preview(); }}
                      className={`h-full w-full cursor-pointer transition-[filter,opacity] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-indigo-500 disabled:cursor-wait ${excluded ? 'grayscale opacity-35' : ''}`}>
                    <LazyProxyImage
                      src={task.resultUrl!}
                      alt={`成图 ${idx + 1}`}
                      className="w-full h-full !object-contain"
                      thumb={true}
                      width={600}
                    />
                    </button>
                    <button type="button" aria-label={`放大预览分镜 ${task.shot_no}`} onClick={preview}
                      className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-[#18191c]/95 dark:text-slate-100">
                      <ZoomIn className="h-4 w-4" />
                    </button>
                  </div>;
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                暂无生成的图片
              </div>
            )}

            {/* 文案预览 */}
            {item.copywriting?.title && (
              <div className="px-4 py-3 border-t border-slate-100 dark:border-white/10">
                <p className="text-xs font-bold text-slate-800 truncate dark:text-slate-100">{item.copywriting.title}</p>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 dark:text-slate-400">
                  {item.copywriting.content}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
