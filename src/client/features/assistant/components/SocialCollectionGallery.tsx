import { useEffect, useRef, useState } from 'react';
import { Images, Sparkles, X, ArrowUpRight, Check } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { ProductWidgetData } from '@client/store';

interface Props {
  product: ProductWidgetData;
  images: string[];
  onAnalyzeImages?: () => void;
  onSetAsReference?: (url: string) => void;
  onPreviewImage?: (url: string) => void;
}

export default function SocialCollectionGallery({ product, images, onAnalyzeImages, onSetAsReference, onPreviewImage }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [source, setSource] = useState('');
  const [pinned, setPinned] = useState('');
  const sources = [...new Set(product.imageSources?.map(item => item.label).filter(Boolean) || [])];
  const filtered = source ? images.filter(url => product.imageSources?.some(item => item.url === url && item.label === source)) : images;
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const current = Math.min(page, pages - 1);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const preview = (url: string) => {
    if (onPreviewImage) {
      setOpen(false);
      onPreviewImage(url);
    }
  };
  const thumbnail = (url: string, index: number) => <img src={proxyMediaUrl(url, { thumb: true, width: 480 })} alt={`素材 ${index + 1}`} className="h-full w-full object-contain" loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
  const sourceCount = product.props?.['链接数量'] || sources.length;
  return <section className="mt-4 mb-2 text-slate-700" aria-label="采集图集">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm"><Images className="h-4 w-4 text-slate-400" /><span className="font-medium">{images.length} 张图片</span>{!!sourceCount && <span className="text-xs text-slate-400">· {sourceCount} 篇笔记</span>}</div>
      {images.length > 0 && <button type="button" onClick={() => setOpen(true)} className="text-xs text-slate-500 hover:text-slate-900">查看全部 <span aria-hidden="true">↗</span></button>}
    </div>
    {images.length ? <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {images.slice(0, 6).map((url, index) => <button type="button" key={url} onClick={() => index === 5 && images.length > 6 ? setOpen(true) : onPreviewImage ? preview(url) : setOpen(true)} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-slate-100/70 transition hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-indigo-500" aria-label={index === 5 && images.length > 6 ? `查看全部 ${images.length} 张` : `预览素材 ${index + 1}`}>
        {thumbnail(url, index)}
        {index === 5 && images.length > 6 && <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-950/55 text-white backdrop-blur-[2px]"><span className="text-2xl font-medium">+{images.length - 5}</span><span className="text-xs">查看全部 {images.length} 张</span></span>}
      </button>)}
    </div> : <p className="py-6 text-sm text-slate-400">暂无可预览图片</p>}
    <div className="mt-3 flex items-center gap-2">
      {onAnalyzeImages && images.length > 0 && <button type="button" onClick={onAnalyzeImages} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100"><Sparkles className="h-3.5 w-3.5" />帮我挑图</button>}
      {onSetAsReference && images.length > 0 && <button type="button" onClick={() => setOpen(true)} className="rounded-full px-3 py-2 text-xs text-slate-500 hover:bg-slate-100">选择参考图</button>}
    </div>
    <dialog ref={dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }} className="fixed inset-0 m-auto max-h-[88vh] w-[min(960px,94vw)] rounded-2xl bg-white p-0 text-slate-700 shadow-2xl backdrop:bg-slate-950/40">
      {open && <div className="flex max-h-[88vh] flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-medium">采集图集</h2><p className="mt-1 text-xs text-slate-400">共 {images.length} 张 · 点击图片查看原图</p></div><button type="button" autoFocus onClick={() => setOpen(false)} aria-label="关闭图集" className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
        {sources.length > 1 && <div className="px-5 pt-3"><label className="text-xs text-slate-500">笔记来源 <select value={source} onChange={event => { setSource(event.target.value); setPage(0); }} className="max-w-full rounded-lg border border-slate-200 p-2"><option value="">全部笔记</option>{sources.map(label => <option key={label} value={label}>{label}</option>)}</select></label></div>}
        <div className="grid grid-cols-2 gap-4 overflow-y-auto p-5 sm:grid-cols-4">
          {filtered.slice(current * 24, (current + 1) * 24).map(url => { const index = images.indexOf(url); const label = product.imageSources?.find(item => item.url === url)?.label; return <div key={url}>
            <button type="button" onClick={() => preview(url)} disabled={!onPreviewImage} aria-label={`预览素材 ${index + 1}`} className="block aspect-[3/4] w-full overflow-hidden rounded-xl bg-slate-100">{thumbnail(url, index)}</button>
            <div className="mt-2 flex items-center justify-between gap-1"><span title={label} className="truncate text-xs text-slate-400">{label || `图片 ${index + 1}`}</span>{onSetAsReference && <button type="button" onClick={() => { onSetAsReference(url); setPinned(url); }} aria-label={`将素材 ${index + 1} 设为参考`} className="shrink-0 rounded-md px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50">{pinned === url ? <span className="flex items-center gap-1"><Check className="h-3 w-3" />已设为参考</span> : <span className="flex items-center gap-1">参考<ArrowUpRight className="h-3 w-3" /></span>}</button>}</div>
          </div>; })}
        </div>
        {pages > 1 && <footer className="flex shrink-0 items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="p-2 disabled:opacity-30">上一页</button><span>第 {current + 1} / {pages} 页 · 共 {filtered.length} 张</span><button type="button" disabled={current === pages - 1} onClick={() => setPage(current + 1)} className="p-2 disabled:opacity-30">下一页</button></footer>}
      </div>}
    </dialog>
  </section>;
}
