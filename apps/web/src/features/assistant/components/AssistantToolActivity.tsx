import { activityTarget } from './AssistantLiveStatus';
import { useState } from 'react';
import { Loader2, Wrench, X } from 'lucide-react';
import type { AssistantMessage } from '@/store';

type ToolActivityItem = NonNullable<AssistantMessage['toolActivity']>[number] & { args?: string };

export default function AssistantToolActivity({ items }: { items: ToolActivityItem[] }) {
  const [preview, setPreview] = useState<{ url: string; label?: string } | null>(null);
  return (
    <div className="w-full space-y-1 my-2 text-xs text-zinc-500">
      {items.map((item, index) => (
        <details key={`${item.name}-${index}`} open={item.status === 'error' ? true : undefined} className="py-1.5">
          <summary className="flex items-center gap-2 cursor-pointer list-none hover:text-zinc-800">
            {item.status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Wrench className="w-3.5 h-3.5 shrink-0" />}
            <span className="shrink-0">{item.displayName || item.name}</span>
            {activityTarget(item.args) && <span className="truncate text-zinc-400">{activityTarget(item.args)}</span>}
            <span className={item.status === 'error' ? 'text-rose-600' : 'text-zinc-400'}>{item.status === 'running' ? '执行中' : item.status === 'error' ? '失败' : '已完成'}</span>
          </summary>
          <div className="mt-2 ml-1.5 pl-4 border-l border-zinc-200 space-y-2">
            {item.detail && <p className="leading-6 whitespace-pre-wrap">{item.detail}</p>}
            {item.args && <pre className="p-3 bg-zinc-100 rounded-lg text-[11px] whitespace-pre-wrap break-words max-h-64 overflow-auto">{item.args}</pre>}
            {!!item.visualImages?.length && <div className="flex flex-wrap gap-2">
              {item.visualImages.map((image, i) => <button key={`${image.url}-${i}`} type="button" onClick={() => setPreview(image)} title={image.label || '预览画面'} className="w-14 h-14 rounded-lg overflow-hidden border border-zinc-200 cursor-pointer"><img src={image.url} alt={image.label || '工具提取画面'} className="w-full h-full object-cover" loading="lazy" /></button>)}
            </div>}
          </div>
        </details>
      ))}
      {preview && <div role="dialog" aria-modal="true" aria-label="工具画面预览" className="fixed inset-0 z-[80] bg-black/80 p-6 flex items-center justify-center" onClick={() => setPreview(null)}>
        <img src={preview.url} alt={preview.label || '工具提取画面'} className="max-w-full max-h-[85vh] object-contain rounded-xl" onClick={(event) => event.stopPropagation()} />
        <button type="button" aria-label="关闭预览" onClick={() => setPreview(null)} className="absolute top-5 right-5 p-2 rounded-full bg-white/15 text-white cursor-pointer"><X className="w-5 h-5" /></button>
      </div>}
    </div>
  );
}
