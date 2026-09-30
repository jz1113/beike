import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PosterItem } from '../model/posterTypes';
import { PosterCoverCard } from './PosterCoverCard';

interface Props {
  items: PosterItem[];
  isRunning: boolean;
  compact?: boolean;
  onPreview: (item: PosterItem) => void;
  onDownload: (item: PosterItem, index: number) => void;
  onDownloadOriginalScene: (item: PosterItem, index: number) => void;
  onRetry: (item: PosterItem, index: number) => void;
  onEditTitle: (id: string, value: string) => boolean;
}

const PAGE_SIZE = 60;

export function PosterCoverGallery({ items, isRunning, compact = false, onPreview, onDownload, onDownloadOriginalScene, onRetry, onEditTitle }: Props) {
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const galleryRef = useRef<HTMLElement>(null);
  const handlersRef = useRef({ onPreview, onDownload, onDownloadOriginalScene, onRetry, onEditTitle });
  useLayoutEffect(() => { handlersRef.current = { onPreview, onDownload, onDownloadOriginalScene, onRetry, onEditTitle }; });
  const batchKey = items[0]?.id;
  useLayoutEffect(() => { setPage(1); setEditingId(null); }, [batchKey]);
  const preview = useCallback((item: PosterItem) => handlersRef.current.onPreview(item), []);
  const download = useCallback((item: PosterItem, index: number) => handlersRef.current.onDownload(item, index), []);
  const downloadOriginal = useCallback((item: PosterItem, index: number) => handlersRef.current.onDownloadOriginalScene(item, index), []);
  const retry = useCallback((item: PosterItem, index: number) => handlersRef.current.onRetry(item, index), []);
  const editTitle = useCallback((id: string, value: string) => handlersRef.current.onEditTitle(id, value), []);
  const stopEdit = useCallback(() => setEditingId(null), []);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const changePage = (next: number) => {
    setPage(next);
    galleryRef.current?.scrollIntoView({ block: 'start' });
  };
  const pageControls = pageCount > 1 && (
    <nav aria-label="封面清单分页" className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-slate-500">
      <span>共 {items.length} 条 · 第 {currentPage} / {pageCount} 页{editingId ? ' · 保存或取消标题后可翻页' : ''}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => changePage(currentPage - 1)} disabled={currentPage === 1 || Boolean(editingId)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />上一页</button>
        <select value={currentPage} onChange={(event) => changePage(Number(event.target.value))} disabled={Boolean(editingId)} aria-label="跳转到封面页" className="max-w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 disabled:opacity-40">{Array.from({ length: pageCount }, (_, index) => <option key={index} value={index + 1}>第 {index + 1} 页</option>)}</select>
        <button type="button" onClick={() => changePage(currentPage + 1)} disabled={currentPage === pageCount || Boolean(editingId)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40">下一页<ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    </nav>
  );

  return (
    <section ref={galleryRef}>
      {pageControls}
      <div className={compact
        ? 'grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8'
        : 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'}>
        {items.slice(offset, offset + PAGE_SIZE).map((item, index) => <PosterCoverCard key={item.id} item={item} index={offset + index} isRunning={isRunning} isEditing={editingId === item.id} onPreview={preview} onDownload={download} onDownloadOriginalScene={downloadOriginal} onRetry={retry} onEditTitle={editTitle} onStartEdit={setEditingId} onStopEdit={stopEdit} />)}
      </div>
      {pageControls}
    </section>
  );
}
