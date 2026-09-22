import React from 'react';
import { Check, Plus, ZoomIn } from 'lucide-react';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import type { TypedProductImage } from '../model/batchTypes';

export type ImageTileVariant = 'focus' | 'compact';

interface Props {
  itemId: string;
  imgObj: TypedProductImage;
  imgIdx: number;
  isChecked: boolean;
  variant: ImageTileVariant;
  onToggle: () => void;
  onPreview: () => void;
}

function BatchProductImageTile({ imgObj, imgIdx, isChecked, variant, onToggle, onPreview }: Props) {
  const isFocus = variant === 'focus';

  const typeLabel = imgObj.type === 'main'
    ? (isFocus ? `主图 ${imgIdx + 1}` : '主')
    : imgObj.type === 'sku'
      ? (isFocus ? 'SKU图' : 'SKU')
      : (isFocus ? '详情图' : '详');

  return (
    <div
      className={
        isFocus
          ? `aspect-square rounded-2xl border overflow-hidden relative cursor-pointer group transition-all duration-200 bg-slate-50 shadow-2xs ${
              isChecked
                ? 'border-indigo-600 ring-2 ring-indigo-500/40 bg-indigo-50/15 shadow-md scale-[1.01]'
                : 'border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
            }`
          : `aspect-square rounded-xl border cursor-pointer overflow-hidden relative transition-all group ${
              isChecked
                ? 'border-indigo-600 ring-2 ring-indigo-600/30 shadow-xs'
                : 'border-slate-200 opacity-85 hover:opacity-100 hover:border-slate-300'
            }`
      }
      title={isFocus ? undefined : '点击直接选定此图'}
    >
      <LazyProxyImage
        src={imgObj.url}
        thumb={true}
        width={420}
        className={isFocus ? '!object-contain' : ''}
        alt={`${typeLabel}，素材 ${imgIdx + 1}`}
      />

      <button
        type="button"
        aria-label={`${isChecked ? '取消选择' : '选择'}素材 ${imgIdx + 1}`}
        aria-pressed={isChecked}
        onClick={onToggle}
        className="absolute inset-0 z-10 rounded-[inherit] cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-[-3px]"
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        className={
          isFocus
            ? 'absolute top-2.5 left-2.5 w-7 h-7 rounded-full bg-black/60 hover:bg-indigo-600 text-white flex items-center justify-center transition-all cursor-zoom-in z-20 shadow-sm'
            : 'absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 hover:bg-indigo-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-zoom-in z-10'
        }
        title="放大全屏查看"
      >
        <ZoomIn className={isFocus ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
      </button>

      {isFocus ? (
        <>
          <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none">
            {isChecked ? (
              <div className="px-2.5 py-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold shadow-md flex items-center gap-1">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>已选定</span>
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-black/40 group-hover:bg-indigo-600 text-white flex items-center justify-center transition-all shadow-md">
                <Plus className="w-4 h-4" />
              </div>
            )}
          </div>
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] text-white font-mono font-bold">
              {typeLabel}
            </span>
            <span className="text-[9px] text-white/80 font-medium bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity">
              {isChecked ? '点击取消' : '点击选择'}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
            isChecked ? 'bg-indigo-600 text-white font-bold' : 'bg-black/30 text-white/70'
          }`}>
            {isChecked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </div>
          <span className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded bg-black/50 text-[8px] text-white font-mono uppercase">
            {typeLabel}
          </span>
        </>
      )}
    </div>
  );
}

export default React.memo(BatchProductImageTile);
