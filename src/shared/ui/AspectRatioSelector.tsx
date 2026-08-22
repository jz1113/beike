import React from 'react';
import { ASPECT_RATIOS, AspectRatioOption } from '@/lib/drawing';
import { LayoutGrid, Plus } from 'lucide-react';

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function AspectRatioSelector({ selectedId, onSelect }: Props) {
  // 渲染比例微缩图形
  const renderAspectFrame = (type: AspectRatioOption['iconType']) => {
    switch (type) {
      case 'auto':
        return <LayoutGrid className="w-3.5 h-3.5" />;
      case 'square':
        return <div className="w-3.5 h-3.5 border-2 border-current rounded-[3px]" />;
      case 'wide':
        return <div className="w-4.5 h-2.5 border-2 border-current rounded-[2px]" />;
      case 'tall':
        return <div className="w-2.5 h-4.5 border-2 border-current rounded-[2px]" />;
      case 'standard':
        return <div className="w-4 h-3 border-2 border-current rounded-[2px]" />;
      case 'portrait':
        return <div className="w-3 h-4 border-2 border-current rounded-[2px]" />;
      case 'custom':
        return (
          <div className="w-3.5 h-3.5 border-2 border-dashed border-current rounded-[3px] flex items-center justify-center">
            <Plus className="w-2 h-2" />
          </div>
        );
      default:
        return <div className="w-3 h-3.5 border-2 border-current rounded-[2px]" />;
    }
  };

  return (
    <div className="grid grid-cols-6 gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200">
      {ASPECT_RATIOS.map(item => {
        const isSelected = selectedId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer ${
              isSelected
                ? 'bg-white border border-slate-200 text-indigo-600 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <div className="h-5 flex items-center justify-center">
              {renderAspectFrame(item.iconType)}
            </div>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">
              {item.label || item.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
