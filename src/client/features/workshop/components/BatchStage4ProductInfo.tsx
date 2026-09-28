import { useState } from 'react';
import { Check, Copy, ExternalLink, ZoomIn } from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import type { BatchProductItem } from '../model/batchTypes';

export function BatchStage4ProductInfo({
  item,
  jdUrl,
  cleanId,
  copiedId,
  onCopy,
  onPreview,
}: {
  item: BatchProductItem;
  jdUrl: string;
  cleanId: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onPreview: (url: string) => void;
}) {
  const images = [...new Set((item.selectedProductImages || []).filter(Boolean))];
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const coverUrl = activeUrl && images.includes(activeUrl) ? activeUrl : images[0];
  const activeIndex = images.indexOf(coverUrl);
  return (
    <div className="space-y-4 bg-transparent rounded-xl border border-slate-200/60 p-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">
          <span>商品信息</span>
        </span>
        <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
          {item.platform?.toUpperCase() || '商品'}
        </span>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500 block">商品名称</label>
        <div title={item.title} className="line-clamp-3 text-[13px] font-medium text-slate-800 leading-6 [overflow-wrap:anywhere]">{item.title}</div>
      </div>
      <div className="space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <label className="text-xs font-medium text-slate-500">商品链接</label>
          {cleanId && <span title={cleanId} className="min-w-0 truncate text-[11px] text-slate-500 tabular-nums">ID: {cleanId}</span>}
        </div>
        <div className="flex items-center gap-2">
          <a href={jdUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 py-2 px-2 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center justify-center gap-1.5" title="在新标签页中直接打开京东商品页">
            <span className="truncate">打开京东商品页</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
          <button type="button" onClick={() => onCopy(`jd_${item.id}`, jdUrl)} className="py-2 px-2 rounded-lg text-xs font-medium border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1 shrink-0">
            {copiedId === `jd_${item.id}` ? <><Check className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700">已复制</span></> : <><Copy className="w-3.5 h-3.5" /><span>复制</span></>}
          </button>
        </div>
      </div>
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-600">已选商品图</span>
          <span className="text-slate-400">{images.length > 0 ? `${activeIndex + 1} / ${images.length}` : '未选图'}</span>
        </div>
        <div className="relative aspect-[4/3] rounded-lg bg-slate-50 border border-slate-100 overflow-hidden">
          {coverUrl ? (
            <>
              <LazyProxyImage src={coverUrl} alt={`已选商品图 ${activeIndex + 1}`} className="w-full h-full !object-contain" thumb width={600} />
              <button type="button" onClick={() => onPreview(coverUrl)} className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center" title="放大查看原图">
                <ZoomIn className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="text-center p-4 text-slate-400 text-xs flex items-center justify-center h-full">尚未选择商品图，请返回选图步骤选择</div>
          )}
        </div>
        {images.length > 1 && <div className="flex gap-2 overflow-x-auto py-1" role="group" aria-label="已选商品图">
          {images.map((url, index) => <button type="button" key={url} onClick={() => setActiveUrl(url)} aria-label={`查看已选商品图 ${index + 1}${index === 0 ? '，生图主参考' : ''}`} aria-pressed={url === coverUrl}
            className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 ${url === coverUrl ? 'border-indigo-500' : 'border-transparent hover:border-slate-300'}`}>
            <LazyProxyImage src={url} alt="" width={100} className="!object-contain" />
            {index === 0 && <span className="absolute bottom-0 inset-x-0 bg-slate-900/70 text-[9px] text-white">主参考</span>}
          </button>)}
        </div>}
        {images.length > 0 && <p className="text-[11px] leading-5 text-slate-500">来自选图步骤 · 第 1 张用于生图主参考</p>}
      </div>
    </div>
  );
}
