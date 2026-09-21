import { AlertCircle, CheckCircle2, Download, Image as ImageIcon, Loader2, Sparkles, Trash2 } from 'lucide-react';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import { normalizeCoverTitle, stageLabel, type PosterItem } from '../model/posterTypes';

interface Props {
  items: PosterItem[];
  isRunning: boolean;
  onClear: () => void;
  onPreview: (item: PosterItem) => void;
  onUpdate: (id: string, patch: Partial<PosterItem>) => void;
  onDownload: (item: PosterItem, index: number) => void;
  onRun: (item: PosterItem, index: number) => void;
  onStartBatch: () => void;
}

export function PosterItemList({ items, isRunning, onClear, onPreview, onUpdate, onDownload, onRun, onStartBatch }: Props) {
  return (
    <section className="rounded-3xl bg-white border border-slate-200 overflow-hidden shadow-[0_14px_45px_-24px_rgba(15,23,42,0.16)]">
      <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div><h2 className="font-bold text-sm">生产清单</h2><p className="text-xs text-slate-400 mt-1">成功成品会按原标题命名，封面标题仅用于封面排版</p></div>
        {items.length > 0 && <div className="flex items-center gap-2">
          <button type="button" onClick={onStartBatch} disabled={isRunning} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"><Sparkles className="h-3.5 w-3.5" />开始批量生成（{items.filter((item) => item.status === 'idle' || item.status === 'interrupted').length} 条）</button>
          <button type="button" onClick={onClear} disabled={isRunning} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-rose-600 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" />清空</button>
        </div>}
      </div>
      {items.length === 0 ? (
        <div className="py-16 text-center text-slate-400"><ImageIcon className="w-8 h-8 mx-auto mb-3 text-slate-300" /><p className="text-sm font-medium">先导入图片链接、标题和文字方向</p><p className="text-xs mt-1">第三列：文字竖为 720 × 960，文字横为 1440 × 1440；第四列商品名称/型号可选</p></div>
      ) : (
        <div className="divide-y divide-slate-100">{items.map((item, index) => (
          <article key={item.id} className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-[88px_minmax(0,1fr)_180px] gap-4 items-start">
            <button type="button" onClick={() => onPreview(item)} className="group relative h-[116px] w-[88px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left shadow-sm transition-all hover:border-slate-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400" aria-label={`查看「${item.originalTitle || '商品素材'}」大图`} title="查看大图">{item.resultUrl || item.sourceImageUrl ? <LazyProxyImage src={item.resultUrl || item.sourceImageUrl} alt={item.originalTitle} width={176} className="w-full h-full object-cover" /> : null}<span className="absolute inset-x-1.5 bottom-1.5 flex translate-y-8 items-center justify-center rounded-lg bg-slate-950/82 px-1.5 py-1 text-[10px] font-bold text-white opacity-0 backdrop-blur transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">查看大图</span></button>
            <div className="min-w-0 space-y-2.5">
              <div className="flex items-center gap-2"><span className="text-[11px] font-bold text-slate-400">{String(index + 1).padStart(2, '0')}</span><span className={`inline-flex items-center gap-1.5 text-xs font-bold ${item.status === 'failed' ? 'text-rose-600' : item.status === 'complete' ? 'text-emerald-600' : 'text-slate-600'}`}>{item.status === 'complete' ? <CheckCircle2 className="w-3.5 h-3.5" /> : item.status === 'failed' ? <AlertCircle className="w-3.5 h-3.5" /> : item.status !== 'idle' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{stageLabel(item.status)}</span></div>
              <p className="text-sm font-bold text-slate-800 break-words">{item.originalTitle || '未填写原标题'}</p>
              <input value={item.coverTitle} disabled={item.status !== 'idle' && item.status !== 'interrupted' && item.status !== 'failed'} onChange={(event) => onUpdate(item.id, { coverTitle: normalizeCoverTitle(event.target.value), isTitleEdited: true })} aria-label="封面标题" className="w-full max-w-md rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-300 disabled:bg-transparent disabled:border-transparent disabled:px-0" />
              {item.modelFallbackNote && <p className="text-xs font-medium text-amber-700">{item.modelFallbackNote}</p>}
              {item.designPlan && <details className="text-xs text-slate-400"><summary className="cursor-pointer font-semibold text-rose-500 hover:text-rose-600">查看本张设计方案</summary><div className="mt-2 grid max-w-2xl gap-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-slate-600 sm:grid-cols-2"><p><b className="text-slate-700">构图：</b>{item.designPlan.composition}</p><p><b className="text-slate-700">字效：</b>{item.designPlan.typography}</p><p><b className="text-slate-700">材质：</b>{item.designPlan.material}</p><p><b className="text-slate-700">色彩：</b>{item.designPlan.palette}</p><p className="sm:col-span-2"><b className="text-slate-700">视觉证据：</b>{item.designPlan.visualAnchor}</p></div></details>}
              {item.prompt && <details className="text-xs text-slate-400"><summary className="cursor-pointer hover:text-slate-600">查看实际生图提示词</summary><p className="mt-2 leading-relaxed rounded-lg bg-slate-50 p-2.5 text-slate-500">{item.prompt}</p></details>}
              {item.error && <p className="text-xs text-rose-600 leading-relaxed">{item.error}</p>}
            </div>
            <div className="flex lg:flex-col gap-2 lg:items-stretch">{item.resultUrl ? <button type="button" onClick={() => onDownload(item, index)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-black"><Download className="w-3.5 h-3.5" />下载成品</button> : <button type="button" onClick={() => onRun(item, index)} disabled={isRunning || item.status !== 'idle' && item.status !== 'interrupted' && item.status !== 'failed'} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Sparkles className="w-3.5 h-3.5" />{item.status === 'failed' ? '重新生成' : item.status === 'interrupted' ? '继续生成' : '单独生成'}</button>}</div>
          </article>
        ))}</div>
      )}
    </section>
  );
}
