import { memo, useId, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Download, Loader2, Pencil, RotateCcw, X } from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import { normalizeCoverTitle, stageLabel, type PosterItem } from '../model/posterTypes';

interface Props {
  item: PosterItem;
  index: number;
  isRunning: boolean;
  isEditing: boolean;
  onPreview: (item: PosterItem) => void;
  onDownload: (item: PosterItem, index: number) => void;
  onDownloadOriginalScene: (item: PosterItem, index: number) => void;
  onRetry: (item: PosterItem, index: number) => void;
  onEditTitle: (id: string, value: string) => boolean;
  onStartEdit: (id: string) => void;
  onStopEdit: () => void;
}

function statusClass(status: PosterItem['status']) {
  if (status === 'complete') return 'bg-emerald-500/90 text-white';
  if (status === 'failed') return 'bg-rose-600/90 text-white';
  if (status === 'interrupted') return 'bg-amber-500/90 text-white';
  return 'bg-slate-950/76 text-white';
}

export const PosterCoverCard = memo(function PosterCoverCard({ item, index, isRunning, isEditing, onPreview, onDownload, onDownloadOriginalScene, onRetry, onEditTitle, onStartEdit, onStopEdit }: Props) {
  const [editingTitle, setEditingTitle] = useState('');
  const [editingError, setEditingError] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditingRef = useRef(false);
  const titleErrorId = useId();
  useLayoutEffect(() => {
    if (!isEditing && wasEditingRef.current && document.activeElement === document.body) editButtonRef.current?.focus({ preventScroll: true });
    wasEditingRef.current = isEditing;
  }, [isEditing]);

  const fullTitle = item.coverTitle || item.originalTitle || '未填写原标题';
  const characters = Array.from(fullTitle);
  const cardTitle = characters.length > 27 ? `${characters.slice(0, 27).join('')}…` : fullTitle;
  const canEdit = !isRunning && !item.importError && ['idle', 'failed', 'interrupted', 'complete'].includes(item.status)
    && (item.status === 'complete' || Boolean(item.generatedSceneUrl) || (!item.generationRecoveryRequired && !item.imageTaskId));
  const failed = item.status === 'failed' || item.status === 'interrupted';
  const previewUrl = item.resultUrl || item.generatedSceneUrl || item.sourceImageUrl;
  const retryLabel = item.generatedSceneUrl ? '重新导出' : item.generationRecoveryRequired ? '核对原任务' : item.status === 'failed' ? '重新生成' : '继续生成';
  const saveTitle = () => {
    if (isRunning) return;
    const title = normalizeCoverTitle(editingTitle);
    if (title.length < 7 || title.length > 12) {
      setEditingError('封面标题请保持 7–12 字，不会自动截断词语。');
      return;
    }
    if (onEditTitle(item.id, editingTitle)) onStopEdit();
    else setEditingError('当前无法修改，请等待操作结束或先核对原任务。');
  };

  return (
    <article className="group relative min-w-0">
      <button type="button" onClick={() => onPreview(item)} disabled={!previewUrl} className={`relative block ${item.format.id === 'square' ? 'aspect-square' : 'aspect-[3/4]'} w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-left shadow-sm transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:bg-white/10 dark:border-white/10`} aria-label={`查看「${fullTitle}」大图`}>
        {previewUrl ? <LazyProxyImage src={previewUrl} alt={item.originalTitle} width={360} className={`h-full w-full ${item.resultUrl || item.generatedSceneUrl ? 'object-contain' : 'object-cover'}`} /> : null}
        <span className="absolute left-2 top-2 text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)]">{String(index + 1).padStart(2, '0')}</span>
        <span className={`absolute bottom-2 right-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 truncate rounded-md px-1.5 py-1 text-[10px] font-bold backdrop-blur ${statusClass(item.status)}`} title={item.modelFallbackNote ? `${stageLabel(item.status)} · ${item.modelFallbackNote}` : stageLabel(item.status)}>{item.status === 'complete' ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : item.status === 'failed' ? <AlertCircle className="h-3 w-3 shrink-0" /> : item.status !== 'idle' && item.status !== 'interrupted' ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}<span className="truncate">{item.modelFallbackNote ? `${stageLabel(item.status)} · ${item.modelFallbackNote}` : stageLabel(item.status)}</span></span>
      </button>
      {item.resultUrl ? <button type="button" onClick={() => onDownload(item, index)} className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)] transition-transform hover:scale-110" aria-label="下载成品" title="下载成品"><Download className="h-4 w-4" /></button> : failed ? <button type="button" onClick={() => onRetry(item, index)} disabled={isRunning || Boolean(item.importError && !item.imageTaskId && !item.generatedSceneUrl && !item.generationRecoveryRequired)} className={`absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)] transition-transform hover:scale-110 hover:text-white disabled:opacity-40 ${item.status === 'failed' ? 'text-rose-100' : 'text-amber-100'}`} aria-label={retryLabel} title={item.importError && !item.imageTaskId && !item.generatedSceneUrl && !item.generationRecoveryRequired ? '请修正表格后重新导入' : retryLabel}><RotateCcw className="h-4 w-4" /></button> : null}
      {!item.resultUrl && item.generatedSceneUrl && <button type="button" onClick={() => onDownloadOriginalScene(item, index)} className="absolute right-10 top-2 inline-flex h-7 w-7 items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)] transition-transform hover:scale-110" aria-label="下载原生图" title="下载原生图，尚未完成成品规格导出"><Download className="h-4 w-4" /></button>}
      {isEditing ? (
        <div className="mt-2 space-y-1.5">
          <input autoFocus value={editingTitle} disabled={isRunning} maxLength={60} onChange={(event) => { setEditingTitle(event.target.value); setEditingError(null); }} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') { event.preventDefault(); saveTitle(); } else if (event.key === 'Escape') { event.stopPropagation(); onStopEdit(); } }} aria-label="修改封面标题，7至12字" aria-invalid={Boolean(editingError)} aria-describedby={editingError ? titleErrorId : undefined} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-rose-400 disabled:opacity-50 dark:bg-[#18191c]" />
          <div className="flex items-center justify-between gap-1"><span className="text-[10px] text-slate-500 dark:text-slate-400">7–12 字{item.status === 'complete' || item.generatedSceneUrl ? '，保存后需重新生成' : ''}</span><div className="flex shrink-0 gap-1"><button type="button" onClick={onStopEdit} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="取消修改标题"><X className="h-3.5 w-3.5" /></button><button type="button" onClick={saveTitle} disabled={isRunning} className="rounded-md bg-slate-950 p-1 text-white disabled:opacity-40" aria-label="保存封面标题"><Check className="h-3.5 w-3.5" /></button></div></div>
          {editingError && <p id={titleErrorId} role="alert" className="text-[11px] leading-4 text-rose-600">{editingError}</p>}
        </div>
      ) : (
        <div className="mt-1.5 flex min-w-0 items-center justify-center gap-1">
          <p className="min-w-0 truncate whitespace-nowrap text-center text-[clamp(10px,0.65vw,12px)] font-semibold leading-[1.2] text-slate-900 dark:text-slate-100" title={fullTitle}>{cardTitle}</p>
          <button ref={editButtonRef} type="button" disabled={!canEdit} onClick={() => { setEditingTitle(item.coverTitle || item.originalTitle); setEditingError(null); onStartEdit(item.id); }} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 dark:hover:text-slate-100 dark:hover:bg-white/10" aria-label={item.status === 'complete' || item.generatedSceneUrl ? '修改标题并重新生成' : '修改封面标题'} title={canEdit ? (item.status === 'complete' || item.generatedSceneUrl ? '修改标题并重新生成' : '修改封面标题') : item.importError ? '请修正表格后重新导入' : '请等待当前任务结束或先核对原任务'}><Pencil className="h-3 w-3" /></button>
        </div>
      )}
      {item.designPlan?.layout && (
        <details className="mt-1 text-left">
          <summary className="cursor-pointer text-[10px] font-bold text-slate-400">设计单</summary>
          <dl className="mt-1 space-y-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
            {([
              ['构图', item.designPlan.layout],
              ['字体', item.designPlan.typeface],
              ['字色', item.designPlan.textColor],
              ['背景', item.designPlan.background],
              ['主体', item.designPlan.subject],
              ['搭配', item.designPlan.harmony],
              ['排重', item.designPlan.variation],
            ] as const).filter(([, value]) => value).map(([label, value]) => (
              <div key={label}><dt className="inline font-bold text-slate-600 dark:text-slate-300">{label} </dt><dd className="inline">{value}</dd></div>
            ))}
          </dl>
        </details>
      )}
      {failed && item.error && <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-rose-600" title={item.error}>{item.error}</p>}
    </article>
  );
});
