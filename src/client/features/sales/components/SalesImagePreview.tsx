import { useEffect, useState, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Copy, Download, Loader2, X } from 'lucide-react';
import { downloadMedia } from '@client/shared/media/downloadMedia';
import './salesImagePreview.css';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';

interface PreviewImage {
  url: string;
  label: string;
  prompt?: string;
  kind?: string;
}

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  image: PreviewImage;
  images?: readonly PreviewImage[];
}

/** Preview local to the sales workspace; opening it never changes the route or task state. */
export function SalesImagePreviewButton({ image, images, children, ...props }: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-label={`放大查看${image.label}`} aria-haspopup="dialog" {...props} onClick={() => setOpen(true)}>{children}</button>
    {open && <SalesImagePreview image={image} images={images} onClose={() => setOpen(false)} />}
  </>;
}

function SalesImagePreview({ image, images, onClose }: { image: PreviewImage; images?: readonly PreviewImage[]; onClose: () => void }) {
  const gallery = images?.filter((item) => item.url) || [];
  let initialIndex = gallery.indexOf(image);
  if (initialIndex < 0) initialIndex = gallery.findIndex((item) => item.url === image.url && item.label === image.label);
  if (initialIndex < 0) { gallery.unshift(image); initialIndex = 0; }
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const index = Math.min(activeIndex, gallery.length - 1);
  const current = gallery[index];
  const visible = useViewVisibility();
  const dialogRef = useModalDialog(visible, onClose, { initialFocusSelector: '[aria-label="关闭图片预览"]' });
  useEffect(() => {
    if (!visible) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [visible]);
  const move = (offset: number) => {
    if (gallery[index + offset]) setActiveIndex(index + offset);
  };
  if (!visible || typeof document === 'undefined') return null;

  return createPortal(<div
    ref={dialogRef} role="dialog" aria-modal="true" aria-label="素材图片大图" tabIndex={-1}
    className="sales-image-lightbox"
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={(event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }}
  >
    <div className="sales-image-lightbox-layout">
      <div className="sales-image-lightbox-media">
        {gallery.length > 1 && <button type="button" aria-label="上一张图片" title="上一张（←）" disabled={index === 0} onClick={() => move(-1)} className="sales-image-lightbox-arrow is-previous"><ChevronLeft className="h-5 w-5" aria-hidden /></button>}
        <div className="sales-image-lightbox-picture">
          <PreviewImageContent key={current.url} image={current} />
        </div>
        {gallery.length > 1 && <button type="button" aria-label="下一张图片" title="下一张（→）" disabled={index === gallery.length - 1} onClick={() => move(1)} className="sales-image-lightbox-arrow is-next"><ChevronRight className="h-5 w-5" aria-hidden /></button>}
      </div>
      <PreviewImageInfo image={current} index={index} total={gallery.length} onClose={onClose} />
    </div>
  </div>, document.body);
}

function PreviewImageInfo({ image, index, total, onClose }: { image: PreviewImage; index: number; total: number; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { setFeedback(''); setCopied(false); }, [image.url]);
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setFeedback('');
    try { await downloadMedia(image.url, image.label); }
    catch { setFeedback('下载失败，请重试'); }
    finally { setDownloading(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(image.prompt || ''); setCopied(true); setFeedback(''); }
    catch { setFeedback('复制失败，请选中提示词手动复制'); }
  };
  return <aside aria-label="素材信息" className="sales-image-lightbox-info">
    <header className="sales-image-lightbox-header">
      <div className="flex min-w-0 items-center gap-2.5"><img src="/app_logo.png" alt="" className="h-8 w-8 object-contain" /><span className="truncate text-sm font-semibold">贝壳云图</span></div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label="下载原图" title="下载原图" disabled={downloading} onClick={() => { void download(); }} className="sales-image-lightbox-icon">{downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}</button>
        <button type="button" aria-label="关闭图片预览" title="关闭（Esc）" onClick={onClose} className="sales-image-lightbox-icon"><X className="h-4 w-4" aria-hidden /></button>
      </div>
    </header>
    <div className="sales-image-lightbox-details">
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400"><span>{image.kind === 'product' ? '商品参考图' : image.kind ? 'AI 生成素材' : '电商视频 · 参考素材'}</span><span aria-live="polite" className="shrink-0 tabular-nums">{index + 1} / {total}</span></div>
      <h2 aria-live="polite" className="mt-4 break-words text-base font-semibold leading-7">{image.label}</h2>
      {image.prompt && <section className="sales-image-lightbox-prompt" aria-label="图片提示词"><h3 className="mb-3 text-xs text-slate-500 dark:text-slate-400">图片提示词</h3><p data-preview-copy className="whitespace-pre-wrap text-[13px] leading-7 [overflow-wrap:anywhere]">{image.prompt}</p></section>}
    </div>
    <footer className="sales-image-lightbox-footer">
      {feedback && <p role="status" className="mb-3 text-xs text-rose-500">{feedback}</p>}
      <div className="flex items-center gap-3">
        <button type="button" disabled={downloading} onClick={() => { void download(); }} className="sales-image-lightbox-action"><Download className="h-4 w-4" aria-hidden />下载原图</button>
        {image.prompt && <button type="button" onClick={() => { void copy(); }} className="sales-image-lightbox-action">{copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}{copied ? '已复制' : '复制提示词'}</button>}
      </div>
    </footer>
  </aside>;
}

function PreviewImageContent({ image }: { image: PreviewImage }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  return <div className={`sales-image-lightbox-frame ${status === 'ready' ? 'is-ready' : ''}`}>
    {status === 'loading' && <span role="status" className="pointer-events-none absolute flex items-center gap-2 text-sm"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />正在加载图片…</span>}
    {status === 'error' && <div role="status" className="text-center text-sm"><p>图片加载失败</p><button type="button" onClick={() => { setStatus('loading'); setAttempt((value) => value + 1); }} className="mt-3 rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20">重新加载图片</button></div>}
    <img key={attempt} src={image.url} alt={image.label} onLoad={() => setStatus('ready')} onError={() => setStatus('error')} className={status === 'error' ? 'hidden' : ''} />
  </div>;
}
