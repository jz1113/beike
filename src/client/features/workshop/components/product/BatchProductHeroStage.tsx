import React, { useMemo } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Plus,
  Star,
  X,
  Layers,
} from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import type { TypedProductImage } from '../../model/batchTypes';

interface Props {
  currentImage?: TypedProductImage;
  currentIndex: number;
  totalImages: number;
  selectedImages: string[];
  allTypedImages: TypedProductImage[];
  onToggleSelect: (url: string) => void;
  onPreview: (index: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onSelectByUrl: (url: string) => void;
}

export const BatchProductHeroStage: React.FC<Props> = ({
  currentImage,
  currentIndex,
  totalImages,
  selectedImages,
  allTypedImages,
  onToggleSelect,
  onPreview,
  onNext,
  onPrev,
  onSelectByUrl,
}) => {
  const currentUrl = currentImage?.url;

  // 计算当前图片在已选序列中的次序 (0-indexed)
  const selectedOrder = useMemo(() => {
    if (!currentUrl) return -1;
    return selectedImages.indexOf(currentUrl);
  }, [currentUrl, selectedImages]);

  const isSelected = selectedOrder !== -1;
  const isPrimary = selectedOrder === 0;

  // 映射类型标签
  const typeBadge = useMemo(() => {
    if (!currentImage) return null;
    if (currentImage.type === 'main') {
      return {
        text: '主图',
        color: 'bg-indigo-500/15 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30',
      };
    }
    if (currentImage.type === 'sku') {
      return {
        text: 'SKU规格图',
        color: 'bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
      };
    }
    return {
      text: '商详图',
      color: 'bg-amber-500/15 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
    };
  }, [currentImage]);

  // 构建已选图片对象列表（带类型）
  const selectedTypedImages = useMemo(() => {
    const urlMap = new Map(allTypedImages.map(img => [img.url, img]));
    return selectedImages.map((url, idx) => ({
      url,
      type: urlMap.get(url)?.type ?? 'detail',
      order: idx + 1,
      isPrimary: idx === 0,
    }));
  }, [selectedImages, allTypedImages]);

  if (!currentImage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-slate-400 dark:border-white/10 dark:bg-white/5">
        <Layers className="w-10 h-10 mb-2 stroke-1 opacity-60" />
        <p className="text-xs">暂无素材可预览</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full space-y-2">
      {/* 1. 顶部独立元信息栏：与大图画布解耦，信息清晰呼吸 */}
      <div className="flex items-center justify-between px-1 shrink-0">
        <div className="flex items-center gap-2">
          {typeBadge && (
            <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${typeBadge.color}`}>
              {typeBadge.text}
            </span>
          )}
          <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
            {currentIndex + 1} <span className="text-slate-400 font-normal">/ {totalImages}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
            ← → 键盘轮播
          </span>
          <button
            type="button"
            onClick={() => onPreview(currentIndex)}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-white/10 dark:hover:bg-white/20 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
            title="查看原图高清大图"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. 独立沉浸式影棚大画框：图片 100% 完整居中展示，绝无遮挡和截断 */}
      <div className="relative flex-1 min-h-0 w-full rounded-2xl border border-slate-200/80 bg-slate-900/5 dark:bg-[#121316] dark:border-white/10 flex items-center justify-center p-3 sm:p-4 select-none overflow-hidden group shadow-inner">
        {/* 图片居中自适应容器 */}
        <div className="w-full h-full flex items-center justify-center overflow-hidden">
          <LazyProxyImage
            src={currentImage.url}
            alt={`素材检视 ${currentIndex + 1}`}
            className="max-w-full max-h-full w-auto h-auto object-contain drop-shadow-md"
            thumb={false}
            width={960}
          />
        </div>

        {/* 两侧悬浮微切翻页按钮（鼠标移入画布边缘才出现） */}
        {totalImages > 1 && (
          <>
            <button
              type="button"
              aria-label="查看上一张素材"
              onClick={onPrev}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-800 shadow-md backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-105 cursor-pointer z-10 dark:bg-black/60 dark:hover:bg-black/90 dark:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="查看下一张素材"
              onClick={onNext}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-800 shadow-md backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-105 cursor-pointer z-10 dark:bg-black/60 dark:hover:bg-black/90 dark:text-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* 3. 底部独立决策控制台：移出画布，彻底消除覆盖商品文字的硬伤 */}
      <div className="flex items-center justify-between px-1 shrink-0 pt-0.5">
        <button
          type="button"
          onClick={() => onToggleSelect(currentImage.url)}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 shadow-xs ${
            isSelected
              ? isPrimary
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100'
          }`}
        >
          {isSelected ? (
            <>
              {isPrimary ? <Star className="w-3.5 h-3.5 fill-current" /> : <Check className="w-3.5 h-3.5 stroke-[3]" />}
              <span>{isPrimary ? '已选为 #1 首选主参考（点击取消）' : `已选为参考图 #${selectedOrder + 1}（点击取消）`}</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{selectedImages.length === 0 ? '设为生成主参考 (#1 基准)' : '选为参考图'}</span>
            </>
          )}
        </button>
      </div>

      {/* 4. 轻量化已选参考胶卷轨：告别空状态死黑框 */}
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 shrink-0 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center justify-between text-[11px] mb-1.5 px-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              已选参考序列
            </span>
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 font-mono font-bold text-[10px] dark:bg-indigo-500/20 dark:text-indigo-300">
              {selectedImages.length}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            首张为主基准 · 点击缩略图切回检视
          </span>
        </div>

        {selectedTypedImages.length === 0 ? (
          <div className="py-2 px-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
            暂未选定参考图，点击上方按钮或右侧卡片快速添加
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto py-0.5 px-0.5 no-scrollbar">
            {selectedTypedImages.map((item) => {
              const isCurrentPreview = item.url === currentUrl;
              return (
                <div
                  key={item.url}
                  className={`relative shrink-0 w-11 h-11 rounded-lg overflow-hidden border cursor-pointer transition-all duration-200 group ${
                    isCurrentPreview
                      ? 'border-indigo-600 ring-2 ring-indigo-500/50 scale-105 shadow-xs'
                      : 'border-slate-200 hover:border-slate-400 dark:border-white/10'
                  } bg-slate-900/10 dark:bg-[#121316]`}
                  onClick={() => onSelectByUrl(item.url)}
                  title={item.isPrimary ? '首张主参考' : `参考图 #${item.order}`}
                >
                  <LazyProxyImage
                    src={item.url}
                    alt={`已选参考 ${item.order}`}
                    className="w-full h-full object-contain p-0.5"
                    thumb={true}
                    width={88}
                  />

                  {/* 序数徽标 */}
                  <span
                    className={`absolute top-0.5 left-0.5 px-1 rounded text-[8px] font-black leading-tight shadow-xs ${
                      item.isPrimary
                        ? 'bg-amber-500 text-white'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {item.isPrimary ? '主' : `#${item.order}`}
                  </span>

                  {/* 悬停移除按钮 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(item.url);
                    }}
                    className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="从参考中移除"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchProductHeroStage;
