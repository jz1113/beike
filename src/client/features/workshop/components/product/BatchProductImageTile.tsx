import React from 'react';
import { Check, Plus, Star, ZoomIn } from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import type { TypedProductImage } from '../../model/batchTypes';

export type ImageTileLayout = 'masonry' | 'grid';

interface Props {
  itemId: string;
  imgObj: TypedProductImage;
  imgIdx: number;
  isChecked: boolean;
  selectedOrder?: number;
  layout?: ImageTileLayout;
  onToggle: () => void;
  onPreview: () => void;
  onSetPrimary?: () => void;
  onFocusStage?: () => void;
}

function BatchProductImageTile({
  imgObj,
  imgIdx,
  isChecked,
  selectedOrder = -1,
  layout = 'masonry',
  onToggle,
  onPreview,
  onSetPrimary,
  onFocusStage,
}: Props) {
  const isPrimary = isChecked && selectedOrder === 0;
  const isMasonry = layout === 'masonry';

  const typeLabel = imgObj.type === 'main'
    ? `主图 ${imgIdx + 1}`
    : imgObj.type === 'sku'
      ? 'SKU'
      : '详情';

  const handleClick = () => {
    if (onFocusStage) {
      onFocusStage();
    }
    onToggle();
  };

  const cardBorderAndShadow = isChecked
    ? isPrimary
      ? 'border-amber-500 ring-2 ring-amber-500/90 shadow-[0_0_18px_rgba(245,158,11,0.25)] dark:shadow-[0_0_22px_rgba(245,158,11,0.2)]'
      : 'border-indigo-600 ring-2 ring-indigo-500/90 shadow-[0_0_16px_rgba(99,102,241,0.2)] dark:shadow-[0_0_20px_rgba(99,102,241,0.15)]'
    : 'border-slate-200/80 hover:border-indigo-400/80 hover:shadow-lg hover:-translate-y-0.5 dark:border-white/10 dark:hover:border-indigo-500/60 dark:hover:shadow-black/50';

  return (
    <div
      className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 select-none border ${cardBorderAndShadow} bg-white dark:bg-[#18191d] ${
        isMasonry ? 'w-full' : 'aspect-square'
      }`}
      title={
        isChecked
          ? isPrimary
            ? '当前已设为 #1 主基准（点击取消）'
            : `已选为参考图 #${selectedOrder + 1}（点击取消，或悬停设为主基准）`
          : '点击选为参考素材'
      }
    >
      {/* 图像容器：瀑布流模式自适应自然长宽比；统一网格模式平铺居中 */}
      {isMasonry ? (
        <div className="w-full relative overflow-hidden bg-slate-100/40 dark:bg-white/[0.02]">
          <LazyProxyImage
            src={imgObj.url}
            thumb={true}
            width={520}
            wrapperClassName="relative overflow-hidden w-full bg-slate-100/30 dark:bg-white/[0.02]"
            className="w-full h-auto block object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
            alt={`${typeLabel}，素材 ${imgIdx + 1}`}
          />
        </div>
      ) : (
        <div className="w-full h-full p-2 flex items-center justify-center relative overflow-hidden bg-slate-50/70 dark:bg-[#131417]">
          <LazyProxyImage
            src={imgObj.url}
            thumb={true}
            width={380}
            wrapperClassName="w-full h-full relative flex items-center justify-center bg-transparent"
            className="max-w-full max-h-full object-contain transition-transform duration-300 ease-out group-hover:scale-105"
            alt={`${typeLabel}，素材 ${imgIdx + 1}`}
          />
        </div>
      )}

      {/* 点击卡片主交互层 */}
      <button
        type="button"
        aria-label={`${isChecked ? '取消选择' : '选择'}素材 ${imgIdx + 1}`}
        aria-pressed={isChecked}
        onClick={handleClick}
        className="absolute inset-0 z-10 rounded-[inherit] cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-[-2px]"
      />

      {/* 左上角轻量毛玻璃类型标签 */}
      <div className="absolute top-2 left-2 z-20 pointer-events-none">
        <span
          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold backdrop-blur-md shadow-xs ${
            imgObj.type === 'main'
              ? 'bg-indigo-600/85 text-white'
              : imgObj.type === 'sku'
                ? 'bg-emerald-600/85 text-white'
                : 'bg-slate-900/65 dark:bg-black/70 text-slate-100'
          }`}
        >
          {typeLabel}
        </span>
      </div>

      {/* 右上角选中状态徽标 / 悬停选图按钮 */}
      <div className="absolute top-2 right-2 z-20 pointer-events-none">
        {isChecked ? (
          <div
            className={`px-2 py-0.5 rounded-lg text-[10px] font-black shadow-md flex items-center gap-1 backdrop-blur-md ${
              isPrimary
                ? 'bg-amber-500 text-white'
                : 'bg-indigo-600 text-white'
            }`}
          >
            {isPrimary ? (
              <>
                <Star className="w-2.5 h-2.5 fill-current" />
                <span>#1 主基准</span>
              </>
            ) : (
              <>
                <Check className="w-2.5 h-2.5 stroke-[3]" />
                <span>#{selectedOrder + 1} 参考</span>
              </>
            )}
          </div>
        ) : (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 px-2 py-0.5 rounded-lg bg-black/60 hover:bg-indigo-600 text-white text-[10px] font-semibold backdrop-blur-md shadow-xs flex items-center gap-1">
            <Plus className="w-3 h-3 stroke-[2.5]" />
            <span>选为参考</span>
          </div>
        )}
      </div>

      {/* 底部悬浮快捷工具条：鼠标移入时优雅浮现，平时完全不挡图 */}
      <div className="absolute bottom-2 inset-x-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className="px-2 py-1 rounded-lg bg-black/75 hover:bg-black/95 text-white text-[10px] font-medium flex items-center gap-1 backdrop-blur-md shadow-xs transition-colors cursor-zoom-in"
          title="查看高清原图"
        >
          <ZoomIn className="w-3 h-3" />
          <span>大图</span>
        </button>

        {(!isChecked || selectedOrder !== 0) && onSetPrimary && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetPrimary();
            }}
            className="px-2 py-1 rounded-lg bg-amber-500/90 hover:bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1 backdrop-blur-md shadow-xs transition-colors cursor-pointer"
            title="设为生图 #1 第一主基准"
          >
            <Star className="w-3 h-3 fill-current" />
            <span>设为主基准</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default React.memo(BatchProductImageTile);
