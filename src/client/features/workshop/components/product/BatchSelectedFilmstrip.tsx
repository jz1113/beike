import React from 'react';
import {
  Layers,
  RotateCcw,
  Star,
  X,
} from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';

export interface SelectedImageItem {
  url: string;
  type: 'main' | 'sku' | 'detail';
  order: number;
  isPrimary: boolean;
}

interface Props {
  selectedTypedImages: SelectedImageItem[];
  selectedCount: number;
  onPreviewByUrl: (url: string) => void;
  onToggleSelect: (url: string) => void;
  onSetPrimary: (url: string) => void;
  onSelectAllMain: () => void;
  onClear: () => void;
}

export const BatchSelectedFilmstrip: React.FC<Props> = ({
  selectedTypedImages,
  selectedCount,
  onPreviewByUrl,
  onToggleSelect,
  onSetPrimary,
  onClear,
}) => {
  // 零已选状态：完全不占空间，彻底避免横幅干扰
  if (selectedCount === 0) {
    return null;
  }

  // 已选胶卷状态：清晰呈现主基准与辅助参考序列
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-2 sm:px-3 sm:py-2.5 shrink-0 dark:border-white/10 dark:bg-[#16171b]/90 backdrop-blur-md transition-all">
      <div className="flex items-center justify-between text-[11px] mb-2 px-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5 shrink-0">
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            <span>已选生成参考</span>
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 font-mono font-bold text-[10px] dark:bg-indigo-500/20 dark:text-indigo-300">
              {selectedCount}
            </span>
          </span>
          <span className="text-slate-400 text-[10px] truncate hidden md:inline">
            （#1 为生图主基准 · 悬停可设为主基准或移除）
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClear}
            className="text-slate-400 hover:text-rose-500 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
            title="清空当前商品的选图"
          >
            <RotateCcw className="w-3 h-3" />
            <span>清空</span>
          </button>
        </div>
      </div>

      {/* 水平胶卷栏 */}
      <div className="flex items-center gap-2.5 overflow-x-auto py-0.5 px-0.5 no-scrollbar">
        {selectedTypedImages.map((item) => (
          <div
            key={item.url}
            className={`relative shrink-0 w-13 h-13 sm:w-14 sm:h-14 rounded-xl overflow-hidden border cursor-pointer transition-all duration-200 group ${
              item.isPrimary
                ? 'border-amber-500 ring-2 ring-amber-500/70 shadow-sm'
                : 'border-slate-200 hover:border-indigo-400 dark:border-white/10 dark:hover:border-indigo-500/40'
            } bg-white dark:bg-[#1f2025]`}
            onClick={() => onPreviewByUrl(item.url)}
            title={item.isPrimary ? '首选主基准（点击查看大图）' : `辅助参考 #${item.order}（点击查看大图）`}
          >
            <LazyProxyImage
              src={item.url}
              alt={`已选参考 ${item.order}`}
              className="w-full h-full object-contain p-1"
              thumb={true}
              width={120}
            />

            {/* 序号徽标 */}
            <span
              className={`absolute top-0.5 left-0.5 px-1.5 rounded-md text-[9px] font-black leading-tight shadow-xs ${
                item.isPrimary
                  ? 'bg-amber-500 text-white flex items-center gap-0.5'
                  : 'bg-indigo-600 text-white'
              }`}
            >
              {item.isPrimary && <Star className="w-2 h-2 fill-current inline" />}
              {item.isPrimary ? '主基准' : `#${item.order}`}
            </span>

            {/* 悬停快捷操作：设为主基准 + 移除 */}
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {!item.isPrimary && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetPrimary(item.url);
                  }}
                  className="w-6 h-6 rounded-md bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                  title="设为首选主基准"
                >
                  <Star className="w-3.5 h-3.5 fill-current" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(item.url);
                }}
                className="w-6 h-6 rounded-md bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                title="从参考中移除"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BatchSelectedFilmstrip;
