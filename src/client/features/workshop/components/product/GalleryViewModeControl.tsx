import React from 'react';
import { Kanban, LayoutGrid, Waves } from 'lucide-react';
import type { GalleryViewMode, GridDensity } from './BatchProductImageGrid';

interface Props {
  viewMode: GalleryViewMode;
  gridDensity: GridDensity;
  onViewModeChange: (mode: GalleryViewMode) => void;
  onGridDensityChange: (density: GridDensity) => void;
}

export const GalleryViewModeControl: React.FC<Props> = ({
  viewMode,
  gridDensity,
  onViewModeChange,
  onGridDensityChange,
}) => {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* 视图模式分段控制 */}
      <div className="flex items-center p-0.5 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200/60 dark:border-white/10">
        <button
          type="button"
          onClick={() => onViewModeChange('masonry')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
            viewMode === 'masonry'
              ? 'bg-white dark:bg-[#25262c] text-indigo-600 dark:text-indigo-400 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
          title="自适应瀑布流：原图自然比例展示，消除黑边，一览无余"
        >
          <Waves className="w-3.5 h-3.5" />
          <span>瀑布流</span>
        </button>

        <button
          type="button"
          onClick={() => onViewModeChange('sectioned')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
            viewMode === 'sectioned'
              ? 'bg-white dark:bg-[#25262c] text-indigo-600 dark:text-indigo-400 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
          title="主详分区展台：核心主图置顶大展台 + 商详卖点条幅自适应流"
        >
          <Kanban className="w-3.5 h-3.5" />
          <span>主详分区</span>
        </button>

        <button
          type="button"
          onClick={() => onViewModeChange('grid')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
            viewMode === 'grid'
              ? 'bg-white dark:bg-[#25262c] text-indigo-600 dark:text-indigo-400 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
          title="齐整平铺网格：等比对称排布"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>统一网格</span>
        </button>
      </div>

      {/* 网格密度选择（仅在网格模式显现） */}
      {viewMode === 'grid' && (
        <div className="flex items-center p-0.5 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-[11px]">
          <button
            type="button"
            onClick={() => onGridDensityChange('large')}
            className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
              gridDensity === 'large'
                ? 'bg-white dark:bg-[#25262c] text-indigo-600 dark:text-indigo-300 shadow-2xs'
                : 'text-slate-400 hover:text-slate-700'
            }`}
            title="大图"
          >
            大
          </button>
          <button
            type="button"
            onClick={() => onGridDensityChange('standard')}
            className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
              gridDensity === 'standard'
                ? 'bg-white dark:bg-[#25262c] text-indigo-600 dark:text-indigo-300 shadow-2xs'
                : 'text-slate-400 hover:text-slate-700'
            }`}
            title="标准"
          >
            中
          </button>
          <button
            type="button"
            onClick={() => onGridDensityChange('compact')}
            className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
              gridDensity === 'compact'
                ? 'bg-white dark:bg-[#25262c] text-indigo-600 dark:text-indigo-300 shadow-2xs'
                : 'text-slate-400 hover:text-slate-700'
            }`}
            title="紧凑"
          >
            小
          </button>
        </div>
      )}
    </div>
  );
};

export default GalleryViewModeControl;
