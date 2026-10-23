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
  const categoryId = typeof item.result?.product_major_category === 'string'
    ? item.result.product_major_category : '';
  const categoryName = categories.find(category => category.id === categoryId)?.name
    || (categoryId === 'unknown' ? '待分类' : categoryId);
  const categorySource = item.result?.product_category_source;
  const sourceLabel = categorySource === 'selected' ? '手动指定'
    : categorySource === 'vision' ? '视觉识别'
      : categorySource === 'title' ? '标题推断' : '需确认';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">
            {index + 1}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 text-sm truncate flex items-center gap-1.5 dark:text-slate-100">
              <span>{item.name}</span>
              {item.sourceUrl && <span className="shrink-0 text-rose-500 text-[10px] font-semibold">小红书图集</span>}
              {item.status === 'done' && categoryName && (
                <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                  {categoryName} · {sourceLabel}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              共 {item.images.length} 张图片
              {item.status === 'processing' && ` · ${progressMessage || '请求已提交，等待服务端处理'}`}
              {item.status === 'pending' && isDeconstructing && ' · 等待开始'}
              {item.status === 'done' && formatDeconstructSummary(item)}
              {item.status === 'error' && ` · 失败: ${item.error}`}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-semibold text-indigo-600">
            已选 {item.images.length - excluded.size} / {item.images.length}
          </span>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            disabled={isDeconstructing}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer rounded-lg"
            title="移除此图集"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2 pr-1">
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
    </div>
  );
});
