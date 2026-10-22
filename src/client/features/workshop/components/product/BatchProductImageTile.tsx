import React from 'react';
import { Check, Plus, Star, ZoomIn } from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import type { TypedProductImage } from '../../model/batchTypes';

export type ImageTileVariant = 'focus' | 'compact';

interface Props {
  itemId: string;
  imgObj: TypedProductImage;
  imgIdx: number;
  isChecked: boolean;
  selectedOrder?: number;
  isHeroActive?: boolean;
  variant: ImageTileVariant;
  onToggle: () => void;
  onPreview: () => void;
  onFocusStage?: () => void;
}

function BatchProductImageTile({
  imgObj,
  imgIdx,
  isChecked,
  selectedOrder = -1,
  isHeroActive = false,
  variant,
  onToggle,
  onPreview,
  onFocusStage,
}: Props) {
  const isFocus = variant === 'focus';
  const isPrimary = isChecked && selectedOrder === 0;

  const typeLabel = imgObj.type === 'main'
    ? (isFocus ? `主图 ${imgIdx + 1}` : '主')
    : imgObj.type === 'sku'
      ? (isFocus ? 'SKU' : 'SKU')
      : (isFocus ? '详情' : '详');

  const handleClick = () => {
    if (onFocusStage) {
      onFocusStage();
    }
    onToggle();
  };

  return (
    <div
      className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer transition-all duration-200 select-none border ${
        isChecked
          ? isPrimary
            ? 'border-amber-500 ring-2 ring-amber-500/80 shadow-sm'
            : 'border-indigo-600 ring-2 ring-indigo-500/80 shadow-sm'
          : isHeroActive
            ? 'border-sky-500 ring-2 ring-sky-400/80 shadow-xs'
            : 'border-slate-200/80 hover:border-slate-400/60 dark:border-white/10 dark:hover:border-white/20'
      } bg-slate-900/5 dark:bg-[#191a1e]`}
      title={
        isChecked
          ? isPrimary
            ? '已选为主参考（点击取消）'
            : `已选为参考图 #${selectedOrder + 1}（点击取消）`
          : '点击检视并设为参考'
      }
    >
      {/* 缩略图：采用 contain 完整留白呈现，彻底避免切字；深色底托消除刺眼死白马赛克 */}
      <div className="w-full h-full p-1.5 flex items-center justify-center overflow-hidden">
        <LazyProxyImage
          src={imgObj.url}
          thumb={true}
          width={380}
          className="max-w-full max-h-full object-contain transition-transform duration-300 ease-out group-hover:scale-105"
          alt={`${typeLabel}，素材 ${imgIdx + 1}`}
        />
      </div>

      {/* 点击卡片主交互层 */}
      <button
        type="button"
        aria-label={`${isChecked ? '取消选择' : '选择'}素材 ${imgIdx + 1}`}
        aria-pressed={isChecked}
        onClick={handleClick}
        className="absolute inset-0 z-10 rounded-[inherit] cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-[-2px]"
      />

      {/* 左上角悬停浮现放大镜 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        className="absolute top-1.5 left-1.5 w-6 h-6 rounded-md bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-zoom-in z-20 shadow-xs"
        title="查看大图"
      >
        <ZoomIn className="w-3 h-3" />
      </button>

      {/* 右上角选中角标 / 悬停选择圆钮 */}
      <div className="absolute top-1.5 right-1.5 z-20 pointer-events-none">
        {isChecked ? (
          <div
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold shadow-md flex items-center gap-1 backdrop-blur-md ${
              isPrimary
                ? 'bg-amber-500 text-white'
                : 'bg-indigo-600 text-white'
            }`}
          >
            {isPrimary ? (
              <>
                <Star className="w-2.5 h-2.5 fill-current" />
                <span>#1 主</span>
              </>
            ) : (
              <>
                <Check className="w-2.5 h-2.5 stroke-[3]" />
                <span>{selectedOrder >= 0 ? `#${selectedOrder + 1}` : '已选'}</span>
              </>
            )}
          </div>
        ) : (
          <div className="w-6 h-6 rounded-md bg-black/30 group-hover:bg-indigo-600 text-white flex items-center justify-center backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-xs">
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
        )}
      </div>

      {/* 底部信息指示条 */}
      <div className="absolute bottom-1 inset-x-1 flex items-center justify-between pointer-events-none z-20">
        <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium backdrop-blur-md ${
          imgObj.type === 'main'
            ? 'bg-indigo-900/60 text-indigo-100 dark:bg-indigo-950/70 dark:text-indigo-200'
            : imgObj.type === 'sku'
              ? 'bg-emerald-900/60 text-emerald-100 dark:bg-emerald-950/70 dark:text-emerald-200'
              : 'bg-black/40 text-white/90 dark:bg-black/60 dark:text-white/80'
        }`}>
          {typeLabel}
        </span>

        {isHeroActive && (
          <span className="px-1.5 py-0.2 rounded bg-sky-500 text-white text-[8px] font-bold shadow-2xs">
            检视中
          </span>
        )}
      </div>
    </div>
  );
}

export default React.memo(BatchProductImageTile);
