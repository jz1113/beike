import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Copy, Download, Loader2, X } from 'lucide-react';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { LightboxImage } from '@client/shared/modals/lightbox/LightboxImage';
import { getMediaDownloadFilename } from '@shared/domain/media/mediaDownload';
import { safeBaseName, stageLabel, type PosterItem } from '../model/posterTypes';
import './posterPreview.css';

interface Props {
  item: PosterItem;
  imageUrl: string;
  position: number;
  total: number;
  onMove: (offset: number) => void;
  onClose: () => void;
}

export function PosterPreviewDialog({ item, imageUrl, position, total, onMove, onClose }: Props) {
  const visible = useViewVisibility();
  const titleId = useId();
  const dialogRef = useModalDialog(visible, onClose, { initialFocusSelector: '[aria-label="关闭封面预览"]' });
  useEffect(() => {
    if (!visible) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [visible]);
  if (!visible) return null;
  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      className="poster-preview"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (total > 1 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          event.stopPropagation();
          onMove(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}>
      <div className="poster-preview-layout">
        <div className={`poster-preview-media ${total > 1 ? 'has-navigation' : ''}`}>
          {total > 1 && <button type="button" className="poster-preview-arrow is-previous" aria-label="上一个商品" title="上一个商品（←）" onClick={() => onMove(-1)}><ChevronLeft className="h-5 w-5" aria-hidden /></button>}
          <LightboxImage key={imageUrl} src={imageUrl} alt={item.coverTitle || item.originalTitle || '商品封面'} className="poster-preview-image" />
          {total > 1 && <button type="button" className="poster-preview-arrow is-next" aria-label="下一个商品" title="下一个商品（→）" onClick={() => onMove(1)}><ChevronRight className="h-5 w-5" aria-hidden /></button>}
        </div>
        <PosterPreviewInfo item={item} imageUrl={imageUrl} titleId={titleId} position={position} total={total} onClose={onClose} />
      </div>
    </div>, document.body,
  );
}

function PosterPreviewInfo({ item, imageUrl, titleId, position, total, onClose }: Omit<Props, 'onMove'> & { titleId: string }) {
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);
  const context = `${item.id}:${imageUrl}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  const detailsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setFeedback(''); setCopied(false);
    if (detailsRef.current) detailsRef.current.scrollTop = 0;
  }, [context, item.prompt]);
  const kind = item.resultUrl ? '成品封面' : item.generatedSceneUrl ? '原生生成图' : '商品参考图';
  const prompt = item.prompt?.trim();
  const design = item.designPlan;
  const designRows = design ? [
    ['构图', design.layout || design.composition], ['字体', design.typeface || design.typography],
    ['字色', design.textColor || design.palette], ['背景', design.background],
    ['主体', design.subject || design.visualAnchor], ['搭配', design.harmony], ['排重', design.variation],
  ].filter(([, value]) => value) : [];
  const download = async () => {
    if (downloading) return;
    setDownloading(true); setFeedback('');
    try {
      const blob = await fetchMediaBlob(imageUrl);
      const suffix = item.resultUrl ? '' : item.generatedSceneUrl ? '_原生图' : '_参考图';
      const name = `${safeBaseName(item.originalTitle || item.coverTitle, '商品封面')}${suffix}`;
      await saveToDownloadDir(getMediaDownloadFilename(name, blob.type, imageUrl), blob);
    } catch (error) {
      if (currentContext.current === context) setFeedback(`下载失败：${error instanceof Error ? error.message : '请重试'}`);
    } finally { setDownloading(false); }
  };
  const copy = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      if (currentContext.current === context) { setCopied(true); setFeedback(''); }
    } catch {
      if (currentContext.current === context) setFeedback('复制失败，请选中提示词手动复制');
    }
  };
  return <aside className="poster-preview-info" aria-label="封面详情">
    <header className="poster-preview-header">
      <div className="flex min-w-0 items-center gap-2.5"><img src="/app_logo.png" alt="" className="h-8 w-8 shrink-0 rounded-full object-contain" /><span className="text-sm font-semibold">贝壳云图<span className="ml-2 text-xs font-normal text-slate-400">封面</span></span></div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" className="poster-preview-icon" aria-label="下载当前图片" title="下载当前图片" disabled={downloading} onClick={() => { void download(); }}><Download className="h-4 w-4" aria-hidden /></button>
        <button type="button" className="poster-preview-icon" aria-label="关闭封面预览" title="关闭（Esc）" onClick={onClose}><X className="h-4 w-4" aria-hidden /></button>
      </div>
    </header>
    <div ref={detailsRef} className="poster-preview-details">
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400"><span className="poster-preview-badge">{kind}</span>{total > 1 && <span aria-live="polite" className="tabular-nums">商品 {position + 1} / {total}</span>}</div>
      <h2 id={titleId} aria-live="polite" className="mt-4 text-lg font-semibold leading-8">{item.coverTitle || item.originalTitle || '商品封面'}</h2>
      {item.originalTitle && item.coverTitle && item.originalTitle !== item.coverTitle && <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">原标题：{item.originalTitle}</p>}
      {item.productName && <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">商品：{item.productName}</p>}
      <dl className="poster-preview-specs">
        <div><dt>交付规格</dt><dd>{item.format.aspectRatio}<span className="ml-2">{item.format.width} × {item.format.height}</span></dd></div>
        <div><dt>生产状态</dt><dd>{stageLabel(item.status)}</dd></div>
      </dl>
      {item.error && <p className="mt-4 text-xs leading-6 text-rose-500">{item.error}</p>}
      <section className="poster-preview-prompt" aria-label="生成提示词">
        <h3 className="mb-3 text-xs font-medium text-slate-500 dark:text-slate-400">生成提示词</h3>
        <p className="whitespace-pre-wrap text-[13px] leading-7">{prompt || '尚未生成提示词，完成封面设计后会显示在这里。'}</p>
      </section>
      {designRows.length > 0 && <details key={item.id} className="poster-preview-design">
        <summary className="cursor-pointer py-3 text-xs font-medium">七栏设计单{design?.name ? ` · ${design.name}` : ''}</summary>
        <dl>{designRows.map(([label, value]) => <div key={label} className="mb-4"><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{label}</dt><dd className="text-[13px] leading-6">{value}</dd></div>)}</dl>
      </details>}
    </div>
    <footer className="poster-preview-footer">
      {feedback && <p role="alert" className="mb-3 text-xs leading-5 text-rose-500">{feedback}</p>}
      <div className="flex gap-2.5">
        <button type="button" className="poster-preview-action is-primary" disabled={downloading} onClick={() => { void download(); }}>{downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}{downloading ? '下载中…' : `下载${kind === '成品封面' ? '封面' : kind === '原生生成图' ? '原生图' : '参考图'}`}</button>
        {prompt && <button type="button" className="poster-preview-action" onClick={() => { void copy(); }}>{copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}{copied ? '已复制' : '复制提示词'}</button>}
      </div>
    </footer>
  </aside>;
}
