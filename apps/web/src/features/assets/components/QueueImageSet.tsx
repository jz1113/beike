import { memo } from 'react';
import { Check, X } from 'lucide-react';
import { formatDeconstructSummary, type ImageSetQueueItem } from '../utils/assetPromptConstants';

type Props = {
  item: ImageSetQueueItem;
  index: number;
  isDeconstructing: boolean;
  progressMessage?: string;
  onToggleImage: (itemId: string, imageIndex: number) => void;
  onRemove: (itemId: string) => void;
};

export const QueueImageSet = memo(function QueueImageSet({
  item, index, isDeconstructing, progressMessage, onToggleImage, onRemove,
}: Props) {
  const excluded = new Set(item.excludedImageIndices || []);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">
            {index + 1}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 text-sm truncate flex items-center gap-1.5">
              <span>{item.name}</span>
              {item.sourceUrl && <span className="shrink-0 text-rose-500 text-[10px] font-semibold">小红书图集</span>}
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
        {item.images.map((img, imageIndex) => {
          const selected = !excluded.has(imageIndex);
          return (
            <button
              key={imageIndex}
              type="button"
              onClick={() => onToggleImage(item.id, imageIndex)}
              disabled={isDeconstructing}
              aria-pressed={selected}
              title={selected ? '已选择，点击取消' : '未选择，点击加入'}
              className={`group relative w-[124px] shrink-0 aspect-[3/4] overflow-hidden rounded-2xl bg-slate-100 transition-all sm:w-[132px] xl:w-[140px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                selected
                  ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-md shadow-indigo-100/70'
                  : 'opacity-40 grayscale hover:opacity-70'
              }`}
            >
              <img
                src={img}
                alt={`图 ${imageIndex + 1}${selected ? '，已选' : '，未选'}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
              <span className="absolute bottom-2 left-2 rounded-lg bg-slate-950/65 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                图 {imageIndex + 1}
              </span>
              {selected && (
                <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
