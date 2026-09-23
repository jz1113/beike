import { AlertCircle, CheckCircle2, Download, Loader2, RotateCcw } from 'lucide-react';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import { stageLabel, type PosterItem } from '../model/posterTypes';

interface Props {
  items: PosterItem[];
  isRunning: boolean;
  compact?: boolean;
  onPreview: (item: PosterItem) => void;
  onDownload: (item: PosterItem, index: number) => void;
  onRetry: (item: PosterItem, index: number) => void;
}

function statusClass(status: PosterItem['status']) {
  if (status === 'complete') return 'bg-emerald-500/90 text-white';
  if (status === 'failed') return 'bg-rose-600/90 text-white';
  if (status === 'interrupted') return 'bg-amber-500/90 text-white';
  return 'bg-slate-950/76 text-white';
}

const CARD_TITLE_MAX_LENGTH = 27;

function visibleCardTitle(value: string): string {
  const characters = Array.from(value);
  return characters.length > CARD_TITLE_MAX_LENGTH
    ? `${characters.slice(0, CARD_TITLE_MAX_LENGTH).join('')}…`
    : value;
}

export function PosterCoverGallery({
  items, isRunning, compact = false, onPreview, onDownload, onRetry,
}: Props) {
  return (
    <section>
      <div className={compact
        ? 'grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8'
        : 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'}>
        {items.map((item, index) => {
          const fullTitle = item.coverTitle || item.originalTitle || '未填写原标题';
          const cardTitle = visibleCardTitle(fullTitle);
          return (
          <article key={item.id} className="group relative min-w-0">
            <button type="button" onClick={() => onPreview(item)} className="relative block aspect-[3/4] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-left shadow-sm transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400" aria-label={`查看「${fullTitle}」大图`}>
              {item.resultUrl || item.sourceImageUrl ? <LazyProxyImage src={item.resultUrl || item.sourceImageUrl} alt={item.originalTitle} width={360} className="h-full w-full object-cover" /> : null}
              <span className="absolute left-2 top-2 text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)]">{String(index + 1).padStart(2, '0')}</span>
              <span className={`absolute bottom-2 right-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 truncate rounded-md px-1.5 py-1 text-[10px] font-bold backdrop-blur ${statusClass(item.status)}`} title={item.modelFallbackNote ? `${stageLabel(item.status)} · ${item.modelFallbackNote}` : stageLabel(item.status)}>{item.status === 'complete' ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : item.status === 'failed' ? <AlertCircle className="h-3 w-3 shrink-0" /> : item.status !== 'idle' && item.status !== 'interrupted' ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}<span className="truncate">{item.modelFallbackNote ? `${stageLabel(item.status)} · ${item.modelFallbackNote}` : stageLabel(item.status)}</span></span>
            </button>
            {item.resultUrl ? <button type="button" onClick={() => onDownload(item, index)} className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)] transition-transform hover:scale-110" aria-label="下载成品" title="下载成品"><Download className="h-4 w-4" /></button> : item.status === 'failed' || item.status === 'interrupted' ? <button type="button" onClick={() => onRetry(item, index)} disabled={isRunning} className={`absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)] transition-transform hover:scale-110 hover:text-white disabled:opacity-40 ${item.status === 'failed' ? 'text-rose-100' : 'text-amber-100'}`} aria-label={item.status === 'failed' ? '重新生成' : '继续生成'} title={item.status === 'failed' ? '重新生成' : '继续生成'}><RotateCcw className="h-4 w-4" /></button> : null}
            <p className="mt-1.5 truncate whitespace-nowrap text-center text-[clamp(10px,0.65vw,12px)] font-semibold leading-[1.2] text-slate-900" title={fullTitle}>{cardTitle}</p>
            {item.status === 'failed' && item.error && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-rose-600">{item.error}</p>}
          </article>
          );
        })}
      </div>
    </section>
  );
}
