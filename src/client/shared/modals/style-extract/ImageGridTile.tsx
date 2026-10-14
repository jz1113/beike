import React, { memo } from 'react';
import { Check } from 'lucide-react';

// 🌟 高性能隔离渲染瓦片 (React.memo 杜绝多图频繁重渲染导致的卡顿)
export const ImageGridTile = memo(function ImageGridTile({
  img,
  isChosen,
  idx,
  onToggle
}: {
  img: string;
  isChosen: boolean;
  idx: number;
  onToggle: (img: string) => void;
}) {
  return (
    <div
      onClick={() => onToggle(img)}
      style={{ contain: 'layout paint' }}
      className={`relative aspect-square rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-150 group bg-slate-100/80 ${
        isChosen 
          ? 'border-indigo-600 ring-2 ring-indigo-500/25 shadow-md scale-[0.98]' 
          : 'border-slate-200/80 hover:border-indigo-400 hover:shadow-sm'
      }`}
    >
      <img 
        src={img} 
        alt="" 
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" 
      />
      <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
        isChosen 
          ? 'bg-indigo-600 text-white shadow-md' 
          : 'bg-black/40 text-transparent group-hover:bg-black/60 group-hover:text-white/60'
      }`}>
        <Check className="w-3 h-3 stroke-[3]" />
      </div>
      <span className="absolute bottom-1 left-1 px-1.5 py-0.2 rounded bg-black/60 text-white text-[9px] font-mono pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        #{idx + 1}
      </span>
    </div>
  );
});
