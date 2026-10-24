import { visualAssetIssue } from '@shared/domain/assets/asset-deconstruct/visualEvidence';
import { type MouseEvent, useMemo, useState } from 'react';
import {
  Star,
  Trash2,
  Edit2,
  Copy,
  Check,
  MoreHorizontal,
  Square,
  Image as ImageIcon,
  ZoomIn,
  Tag,
  FolderInput,
} from 'lucide-react';
import { getAssetCardSummary } from '../../model/assetPromptConstants';
import { type AssetSubTab } from '../../model/assetPromptConstants';
import { resolveActionCardDisplayBadges } from '@shared/domain/products/productCategory';
import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import { FullPromptCardMosaic } from './FullPromptCardMosaic';

interface PromptAssetCardProps {
  item: Record<string, unknown> & {
    id: string;
    isFavorite?: boolean;
    code?: string;
    title?: string | null;
    name?: string | null;
    albumName?: string | null;
    coverUrl?: string | null;
    avatarUrl?: string | null;
    sourceImages?: string | null;
    tags?: string | null;
  };
  activeSubTab: AssetSubTab;
  listPosition?: number;
  displayLabel?: string;
  productCategoryLabel?: string;
  isBatchMode: boolean;
  isSelected: boolean;
  isMenuOpen: boolean;
  copiedId: string | null;
  onCardClick: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onToggleSelect: (e: MouseEvent) => void;
  onToggleFavorite: (e: MouseEvent) => void;
  onToggleMenu: (e: MouseEvent) => void;
  onViewDetail: (e: MouseEvent) => void;
  onCopy: (e: MouseEvent) => void;
  onEdit: (e: MouseEvent) => void;
  onMove?: (e: MouseEvent) => void;
  onQuickEditTag?: (item: PromptAssetCardProps['item'], e: MouseEvent) => void;
  onDelete: (e: MouseEvent) => void;
  onPreviewImage?: (imageUrl: string, e: MouseEvent) => void;
}

const TAB_HOVER_TITLE_CLASS: Record<AssetSubTab, string> = {
  full_prompt: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-300',
  persona: 'group-hover:text-amber-600 dark:group-hover:text-amber-300',
  outfit: 'group-hover:text-sky-600 dark:group-hover:text-sky-300',
  scene: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-300',
  action: 'group-hover:text-purple-600 dark:group-hover:text-purple-300',
};

export default function PromptAssetCard({
  item,
  activeSubTab,
  listPosition,
  displayLabel,
  isBatchMode,
  isSelected,
  isMenuOpen,
  copiedId,
  onCardClick,
  onContextMenu,
  onToggleSelect,
  onToggleFavorite,
  onToggleMenu,
  onViewDetail,
  onCopy,
  onEdit,
  onMove,
  onQuickEditTag,
  onDelete,
  onPreviewImage,
}: PromptAssetCardProps) {
  const summary = getAssetCardSummary(item, activeSubTab);
  const groupCodeLabel = fullPromptGroupLabel(listPosition ?? item.displayNumber);
  const displayTitle = activeSubTab === 'full_prompt'
    ? groupCodeLabel
    : displayLabel || item.title || item.name || '未命名资产';
  const inlineDetail = activeSubTab === 'full_prompt' || activeSubTab === 'persona' || activeSubTab === 'outfit' || activeSubTab === 'scene';
  const headerAboveImage = activeSubTab === 'full_prompt';
  const imageUrl = (item.coverUrl || item.avatarUrl) as string | undefined;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const visibleImageUrl = imageUrl && imageUrl !== failedImageUrl ? imageUrl : null;
  const displayBadges = useMemo(() => {
    return activeSubTab === 'action' ? resolveActionCardDisplayBadges(item).slice(0, 2) : [];
  }, [activeSubTab, item]);

  const cardContainerClass = activeSubTab === 'full_prompt'
    ? `group relative self-start flex flex-col transition-all duration-200 cursor-pointer`
    : `group relative self-start flex flex-col rounded-2xl border p-2.5 shadow-2xs transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-500/10'
          : 'border-slate-200/80 bg-white/95 hover:-translate-y-0.5 hover:border-indigo-300/80 hover:shadow-md dark:border-white/[0.08] dark:bg-[#17181C]/95 dark:hover:border-indigo-400/35'
      }`;

  return (
    <div
      onClick={onCardClick}
      onContextMenu={onContextMenu}
      data-prompt-library-context
      className={cardContainerClass}
    >
      <div className={`${headerAboveImage ? 'order-1 mb-1.5 min-h-6 px-0.5' : 'order-2 mt-2 min-h-7'} flex items-center gap-1.5 select-none`}>
        <h3
          className={`min-w-0 flex-1 truncate text-xs font-bold tabular-nums leading-snug text-slate-800 transition-colors dark:text-slate-100 ${TAB_HOVER_TITLE_CLASS[activeSubTab]}`}
          title={displayTitle}
        >
          {displayTitle}
        </h3>
        {inlineDetail && activeSubTab !== 'full_prompt' && !isBatchMode && (
          <button
            type="button"
            onClick={onViewDetail}
            className="shrink-0 whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-200 cursor-pointer"
          >
            查看提示词
          </button>
        )}
        {!isBatchMode && (
          <div className="flex shrink-0 items-center gap-0.5">
            <div className="relative">
              <button
                onClick={onToggleMenu}
                className="p-1 rounded-lg text-slate-400 opacity-70 hover:opacity-100 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer dark:hover:text-slate-200 dark:hover:bg-white/10"
                title="更多操作"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {isMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-20 w-32 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-[11px] dark:border-white/10 dark:bg-[#1B1C20]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {activeSubTab !== 'full_prompt' && (
                    <>
                      <button
                        onClick={onToggleFavorite}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer dark:text-slate-200 dark:hover:bg-white/5"
                      >
                        <Star className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                        <span>{item.isFavorite ? '取消收藏' : '加入收藏'}</span>
                      </button>
                      <button
                        onClick={onCopy}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer dark:text-slate-200 dark:hover:bg-white/5"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>复制提示词</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onQuickEditTag) onQuickEditTag(item, e);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer dark:text-slate-200 dark:hover:bg-white/5"
                      >
                        <Tag className="w-3.5 h-3.5 text-purple-500" />
                        <span>修改标签</span>
                      </button>
                      <button
                        onClick={onEdit}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer dark:text-slate-200 dark:hover:bg-white/5"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>编辑</span>
                      </button>
                    </>
                  )}
                  {activeSubTab === 'full_prompt' && onMove && (
                    <button
                      onClick={onMove}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer dark:text-slate-200 dark:hover:bg-white/5"
                    >
                      <FolderInput className="w-3.5 h-3.5" />
                      <span>移动到分类</span>
                    </button>
                  )}
                  <button
                    onClick={onDelete}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>删除</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {visualAssetIssue(item, activeSubTab) ? (
        <p className="order-4 mt-1 text-[10px] font-medium text-rose-600 dark:text-rose-400">{visualAssetIssue(item, activeSubTab)}</p>
      ) : null}

      <div className={`relative min-w-0 ${headerAboveImage ? 'order-2' : 'order-1'}`}>
        {visibleImageUrl ? (
          <div
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) {
                e.stopPropagation();
                onCardClick(e);
                return;
              }
              if (!isBatchMode && onPreviewImage) {
                e.stopPropagation();
                onPreviewImage(visibleImageUrl, e);
              }
            }}
            className={`relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-slate-100/80 transition-all group/thumb dark:bg-[#121316] ${
              isSelected
                ? 'ring-2 ring-indigo-500 shadow-md'
                : 'ring-1 ring-slate-200/70 hover:ring-indigo-400/60 dark:ring-white/[0.08] dark:hover:ring-indigo-400/50'
            } ${isBatchMode ? 'cursor-pointer' : 'cursor-zoom-in'}`}
            title={isBatchMode ? '点击选择或取消选择' : '点击查看原图'}
          >
            {activeSubTab === 'full_prompt' ? (
              <FullPromptCardMosaic
                sourceImages={item.sourceImages}
                sourceImageIndices={item.sourceImageIndices}
                coverUrl={visibleImageUrl}
                title={displayTitle}
                onCoverError={() => setFailedImageUrl(visibleImageUrl)}
              />
            ) : (
              <img
                src={visibleImageUrl}
                alt={displayTitle}
                className={`w-full h-full object-cover transition-transform duration-300 ${isBatchMode ? '' : 'group-hover/thumb:scale-[1.03]'}`}
                loading="eager"
                decoding="async"
                onError={() => setFailedImageUrl(visibleImageUrl)}
              />
            )}
            {!isBatchMode && (
              <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                <ZoomIn className="w-3.5 h-3.5 text-white drop-shadow-sm" />
              </div>
            )}
            {activeSubTab === 'full_prompt' && item.imageReplaced === true && (
              <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm ring-1 ring-white/20 backdrop-blur-md">已换图</span>
            )}
          </div>
        ) : (
          <div className="aspect-[3/4] w-full rounded-xl bg-slate-50/90 ring-1 ring-slate-200/60 flex flex-col items-center justify-center gap-3 p-6 text-slate-400 dark:bg-white/[0.04] dark:ring-white/10">
            <ImageIcon className="w-5 h-5" />
            <span className="text-xs font-medium">{imageUrl ? '图片暂不可用' : '暂无参考图片'}</span>
            <p className="line-clamp-4 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">{summary || item.title || item.name || '暂无详细描述'}</p>
          </div>
        )}
        {isBatchMode && (
          <button
            type="button"
            onClick={onToggleSelect}
            aria-label={`${isSelected ? '取消选择' : '选择'}${displayTitle}`}
            aria-pressed={isSelected}
            className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm transition-colors cursor-pointer ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white/95 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:text-slate-400 dark:border-white/10 dark:bg-[#18191c]/95'}`}
          >
            {isSelected ? <Check className="h-5 w-5" strokeWidth={3} /> : <Square className="h-5 w-5" />}
          </button>
        )}
      </div>

      {displayBadges.length > 0 && (
        <div className="order-5 mt-2 flex min-w-0 items-center justify-between gap-1.5 overflow-hidden">
          {displayBadges.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={(e) => {
                if (isBatchMode) return;
                e.stopPropagation();
                if (onQuickEditTag) onQuickEditTag(item, e);
              }}
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium shrink-0 transition-all truncate max-w-[120px] flex items-center gap-0.5 bg-slate-100/80 text-slate-600 dark:text-slate-300 dark:bg-white/[0.06] ${isBatchMode ? '' : 'cursor-pointer hover:bg-slate-200/70 dark:hover:bg-white/10'}`}
              title={isBatchMode ? undefined : `点击修改标签: ${b.label}`}
            >
              <span className="truncate">{b.label}</span>
              {!isBatchMode && <Edit2 className="w-2 h-2 opacity-0 hover:opacity-70 transition-opacity shrink-0" />}
            </button>
          ))}
        </div>
      )}

      {!isBatchMode && !inlineDetail && (
        <div className="order-6 mt-2 border-t border-slate-200/70 pt-2 dark:border-white/10">
          <button
            onClick={onViewDetail}
            className="flex w-full items-center gap-1 text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200 cursor-pointer"
          >
            <span>查看提示词与原图</span>
          </button>
        </div>
      )}
    </div>
  );
}
