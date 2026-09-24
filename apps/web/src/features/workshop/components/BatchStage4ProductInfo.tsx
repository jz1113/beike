import { Check, Copy, ExternalLink, ZoomIn } from 'lucide-react';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import type { BatchProductItem } from '../model/batchTypes';

export function BatchStage4ProductInfo({
  item,
  coverUrl,
  jdUrl,
  cleanId,
  copiedId,
  onCopy,
  onPreview,
}: {
  item: BatchProductItem;
  coverUrl?: string;
  jdUrl: string;
  cleanId: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onPreview: (url: string) => void;
}) {
  return (
    <div className="space-y-4 bg-white rounded-2xl border border-slate-200/80 p-5 min-w-0">
      <div className="flex items-center justify-between pb-1 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <span className="w-1.5 h-3 bg-red-600 rounded-full" />
          <span>商品信息</span>
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-200/60 font-mono">
          {item.platform?.toUpperCase() || '商品'}
        </span>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-slate-400 block">商品名称</label>
        <div className="text-xs font-bold text-slate-900 leading-snug break-words">{item.title}</div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-400">商品链接</label>
          {cleanId && <span className="text-[10px] text-slate-400 font-mono">ID: {cleanId}</span>}
        </div>
        <div className="flex items-center gap-2">
          <a href={jdUrl} target="_blank" rel="noreferrer" className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center justify-center gap-1.5" title="在新标签页中直接打开京东商品页">
            <span className="truncate">打开京东商品页</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
          <button type="button" onClick={() => onCopy(`jd_${item.id}`, jdUrl)} className="py-2 px-3 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1 shrink-0">
            {copiedId === `jd_${item.id}` ? <><Check className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700">已复制</span></> : <><Copy className="w-3.5 h-3.5" /><span>复制</span></>}
          </button>
        </div>
      </div>
      <div className="space-y-1.5 pt-1">
        <label className="text-[11px] font-bold text-slate-400 block">商品原图</label>
        <div className="relative aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden shadow-sm">
          {coverUrl ? (
            <>
              <LazyProxyImage src={coverUrl} alt="商品原图" className="w-full h-full !object-contain" thumb width={600} />
              <button type="button" onClick={() => onPreview(coverUrl)} className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center" title="放大查看原图">
                <ZoomIn className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="text-center p-4 text-slate-400 text-xs flex items-center justify-center h-full">暂无商品原图</div>
          )}
        </div>
      </div>
    </div>
  );
}
