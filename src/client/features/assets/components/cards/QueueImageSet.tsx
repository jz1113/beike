import { memo } from 'react';
import { X } from 'lucide-react';
import { QueueImageTile } from './QueueImageTile';
import { formatDeconstructSummary, type ImageSetQueueItem } from '../../model/assetPromptConstants';
import type { ProductCategoryOption } from '../../hooks/deconstructQueueOps';

type Props = {
  item: ImageSetQueueItem;
  index: number;
  isDeconstructing: boolean;
  progressMessage?: string;
  categories?: ProductCategoryOption[];
  onToggleImage: (itemId: string, imageIndex: number) => void;
  onRemove: (itemId: string) => void;
};

export const QueueImageSet = memo(function QueueImageSet({
  item, index, isDeconstructing, progressMessage, categories = [], onToggleImage, onRemove,
}: Props) {
  const excluded = new Set(item.excludedImageIndices || []);
  const selectedCount = item.images.length - excluded.size;
  const categoryId = typeof item.result?.product_major_category === 'string'
    ? item.result.product_major_category : '';
  const categoryName = categories.find(category => category.id === categoryId)?.name
    || (categoryId === 'unknown' ? '待分类' : categoryId);
  const categorySource = item.result?.product_category_source;
  const sourceLabel = categorySource === 'selected' ? '手动指定'
    : categorySource === 'vision' ? '视觉识别'
      : categorySource === 'title' ? '标题推断' : '需确认';
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/55 p-3 transition-colors hover:border-indigo-300/60 dark:border-white/[0.08] dark:bg-white/[0.03]">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100">
            组 {index + 1}
          </span>
          {item.status === 'done' && categoryName && (
            <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              {categoryName} · {sourceLabel}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
            selectedCount === 4
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
          }`}>
            {selectedCount === 4 && item.images.length === 4 ? '4 张成组' : `已选 ${selectedCount}/${item.images.length}`}
          </span>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            disabled={isDeconstructing}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 cursor-pointer dark:hover:bg-red-500/10"
            title="移除此图组"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {item.images.map((img, imageIndex) => (
          <QueueImageTile
            key={imageIndex}
            url={img}
            itemId={item.id}
            imageIndex={imageIndex}
            selected={!excluded.has(imageIndex)}
            disabled={isDeconstructing}
            onToggle={onToggleImage}
          />
        ))}
      </div>

      {(item.status !== 'pending' || isDeconstructing) && (
        <div className="mt-2 truncate text-[11px] text-slate-500 dark:text-slate-400">
          {item.status === 'processing' && (progressMessage || '请求已提交，等待服务端处理')}
          {item.status === 'pending' && isDeconstructing && '等待开始'}
          {item.status === 'done' && formatDeconstructSummary(item).replace(/^\s*·\s*/, '')}
          {item.status === 'error' && <span className="text-rose-500">失败: {item.error}</span>}
        </div>
      )}
    </div>
  );
});
