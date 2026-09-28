import { audienceLabel } from '@shared/domain/assets/appearanceAudience';
import { visualAssetIssue } from '@shared/domain/assets/assetDeconstruct/visualEvidence';
import { type MouseEvent, useMemo, useState } from 'react';
import {
  Star,
  Trash2,
  Edit2,
  Copy,
  Check,
  ArrowRight,
  MoreHorizontal,
  CheckSquare,
  Square,
  Image as ImageIcon,
  ZoomIn,
  Tag,
} from 'lucide-react';
import { getAssetCardSummary, isValidDisplayTag } from '../utils/assetPromptConstants';
import { type AssetSubTab } from '../utils/assetPromptConstants';
import { resolveActionCardDisplayBadges } from '@shared/domain/products/productCategory';
import { PromptAssetLifecycleBadges } from './PromptAssetLifecycleBadges';

interface PromptAssetCardProps {
  item: Record<string, unknown> & {
    id: string;
    isFavorite?: boolean;
    code?: string;
    title?: string | null;
    name?: string | null;
    coverUrl?: string | null;
    avatarUrl?: string | null;
    sourceImages?: string | null;
    sourceImageIndex?: number | null;
    sourceImageIndices?: string | null;
    groupIndex?: number | null;
    provenance?: string | null;
    tags?: string | null;
  };
  activeSubTab: AssetSubTab;
  isBatchMode: boolean;
  isSelected: boolean;
  isMenuOpen: boolean;
  copiedId: string | null;
  onCardClick: () => void;
  onToggleSelect: (e: MouseEvent) => void;
  onToggleFavorite: (e: MouseEvent) => void;
  onToggleMenu: (e: MouseEvent) => void;
  onViewDetail: (e: MouseEvent) => void;
  onCopy: (e: MouseEvent) => void;
  onEdit: (e: MouseEvent) => void;
  onQuickEditTag?: (item: PromptAssetCardProps['item'], e: MouseEvent) => void;
  onDelete: (e: MouseEvent) => void;
  onPreviewImage?: (imageUrl: string, e: MouseEvent) => void;
}

const DEFAULT_CODE: Record<AssetSubTab, string> = {
  full_prompt: '#R-01',
  persona: '#P-01',
  outfit: '#O-01',
  scene: '#S-01',
  action: '#A-01',
};

const TAB_HOVER_TITLE_CLASS: Record<AssetSubTab, string> = {
  full_prompt: 'group-hover:text-indigo-600',
  persona: 'group-hover:text-amber-600',
  outfit: 'group-hover:text-sky-600',
  scene: 'group-hover:text-emerald-600',
  action: 'group-hover:text-purple-600',
};

export default function PromptAssetCard({
  item,
  activeSubTab,
  isBatchMode,
  isSelected,
  isMenuOpen,
  copiedId,
  onCardClick,
  onToggleSelect,
  onToggleFavorite,
  onToggleMenu,
  onViewDetail,
  onCopy,
  onEdit,
  onQuickEditTag,
  onDelete,
  onPreviewImage,
}: PromptAssetCardProps) {
  const summary = getAssetCardSummary(item, activeSubTab);
  const codeLabel = item.code
    ? `#${String(item.code).replace(/^#/, '')}`
    : DEFAULT_CODE[activeSubTab];

  // 提取来源原图 URL 与位置索引
  const imageUrl = (item.coverUrl || item.avatarUrl) as string | undefined;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const visibleImageUrl = imageUrl && imageUrl !== failedImageUrl ? imageUrl : null;
  const sourceIndex = typeof item.sourceImageIndex === 'number' ? item.sourceImageIndex : null;
  const sourceIndices = useMemo(() => {
    try {
      const parsed = JSON.parse(String(item.sourceImageIndices || '[]'));
      return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
    } catch { return []; }
  }, [item.sourceImageIndices]);

  // 提取精炼合规短标签（严格限制最多 1~2 个短标签，绝不允许长句或色系霸屏）
  const displayBadges = useMemo(() => {
    if (activeSubTab === 'action') {
      const badges = resolveActionCardDisplayBadges(item);
      return badges.slice(0, 2);
    }
    if (item.tags) {
      const tokens = String(item.tags)
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(isValidDisplayTag);
      return tokens.slice(0, 1).map((tag, idx) => ({
        id: `tag-${idx}`,
        label: tag,
        colorClass: 'bg-slate-50 text-slate-600 border-slate-200/80',
      }));
    }
    return [];
  }, [activeSubTab, item]);

  return (
    <div
      onClick={onCardClick}
      className={`group relative self-start flex flex-col rounded-2xl bg-transparent transition-colors duration-200 cursor-pointer ${
        isSelected
          ? 'bg-indigo-50/80 ring-2 ring-indigo-400 shadow-[0_8px_24px_rgba(79,70,229,0.12)]'
          : ''
      }`}
    >
      {/* 图片下方先显示标题和常用操作 */}
      <div className="order-2 mt-2 flex min-h-7 items-center gap-1.5 select-none">
        <h3
          className={`min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-slate-900 transition-colors ${TAB_HOVER_TITLE_CLASS[activeSubTab]}`}
          title={item.title || item.name || undefined}
        >
          {item.title || item.name || '未命名资产'}
        </h3>
        <div className="flex shrink-0 items-center gap-0.5">
          {isBatchMode && (
            <div
              onClick={onToggleSelect}
              className="mr-0.5 shrink-0 cursor-pointer text-indigo-600 transition-transform hover:scale-110"
            >
              {isSelected ? (
                <CheckSquare className="w-4 h-4 text-indigo-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
            </div>
          )}

          <button
            onClick={onToggleFavorite}
            className="p-1 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-50 transition-colors cursor-pointer"
            title={item.isFavorite ? '取消收藏' : '加入收藏'}
          >
            <Star className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>

          <div className="relative">
            <button
              onClick={onToggleMenu}
              className="p-1 rounded-lg text-slate-400 opacity-60 hover:opacity-100 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
              title="更多操作"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {isMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-20 w-28 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-[11px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={onCopy}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer"
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
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5 text-purple-600" />
                  <span>修改标签</span>
                </button>
                <button
                  onClick={onEdit}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>编辑</span>
                </button>
                <button
                  onClick={onDelete}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="order-3 mt-0.5 flex min-h-5 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10px] text-slate-500">
        <span className="shrink-0 font-mono tracking-wide" title={codeLabel}>{codeLabel}</span>
        {sourceIndices.length > 0 ? (
          <span
            className="shrink-0 font-medium text-slate-500"
            title={activeSubTab === 'full_prompt'
              ? `图组母本为 #${sourceIndex ?? sourceIndices[0]}；联动参考图 ${sourceIndices.map((index) => `#${index}`).join('、')}`
              : `内容图组包含原图 ${sourceIndices.map((index) => `#${index}`).join('、')}`}
          >
            {activeSubTab === 'full_prompt' ? `母本 #${sourceIndex ?? sourceIndices[0]}` : `图组 ${sourceIndices.map((index) => `#${index}`).join('·')}`}
          </span>
        ) : sourceIndex !== null ? (
          <span className="shrink-0 font-medium" title={`此提示词资产提取自原图集的第 ${sourceIndex} 张图片`}>
            图#{sourceIndex}
          </span>
        ) : imageUrl ? (
          <span className="shrink-0 font-medium" title="含来源参考原图">原图</span>
        ) : null}
        <PromptAssetLifecycleBadges item={item} />
      </div>

      {visualAssetIssue(item, activeSubTab) ? (
        <p className="order-4 mt-1 text-[10px] font-medium text-rose-600">{visualAssetIssue(item, activeSubTab)}</p>
      ) : null}

      {/* 中部：来源原图缩略图 + 提示词摘要 */}
      <div className="order-1 min-w-0">
        {visibleImageUrl ? (
          <div
            onClick={(e) => {
              if (onPreviewImage) {
                e.stopPropagation();
                onPreviewImage(visibleImageUrl, e);
              }
            }}
            className="group/thumb relative aspect-[3/4] w-full rounded-2xl overflow-hidden bg-white/40 ring-1 ring-slate-200/60 shadow-sm transition-shadow hover:shadow-lg cursor-zoom-in"
            title="点击放大查看来源参考原图"
          >
            <img
              src={visibleImageUrl}
              alt="来源参考原图"
              className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-[1.03]"
              loading="eager"
              decoding="async"
              onError={() => setFailedImageUrl(visibleImageUrl)}
            />
            <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
              <ZoomIn className="w-3.5 h-3.5 text-white drop-shadow-sm" />
            </div>
            {sourceIndex !== null && (
              <span className="absolute bottom-0 right-0 px-1 py-0.2 text-[9px] font-bold bg-slate-900/75 text-white rounded-tl-md">
                #{sourceIndex}
              </span>
            )}
          </div>
        ) : (
          <div className="aspect-[3/4] w-full rounded-2xl bg-slate-50/90 ring-1 ring-slate-200/60 flex flex-col items-center justify-center gap-3 p-6 text-slate-400">
            <ImageIcon className="w-5 h-5" />
            <span className="text-xs font-medium">{imageUrl ? '图片暂不可用' : '暂无参考图片'}</span>
            <p className="line-clamp-4 text-center text-xs leading-5 text-slate-500">{summary || item.title || item.name || '暂无详细描述'}</p>
          </div>
        )}


      </div>

      {((activeSubTab === 'persona' || activeSubTab === 'outfit') || displayBadges.length > 0) && (
        <div className="order-5 mt-1.5 flex min-w-0 items-center gap-1.5 overflow-hidden">
          {(activeSubTab === 'persona' || activeSubTab === 'outfit') && (
            <span className="shrink-0 text-[11px] text-indigo-600">{audienceLabel(item, activeSubTab === 'outfit')}</span>
          )}
          {/* 精炼合规的核心分类徽标 */}
          {displayBadges.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onQuickEditTag) onQuickEditTag(item, e);
              }}
              className="px-1.5 py-0.5 rounded-md text-[10px] font-medium shrink-0 transition-all cursor-pointer hover:bg-slate-100 truncate max-w-[120px] flex items-center gap-0.5 bg-slate-50 text-slate-600"
              title={`点击修改标签: ${b.label}`}
            >
              <span className="truncate">{b.label}</span>
              <Edit2 className="w-2 h-2 opacity-0 hover:opacity-70 transition-opacity shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="order-6 mt-2 border-t border-slate-200/70 pt-2">
        <button
          onClick={onViewDetail}
          className="flex w-full items-center justify-between gap-1 text-xs font-medium text-indigo-700 transition-colors hover:text-indigo-900 cursor-pointer"
        >
          <span>{activeSubTab === 'full_prompt' ? '查看图组与分镜' : '查看提示词与原图'}</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
