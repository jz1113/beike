import { useState } from 'react';
import type { ImageSetQueueItem } from '../utils/assetPromptConstants';

export default function DeconstructImageSelection({ item, disabled, onChange }: {
  item: ImageSetQueueItem; disabled: boolean; onChange: (excluded: number[]) => void;
}) {
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const excluded = item.excludedImageIndices || [];
  return <div className="space-y-2">
    <div className="flex items-center justify-between text-xs">
      <span>已选 {item.images.length - excluded.length} / {item.images.length} 张 · 点击勾选框剔除</span>
      <button type="button" disabled={disabled} className="text-indigo-600 disabled:opacity-40" onClick={() => onChange(excluded.length === item.images.length ? [] : item.images.map((_, i) => i))}>{excluded.length === item.images.length ? '全选本套' : '取消整套'}</button>
    </div>
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
      {item.images.map((url, i) => <div key={i} className={`relative rounded-lg border overflow-hidden ${excluded.includes(i) ? 'opacity-40 border-slate-200' : 'border-indigo-300'}`}>
        <button type="button" onClick={() => setEnlarged(i)} className="block w-full" aria-label={`放大第 ${i + 1} 张图片`}><img src={url} alt={`第 ${i + 1} 张`} loading="lazy" className="w-full h-24 object-cover"/></button>
        <label className="absolute top-1 left-1 flex items-center gap-1 bg-white/95 rounded px-1 py-0.5 text-xs"><input type="checkbox" aria-label={`选择第 ${i + 1} 张图片`} disabled={disabled} checked={!excluded.includes(i)} onChange={() => onChange(excluded.includes(i) ? excluded.filter(n => n !== i) : [...excluded, i])}/>{i + 1}</label>
      </div>)}
    </div>
    {enlarged !== null && <div role="dialog" aria-label="图片预览" className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-8" onClick={() => setEnlarged(null)}>
      <button type="button" className="absolute right-6 top-6 text-white" onClick={() => setEnlarged(null)}>关闭预览</button>
      <img src={item.images[enlarged]} alt={`第 ${enlarged + 1} 张原图`} className="max-h-full max-w-full object-contain"/>
    </div>}
  </div>;
}
