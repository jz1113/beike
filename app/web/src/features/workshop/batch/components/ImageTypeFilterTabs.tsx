import React from 'react';
import type { TypedProductImage } from '../batchTypes';

interface Props {
  images: TypedProductImage[];
  activeFilter: 'all' | 'main' | 'sku' | 'detail';
  onFilterChange: (f: 'all' | 'main' | 'sku' | 'detail') => void;
  /** 默认显示的提示文字，默认"点击直接选定垫图" */
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

  const tabs: { key: 'all' | 'main' | 'sku' | 'detail'; label: string }[] = [
    { key: 'all', label: `全部素材 (${safeImages.length})` },
    ...(mainCount > 0 ? [{ key: 'main' as const, label: `主图 (${mainCount})` }] : []),
    ...(skuCount > 0 ? [{ key: 'sku' as const, label: `SKU图 (${skuCount})` }] : []),
    ...(detailCount > 0 ? [{ key: 'detail' as const, label: `详情图 (${detailCount})` }] : []),
  ];

  return (
    <div className={`flex items-center justify-between border-b border-slate-100 pb-2 ${className}`}>
      <div className="flex items-center gap-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onFilterChange(tab.key)}
            className={`pb-1 text-xs font-bold transition-all cursor-pointer border-b-2 -mb-px ${
              activeFilter === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {hint && (
        <span className="text-[11px] text-slate-400 font-normal hidden sm:inline">
          {hint}
        </span>
      )}
    </div>
  );
}
