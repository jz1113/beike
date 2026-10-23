import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUpRight, Archive, Clock3, MoreHorizontal, Pencil, Search, Trash2, X } from 'lucide-react';
import { WorkshopActionMenu, workshopMenuItemClass } from '../layout/WorkshopActionMenu';
import { BatchHistoryProduct, BatchHistoryRecord, BatchHistoryStats, batchHistoryStatus, formatBatchHistoryDate } from './BatchHistoryContent';
import type { WorkshopBatchSummary } from '@shared/contracts/workshopBatches';
import type { WorkshopBatch } from '@shared/workshopSnapshot';

interface Props {
  activeBatch: WorkshopBatch | null;
  historyBatches: WorkshopBatchSummary[];
  onClose: () => void;
  onReadBatch: (id: string) => Promise<WorkshopBatch>;
  onOpenGenerationView: (batch: WorkshopBatch) => void;
  onDuplicateBatch: (id: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onDeleteBatch: (id: string) => Promise<void>;
  onRenameBatch: (id: string, name: string) => Promise<void>;
  onError: (message: string) => void;
}

export function BatchHistoryPanel({ activeBatch, historyBatches, onClose, onReadBatch, onOpenGenerationView, onDuplicateBatch, onClearHistory, onDeleteBatch, onRenameBatch, onError }: Props) {
  const [selectedBatch, setSelectedBatch] = useState<WorkshopBatch | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | 'all' | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const selectedBatchId = selectedBatch?.id;
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = selectedBatchId ? 0 : listScroll.current;
  }, [selectedBatchId]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => { if (!editingBatchId && !deleteTarget) panelRef.current?.focus(); }, [selectedBatch?.id, editingBatchId, deleteTarget]);
  const archived = historyBatches.filter(batch => batch.id !== activeBatch?.id);
  const visible = archived.filter(batch => `${batch.name} ${batch.id}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const viewBatch = async (id: string) => {
    setIsBusy(true);
    try {
      const batch = await onReadBatch(id);
      listScroll.current = scrollRef.current?.scrollTop || 0;
      setSelectedBatch(batch);
    } catch (error) {
      onError(error instanceof Error ? error.message : '历史批次读取失败');
    } finally {
      setIsBusy(false);
    }
  };

  const duplicate = async (id: string) => {
    setIsBusy(true);
    try {
      await onDuplicateBatch(id);
      setSelectedBatch(null);
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : '复制批次失败');
    } finally {
      setIsBusy(false);
    }
  };

  const openGenerationView = async (id: string) => {
    setIsBusy(true);
    try {
      onOpenGenerationView(await onReadBatch(id));
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : '历史批次读取失败');
    } finally {
      setIsBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isBusy) return;
    setIsBusy(true);
    try {
      if (deleteTarget === 'all') await onClearHistory();
      else await onDeleteBatch(deleteTarget.id);
      if (deleteTarget === 'all' || selectedBatch?.id === deleteTarget.id) setSelectedBatch(null);
      setDeleteTarget(null);
      setEditingBatchId(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : '历史记录删除失败');
    } finally { setIsBusy(false); }
  };

  const saveName = async (id: string) => {
    const name = draftName.trim();
    if (!name) {
      onError('请输入批次名称');
      return;
    }
    setIsBusy(true);
    try {
      await onRenameBatch(id, name);
      setEditingBatchId(null);
      setSelectedBatch(previous => previous?.id === id ? { ...previous, name } : previous);
    } catch (error) {
      onError(error instanceof Error ? error.message : '批次命名失败');
    } finally {
      setIsBusy(false);
    }
  };

  const editName = (batch: WorkshopBatchSummary | WorkshopBatch) => <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (!isBusy) void saveName(batch.id); }}>
    <input autoFocus disabled={isBusy} value={draftName} maxLength={120} onChange={event => setDraftName(event.target.value)} aria-label="批次名称" placeholder="输入便于查找的批次名称" className="min-w-0 flex-1 rounded-lg border border-indigo-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
    <button disabled={isBusy} className="text-xs font-bold text-indigo-600 disabled:opacity-40">保存</button>
    <button type="button" disabled={isBusy} onClick={() => setEditingBatchId(null)} className="text-xs text-slate-500 dark:text-slate-400">取消</button>
  </form>;
  const more = (batch: WorkshopBatchSummary | WorkshopBatch) => <WorkshopActionMenu label="更多" icon={<MoreHorizontal className="h-4 w-4" />} disabled={isBusy}>
    <button type="button" className={workshopMenuItemClass} onClick={() => { setDraftName(batch.name.startsWith('未命名') ? '' : batch.name); setEditingBatchId(batch.id); }}><Pencil className="h-4 w-4" />重命名</button>
    {batch.id !== activeBatch?.id && <button type="button" className={workshopMenuItemClass} onClick={() => void duplicate(batch.id)}><Archive className="h-4 w-4" />{batch.status === 'archived' ? '恢复为当前批次' : '复制为新批次'}</button>}
  </WorkshopActionMenu>;
  const detailTasks = selectedBatch?.snapshot.items.flatMap(item => item.tasks).filter(task => task.resultStatus !== 'superseded') || [];

  return createPortal(
    <div className="fixed inset-0 z-[180] flex justify-end bg-slate-950/20 p-0 backdrop-blur-[3px] sm:p-4" onClick={event => { if (event.target === event.currentTarget && !isBusy) onClose(); }}>
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="批次历史" aria-busy={isBusy}
        onKeyDown={event => {
          if (event.key === 'Escape' && panelRef.current?.querySelector('[aria-expanded="true"]')) return;
          if (event.key === 'Escape' && !isBusy) { event.stopPropagation(); if (deleteTarget) setDeleteTarget(null); else if (editingBatchId) setEditingBatchId(null); else if (selectedBatch) setSelectedBatch(null); else onClose(); }
          if (event.key === 'Tab') {
            const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') || []);
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first?.focus(); }
          }
        }} className="flex h-full w-full min-w-0 max-w-[520px] flex-col overflow-hidden border border-white/80 bg-slate-50/95 shadow-2xl outline-none backdrop-blur-xl sm:rounded-2xl dark:border-white/10 dark:bg-[#141416]">
        <header className="shrink-0 border-b border-slate-200/60 bg-white/60 px-5 py-5 sm:px-6 dark:border-white/10 dark:bg-[#18191c]/95">
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-indigo-600" /><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">批次历史</h2></div><p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">回看创作结果，继续历史批次。</p></div>
            <button type="button" disabled={isBusy} onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10" aria-label="关闭批次历史"><X className="h-5 w-5" /></button>
          </div>
          {!selectedBatch && archived.length > 0 && <div className="mt-5 space-y-4">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/60 px-3 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 dark:border-white/10 dark:bg-[#18191c]/95"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索批次" placeholder="搜索批次名称或编号" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />{query && <button type="button" onClick={() => setQuery('')} aria-label="清除搜索"><X className="h-4 w-4 text-slate-400" /></button>}</label>

          </div>}
        </header>
        <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {selectedBatch ? <div className="space-y-4">
            <button type="button" disabled={isBusy} onClick={() => { setSelectedBatch(null); setEditingBatchId(null); }} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400"><ArrowLeft className="h-4 w-4" />返回批次列表</button>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#18191c]">
              <span className="text-xs font-semibold text-indigo-600">{batchHistoryStatus(selectedBatch)}</span>
              <h3 className="mt-2 [overflow-wrap:anywhere] text-lg font-bold text-slate-900 dark:text-slate-100">{selectedBatch.name}</h3>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">更新于 {formatBatchHistoryDate(selectedBatch.updatedAt)}</p>
              <p className="mt-1 truncate font-mono text-[11px] text-slate-400" title={selectedBatch.id}>编号 {selectedBatch.id}</p>
              <BatchHistoryStats batch={selectedBatch} />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={isBusy || !detailTasks.length} onClick={() => void openGenerationView(selectedBatch.id)} className="flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-40">查看生成结果<ArrowUpRight className="h-4 w-4" /></button>{more(selectedBatch)}</div>
              {editingBatchId === selectedBatch.id && editName(selectedBatch)}
            </section>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">商品明细 · {selectedBatch.snapshot.items.length} 款</p>
            {!selectedBatch.snapshot.items.length && <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-white/10">此批次还没有添加商品</p>}
            {selectedBatch.snapshot.items.length > 0 && <ul aria-label="历史批次商品" className="min-w-0 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4 dark:border-white/10 dark:divide-white/10 dark:bg-[#18191c]">
              {selectedBatch.snapshot.items.map((item, index) => <BatchHistoryProduct key={item.id} item={item} index={index} />)}
            </ul>}
          </div> : <div className="space-y-4">
            {activeBatch && !query && <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100/70 bg-indigo-50/60 px-4 py-3.5 dark:border-indigo-400/20 dark:bg-indigo-500/10"><div className="min-w-0"><p className="text-[11px] font-semibold text-indigo-600">当前批次</p><p className="mt-1 truncate text-sm text-slate-700 dark:text-slate-200" title={activeBatch.name}>{activeBatch.name}</p></div><button type="button" disabled={isBusy} onClick={onClose} className="shrink-0 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-indigo-600 transition-colors hover:bg-white dark:hover:bg-white/10 dark:bg-[#18191c]/95">继续编辑</button></div>}
            {archived.length > 0 && <div className="flex items-center justify-between px-1 text-[11px] text-slate-400"><span>{query.trim() ? `找到 ${visible.length} 条记录` : `${archived.length} 条历史记录`}</span><span>最近更新</span></div>}
            {visible.length === 0 && <div className="flex min-h-[280px] flex-col items-center justify-center px-5 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white bg-white/70 shadow-sm dark:bg-[#18191c]/95"><Archive className="h-6 w-6 text-slate-400" strokeWidth={1.5} /></span>
              <h3 className="mt-5 text-sm font-medium text-slate-700 dark:text-slate-200">{query.trim() ? '没有找到相关批次' : '还没有历史批次'}</h3>
              <p className="mt-2 max-w-[260px] text-xs leading-6 text-slate-400">{query.trim() ? '换个名称或编号试试。' : '在这里回看结果，或恢复批次继续创作。'}</p>
              {query.trim() && <button type="button" onClick={() => setQuery('')} className="mt-4 rounded-lg px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50">清除搜索</button>}
            </div>}
            {visible.length > 0 && <div className="space-y-3">
              {visible.map(batch => <BatchHistoryRecord key={batch.id} batch={batch} disabled={isBusy}
                onView={() => { setDeleteTarget(null); void viewBatch(batch.id); }} />)}
            </div>}
          </div>}

        </div>
        {(selectedBatch || archived.length > 0 || isBusy || deleteTarget) && <footer className="shrink-0 border-t border-slate-200/60 bg-white/60 px-5 py-3 sm:px-6 dark:border-white/10 dark:bg-[#18191c]/95">
          {deleteTarget ? <div role="alert" className="space-y-3">
            <p className="[overflow-wrap:anywhere] text-sm font-semibold text-slate-800 dark:text-slate-100">{deleteTarget === 'all' ? `删除全部 ${archived.length} 条历史记录？` : `删除“${deleteTarget.name}”？`}</p>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">记录删除后无法恢复。当前批次和已保存的图片文件不会删除。</p>
            <div className="flex justify-end gap-2"><button autoFocus type="button" disabled={isBusy} onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-600 disabled:opacity-40 dark:text-slate-300 dark:border-white/10">取消</button><button type="button" disabled={isBusy} onClick={() => void confirmDelete()} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-40">{isBusy ? '正在删除…' : '确认删除'}</button></div>
          </div> : <div className="flex items-center justify-between gap-3"><p role="status" className="text-xs text-slate-400">{isBusy ? '正在处理…' : selectedBatch ? '历史快照 · 恢复后可继续编辑' : '仅管理历史记录'}</p>{selectedBatch ? <button type="button" disabled={isBusy || selectedBatch.id === activeBatch?.id} onClick={() => setDeleteTarget({id:selectedBatch.id,name:selectedBatch.name})} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs text-rose-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />删除此记录</button> : archived.length > 0 && <button type="button" disabled={isBusy} onClick={() => setDeleteTarget('all')} className="shrink-0 rounded-lg px-2 py-2 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40">清空历史</button>}</div>}
        </footer>}
      </aside>
    </div>, document.body
  );
}
