import React from 'react';
import { Check } from 'lucide-react';
import type { AssetTaskBatch } from '../model/assetBatch';
import AssetMediaPreview from './AssetMediaPreview';
import { getAssetMediaKind } from '../model/assetMedia';

type Task = AssetTaskBatch['tasks'][number];

interface Props {
  task: Task;
  isSelected: boolean;
  isBatchMode?: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onClick: (task: Task) => void;
}

export function MaterialAssetCard({
  task,
  isSelected,
  isBatchMode = false,
  onToggleSelect,
  onClick,
}: Props) {
  const kind = getAssetMediaKind(task);
  const isVideo = kind === 'video';
  const durationBadge = isVideo ? (task.duration ? `${task.duration}s` : '7s') : null;
  const title = task.title || task.prompt || (isVideo ? '视频素材' : '图片素材');

  const handleCardClick = (e: React.MouseEvent) => {
    if (isBatchMode) {
      onToggleSelect(task.id, e);
    } else {
      onClick(task);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative flex flex-col cursor-pointer transition-all ${
        isSelected ? 'scale-[0.99]' : ''
      }`}
    >
      <div
        className={`relative aspect-square w-full overflow-hidden rounded-xl bg-slate-100 transition-all ${
          isSelected
            ? 'ring-2 ring-purple-600 border border-purple-500 shadow-md'
            : 'border border-slate-200/70 hover:border-slate-300 hover:shadow-xs'
        }`}
      >
        <button
          type="button"
          onClick={(e) => onToggleSelect(task.id, e)}
          aria-label={isSelected ? '取消勾选' : '勾选'}
          className={`absolute left-2 top-2 z-20 flex h-4 w-4 items-center justify-center rounded-sm transition-all ${
            isSelected
              ? 'bg-slate-900 text-white shadow-xs opacity-100'
              : isBatchMode
              ? 'border border-slate-300 bg-white/90 opacity-100 hover:bg-white text-transparent'
              : 'border border-slate-300 bg-white/80 opacity-0 group-hover:opacity-100 hover:bg-white text-transparent'
          }`}
        >
          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
        </button>

        {task.resultUrl ? (
          <AssetMediaPreview
            src={task.resultUrl}
            mediaType={task.mediaType}
            model={task.model}
            title={title}
            posterUrl={task.coverUrl}
            videoAutoPlay={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect width="18" height="18" x="3" y="3" rx="2" strokeWidth="1.5" />
              <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
              <path d="m21 15-5-5L5 21" strokeWidth="1.5" />
            </svg>
          </div>
        )}

        {durationBadge && (
          <span className="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-sm bg-black/60 text-[10px] font-mono font-medium text-white backdrop-blur-2xs">
            {durationBadge}
          </span>
        )}
      </div>

      <p className="mt-1.5 truncate text-[11px] font-medium text-slate-700 px-0.5" title={title}>
        {title}
      </p>
    </div>
  );
}

export default React.memo(MaterialAssetCard);
