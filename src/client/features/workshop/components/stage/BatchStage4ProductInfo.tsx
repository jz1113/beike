import { contentPlanLabel } from '../../model/analysis/workshopContentPlan';
import { useState } from 'react';
import { Check, Copy, ExternalLink, ZoomIn } from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import { BatchProductItem } from '../../model/batchTypes';

export interface BatchStage4ProductInfoProps {
  item: BatchProductItem;
  productUrl: string | null;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onPreview: (url: string) => void;
}

export function BatchStage4ProductInfo({
  item,
  productUrl,
  copiedId,
  onCopy,
  onPreview,
}: BatchStage4ProductInfoProps) {
  const images = [...new Set((item.selectedProductImages || []).filter(Boolean))];
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const coverUrl = activeUrl && images.includes(activeUrl) ? activeUrl : images[0] || '';
  const activeIndex = Math.max(0, images.indexOf(coverUrl));
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur-xl min-w-0 dark:border-white/10 dark:bg-[#18191c]/95">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          <span>商品信息</span>
        </span>
        <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 dark:text-slate-400 dark:bg-white/10">
          {item.platform === 'local' ? '本地商品' : item.platform?.toUpperCase() || '商品'}
        </span>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500 block dark:text-slate-400">商品名称</label>
        <div title={item.title} className="line-clamp-3 text-[13px] font-medium text-slate-800 leading-6 [overflow-wrap:anywhere] dark:text-slate-100">{item.title}</div>
        {item.contentPlan && <p className="mt-1 text-xs text-indigo-500">{contentPlanLabel(item)}</p>}
      </div>
      <div className="space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{item.platform === 'local' ? '商品类目' : '商品链接'}</label>
          {item.platform !== 'local' && <span title={item.itemId} className="min-w-0 truncate text-[11px] text-slate-500 tabular-nums dark:text-slate-400">ID: {item.itemId}</span>}
        </div>
        {productUrl ? <div className="flex items-center gap-2">
          <a href={productUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 py-2 px-2 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center justify-center gap-1.5 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 dark:text-indigo-300" title="在新标签页中打开原商品页">
            <span className="truncate">打开原商品页</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
          <button type="button" onClick={() => onCopy(`jd_${item.id}`, productUrl)} className="py-2 px-2 rounded-lg text-xs font-medium border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1 shrink-0 dark:text-slate-200 dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/10">
            {copiedId === `jd_${item.id}` ? <><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /><span className="text-emerald-700 dark:text-emerald-300">已复制</span></> : <><Copy className="w-3.5 h-3.5" /><span>复制</span></>}
          </button>
        </div> : <p className="text-xs text-slate-600 dark:text-slate-300">{item.platform === 'local' ? item.category : '原商品链接未记录'}</p>}
      </div>
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-600 dark:text-slate-300">已选商品图</span>
          <span className="text-slate-400">{images.length > 0 ? `${activeIndex + 1} / ${images.length}` : '未选图'}</span>
        </div>
        <div className="relative aspect-[4/3] rounded-xl bg-slate-50 border border-slate-100 overflow-hidden dark:bg-[#131417] dark:border-white/10">
          {coverUrl ? (
            <>
              <LazyProxyImage src={coverUrl} alt={`已选商品图 ${activeIndex + 1}`} className="w-full h-full !object-contain" thumb width={600} />
              <button type="button" onClick={() => onPreview(coverUrl)} className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition-colors" title="放大查看原图">
                <ZoomIn className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="text-center p-4 text-slate-400 text-xs flex items-center justify-center h-full">尚未选择商品图，请返回选图步骤选择</div>
          )}
        </div>
        {images.length > 1 && <div className="flex gap-2 overflow-x-auto py-1" role="group" aria-label="已选商品图">
          {images.map((url, index) => <button type="button" key={url} onClick={() => setActiveUrl(url)} aria-label={`查看已选商品图 ${index + 1}${index === 0 ? '，生图主参考' : ''}`} aria-pressed={url === coverUrl}
            className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-50 dark:bg-[#131417] ${url === coverUrl ? 'border-indigo-500' : 'border-transparent hover:border-slate-300 dark:hover:border-white/20'}`}>
            <LazyProxyImage src={url} alt="" width={100} className="!object-contain" />
            {index === 0 && <span className="absolute bottom-0 inset-x-0 bg-slate-900/75 text-[9px] text-white">主参考</span>}
          </button>)}
        </div>}
        {images.length > 0 && <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">来自选图步骤 · 第 1 张用于生图主参考</p>}
      </div>
    </div>
  );
}
