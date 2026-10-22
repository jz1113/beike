import React from 'react';
import type { TypedProductImage } from '../model/batchTypes';

interface Props {
  images: TypedProductImage[];
  activeFilter: 'all' | 'main' | 'sku' | 'detail';
  onFilterChange: (f: 'all' | 'main' | 'sku' | 'detail') => void;
  /** 默认显示的提示文字 */
  hint?: string;
  className?: string;
}

export default function ImageTypeFilterTabs({
  images = [],
  activeFilter,
  onFilterChange,
  hint,
  className = '',
}: Props) {
  const safeImages = images || [];
  const mainCount = safeImages.filter(t => t.type === 'main').length;
  const skuCount = safeImages.filter(t => t.type === 'sku').length;
  const detailCount = safeImages.filter(t => t.type === 'detail').length;

  const tabs: { key: 'all' | 'main' | 'sku' | 'detail'; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: safeImages.length },
    ...(mainCount > 0 ? [{ key: 'main' as const, label: '主图', count: mainCount }] : []),
    ...(skuCount > 0 ? [{ key: 'sku' as const, label: 'SKU', count: skuCount }] : []),
    ...(detailCount > 0 ? [{ key: 'detail' as const, label: '商详', count: detailCount }] : []),
  ];

  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      {/* 现代分段胶囊控制栏 */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 shrink-0">
        {tabs.map(tab => {
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onFilterChange(tab.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? 'bg-white dark:bg-[#25262c] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300'
                  : 'bg-slate-200/70 text-slate-500 dark:bg-white/10 dark:text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {hint && (
        <span className="text-[11px] text-slate-400 font-normal hidden xl:inline">
          {hint}
        </span>
      )}
    </div>
  );
}
