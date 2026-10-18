import React from 'react';
import { AlertCircle, Check, FileText, Loader2 } from 'lucide-react';
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

export function DocumentAssetCardCover({
  task,
  className = '',
}: {
  task: { prompt?: string; title?: string; referenceImages?: string[] };
  className?: string;
}) {
  const isPpt = /ppt|演示|幻灯片/i.test(task.prompt || '');
  const isWord = /word|企划|策划|专案/i.test(task.prompt || '');
  const badgeLabel = isPpt ? 'PPT' : isWord ? 'DOC' : 'MD';
  const badgeBg = isPpt
    ? 'bg-amber-500 text-white'
    : isWord
    ? 'bg-indigo-600 text-white'
    : 'bg-sky-600 text-white';
  const typeLabel = isPpt ? '演示大纲' : isWord ? '策划专案' : '方案文档';
  const docTitle = (task.title || task.prompt || 'AI交付方案').replace(/[\\/:*?"<>|]/g, '').slice(0, 30);

  return (
    <div
      className={`relative flex h-full w-full flex-col justify-between p-3 select-none overflow-hidden ${
        isPpt
          ? 'bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white'
          : isWord
          ? 'bg-gradient-to-br from-indigo-50/90 via-blue-50/40 to-white'
          : 'bg-gradient-to-br from-sky-50/90 via-slate-50/50 to-white'
      } ${className}`}
    >
      {/* 顶部标签 */}
      <div className="flex items-center justify-between gap-1 z-10">
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold font-mono tracking-wide ${badgeBg}`}
        >
          {badgeLabel}
        </span>
        <span className="text-[10px] font-medium text-slate-400">{typeLabel}</span>
      </div>

      {/* 中部文档骨架微缩视觉 */}
      <div className="my-auto space-y-1.5 z-10">
        <p className="text-[11px] font-bold text-slate-800 line-clamp-2 leading-snug dark:text-slate-100">
          {docTitle}
        </p>
        <div className="space-y-1 pt-1 opacity-60">
          <div className="h-1.5 w-4/5 rounded-full bg-slate-200 dark:bg-white/10" />
          <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10" />
          <div className="h-1.5 w-2/3 rounded-full bg-slate-200 dark:bg-white/10" />
        </div>
      </div>

      {/* 底部微提示 */}
      <div className="flex items-center justify-between pt-1 border-t border-black/[0.04] text-[9.5px] text-slate-400 z-10">
        <span>交付物</span>
        <span className="group-hover:text-purple-600 font-medium transition-colors">在线查阅</span>
      </div>

      {/* 浅水印背景图标 */}
      <div className="absolute -right-2 -bottom-2 text-black/[0.03] pointer-events-none transform rotate-12 scale-150">
        <FileText className="w-16 h-16" />
      </div>
    </div>
  );
}

export function MaterialAssetCard({
  task,
  isSelected,
  isBatchMode = false,
  onToggleSelect,
  onClick,
}: Props) {
  const kind = getAssetMediaKind(task);
  const isDoc = kind === 'document';
  const isVideo = kind === 'video';
  const durationBadge = isVideo ? (task.duration ? `${task.duration}s` : '7s') : null;
  const title =
    task.title ||
    task.prompt ||
    (isDoc ? '方案文档' : isVideo ? '视频素材' : '图片素材');

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
        className={`relative aspect-square w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-[#13161C] transition-all ${
          isSelected
            ? 'ring-2 ring-purple-600 border border-purple-500 shadow-md'
            : 'border border-slate-200/70 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:shadow-xs'
        }`}
      >
        <button
          type="button"
          onClick={(e) => onToggleSelect(task.id, e)}
          aria-label={isSelected ? '取消勾选' : '勾选'}
          className={`absolute left-2 top-2 z-20 flex h-4 w-4 items-center justify-center rounded-sm transition-all ${
            isSelected
              ? 'bg-slate-900 text-white shadow-xs opacity-100 dark:bg-white dark:text-slate-950'
              : isBatchMode
              ? 'border border-slate-300 bg-white/90 opacity-100 hover:bg-white text-transparent dark:hover:bg-white/10 dark:bg-[#18191c]/95'
              : 'border border-slate-300 bg-white/80 opacity-0 group-hover:opacity-100 hover:bg-white text-transparent dark:hover:bg-white/10 dark:bg-[#18191c]/95'
          }`}
        >
          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
        </button>

        {isDoc ? (
          <DocumentAssetCardCover task={task} />
        ) : task.resultUrl ? (
          <AssetMediaPreview
            src={task.resultUrl}
            mediaType={task.mediaType}
            model={task.model}
            title={title}
            posterUrl={task.coverUrl}
            videoAutoPlay={false}
          />
        ) : task.status === 'FAILURE' ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-slate-400 bg-rose-50/30">
            <AlertCircle className="h-5 w-5 text-rose-400" />
            <span className="text-[10px] text-rose-400">生成未完成</span>
          </div>
        ) : task.status === 'IN_PROGRESS' || task.status === 'PENDING' ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-slate-400 bg-slate-50 dark:bg-white/5">
            <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />
            <span className="text-[10px] text-purple-600 font-medium">生成中…</span>
          </div>
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

      <p className="mt-1.5 truncate text-[11px] font-medium text-slate-700 dark:text-[#C7C7CC] group-hover:text-slate-900 dark:group-hover:text-white px-0.5 transition-colors" title={title}>
        {title}
      </p>
    </div>
  );
}

export default React.memo(MaterialAssetCard);
