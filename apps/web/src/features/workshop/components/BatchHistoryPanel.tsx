import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUpRight, Archive, Clock3, ImageIcon, MoreHorizontal, Pencil, Search, Trash2, X } from 'lucide-react';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import { WorkshopActionMenu, workshopMenuItemClass } from './WorkshopActionMenu';
import { isUsableWorkshopResult } from '../model/workshopReadiness';
import type { WorkshopBatch, WorkshopBatchSummary } from '@beike/contracts/workshopBatches';

interface Props {
  activeBatch: WorkshopBatch | null;
  historyBatches: WorkshopBatchSummary[];
  onClose: () => void;
  onReadBatch: (id: string) => Promise<WorkshopBatch>;
  onOpenGenerationView: (batch: WorkshopBatch) => void;
  onDuplicateBatch: (id: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onRenameBatch: (id: string, name: string) => Promise<void>;
  onError: (message: string) => void;
}

export function BatchHistoryPanel({ activeBatch, historyBatches, onClose, onReadBatch, onOpenGenerationView, onDuplicateBatch, onClearHistory, onRenameBatch, onError }: Props) {
  const [selectedBatch, setSelectedBatch] = useState<WorkshopBatch | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'archived'>('all');
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => { if (!editingBatchId) panelRef.current?.focus(); }, [selectedBatch?.id, editingBatchId]);
  const archived = historyBatches.filter(batch => batch.id !== activeBatch?.id);
  const visible = historyBatches.filter(batch => (filter === 'all' || batch.status === 'archived')
    && `${batch.name} ${batch.id}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice().sort((a, b) => Number(b.id === activeBatch?.id) - Number(a.id === activeBatch?.id)
      || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const formatDate = (value: string) => new Date(value).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const statusLabel = (batch: WorkshopBatchSummary | WorkshopBatch) => batch.id === activeBatch?.id ? '当前批次' : ({
    draft:'草稿', collecting:'采集中', plan_ready:'待分析', analyzing:'分析中', review_required:'待确认分镜', approved:'待生成',
    generating:'生成中', qc_required:'待检查成图', partial_failed:'部分失败', paused:'已暂停', completed:'已完成', cancelled:'已取消', archived:'已归档',
  }[batch.status]);
  const viewBatch = async (id: string) => {
    setIsBusy(true);
    try {
      setSelectedBatch(await onReadBatch(id));
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

  const clearHistory = async () => {
    if (!window.confirm('确定清空全部历史批次吗？当前批次不会删除，此操作不可恢复。')) return;
    setIsBusy(true);
    try {
      await onClearHistory();
      setSelectedBatch(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : '历史批次清空失败');
    } finally {
      setIsBusy(false);
    }
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
    <input autoFocus value={draftName} maxLength={120} onChange={event => setDraftName(event.target.value)} aria-label="批次名称" placeholder="输入便于查找的批次名称" className="min-w-0 flex-1 rounded-lg border border-indigo-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
    <button disabled={isBusy} className="text-xs font-bold text-indigo-600 disabled:opacity-40">保存</button>
    <button type="button" disabled={isBusy} onClick={() => setEditingBatchId(null)} className="text-xs text-slate-500">取消</button>
  </form>;
  const more = (batch: WorkshopBatchSummary | WorkshopBatch) => <WorkshopActionMenu label="更多" icon={<MoreHorizontal className="h-4 w-4" />} disabled={isBusy}>
    <button type="button" className={workshopMenuItemClass} onClick={() => { setDraftName(batch.name.startsWith('未命名') ? '' : batch.name); setEditingBatchId(batch.id); }}><Pencil className="h-4 w-4" />重命名</button>
    {batch.id !== activeBatch?.id && <button type="button" className={workshopMenuItemClass} onClick={() => void duplicate(batch.id)}><Archive className="h-4 w-4" />{batch.status === 'archived' ? '恢复为当前批次' : '复制为新批次'}</button>}
  </WorkshopActionMenu>;
  const detailTasks = selectedBatch?.snapshot.items.flatMap(item => item.tasks).filter(task => task.resultStatus !== 'superseded') || [];

  return createPortal(
    <div className="fixed inset-0 z-[180] flex justify-end bg-slate-950/30 backdrop-blur-[2px]" onClick={event => { if (event.target === event.currentTarget && !isBusy) onClose(); }}>
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="批次历史" aria-busy={isBusy}
        onKeyDown={event => {
          if (event.key === 'Escape' && !isBusy) { event.stopPropagation(); if (editingBatchId) setEditingBatchId(null); else if (selectedBatch) setSelectedBatch(null); else onClose(); }
          if (event.key === 'Tab') {
            const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') || []);
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first?.focus(); }
          }
        }} className="flex h-full w-full max-w-2xl flex-col bg-slate-50 shadow-2xl outline-none">
        <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-indigo-600" /><h2 className="text-lg font-black text-slate-900">批次历史</h2></div><p className="mt-2 text-xs leading-relaxed text-slate-500">查找过往商品与成图，恢复批次后继续制作。</p></div>
            <button type="button" disabled={isBusy} onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="关闭批次历史"><X className="h-5 w-5" /></button>
          </div>
          {!selectedBatch && <div className="mt-5 space-y-4">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索批次" placeholder="搜索批次名称或编号" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />{query && <button type="button" onClick={() => setQuery('')} aria-label="清除搜索"><X className="h-4 w-4 text-slate-400" /></button>}</label>
            <div className="flex gap-2">{(['all','archived'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>{value === 'all' ? `全部批次 ${historyBatches.length}` : `已归档 ${historyBatches.filter(batch => batch.status === 'archived').length}`}</button>)}</div>
          </div>}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {selectedBatch ? <div className="space-y-4">
            <button type="button" disabled={isBusy} onClick={() => { setSelectedBatch(null); setEditingBatchId(null); }} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600"><ArrowLeft className="h-4 w-4" />返回批次列表</button>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <span className="text-xs font-semibold text-indigo-600">{statusLabel(selectedBatch)}</span>
              <h3 className="mt-2 break-words text-lg font-bold text-slate-900">{selectedBatch.name}</h3>
              <p className="mt-2 text-xs text-slate-400">更新于 {formatDate(selectedBatch.updatedAt)}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">{[[selectedBatch.snapshot.items.length,'商品'],[detailTasks.filter(isUsableWorkshopResult).length,'已成图'],[detailTasks.filter(task => task.status === 'FAILURE').length,'失败分镜']].map(([count,label]) => <div key={label}><p className="text-xl font-bold text-slate-800">{count}</p><p className="mt-1 text-[11px] text-slate-500">{label}</p></div>)}</div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={isBusy || !detailTasks.length} onClick={() => void openGenerationView(selectedBatch.id)} className="flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-40">查看生成结果<ArrowUpRight className="h-4 w-4" /></button>{more(selectedBatch)}</div>
              {editingBatchId === selectedBatch.id && editName(selectedBatch)}
            </section>
            <p className="text-xs font-semibold text-slate-500">商品明细 · {selectedBatch.snapshot.items.length} 款</p>
            {!selectedBatch.snapshot.items.length && <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">此批次还没有添加商品</p>}
            {selectedBatch.snapshot.items.map(item => {
              const tasks = item.tasks.filter(task => task.resultStatus !== 'superseded');
              const images = tasks.filter(isUsableWorkshopResult);
              const copy = item.copywriting as { title?: unknown; content?: unknown } | undefined;
              const hasCopy = typeof copy?.title === 'string' && copy.title.trim() && typeof copy.content === 'string' && copy.content.trim();
              const thumb = images[0]?.resultUrl || item.selectedProductImages[0] || item.coverImage;
              return <article key={item.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
                {thumb ? <LazyProxyImage src={thumb} alt={item.title || '商品预览'} className="h-16 w-16 shrink-0 rounded-lg border border-slate-100 object-cover" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100"><ImageIcon className="h-5 w-5 text-slate-300" /></div>}
                <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold text-slate-800" title={item.title}>{item.title || item.itemId}</p><p className="mt-1 text-[11px] text-slate-400">SKU {item.itemId}</p><p className="mt-1 text-xs text-slate-500">{tasks.length ? `成图 ${images.length}/${tasks.length} 张` : '尚未生成'} · {hasCopy ? '文案已完成' : '文案待完善'}</p></div>
              </article>;
            })}
          </div> : <div className="space-y-3">
            {visible.length === 0 && <div className="py-16 text-center"><Archive className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-4 text-sm font-semibold text-slate-600">{query ? '没有找到匹配的批次' : '暂无历史记录'}</p><p className="mt-2 text-xs text-slate-400">{query ? '试试其他名称或清除搜索条件' : '完成并归档的批次会保存在这里'}</p></div>}
            {visible.map(batch => <article key={batch.id} className={`rounded-2xl border bg-white p-4 sm:p-5 ${batch.id === activeBatch?.id ? 'border-indigo-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-bold text-slate-900">{batch.name}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${batch.id === activeBatch?.id ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{statusLabel(batch)}</span></div>
              <p className="mt-2 text-xs text-slate-400">{formatDate(batch.updatedAt)} 更新</p>
              {batch.itemCount ? <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span><b className="text-slate-800">{batch.itemCount}</b> 款商品</span><span title="采集成功且已选用的商品"><b className="text-slate-800">{batch.readyCount}</b> 款可用</span><span><b className="text-slate-800">{batch.taskCount}</b> 个分镜任务</span></div> : <p className="mt-3 text-xs text-slate-400">空白批次 · 尚未添加商品</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><div className="flex gap-3"><button type="button" disabled={isBusy} onClick={() => void viewBatch(batch.id)} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">查看详情</button>{batch.taskCount > 0 && <button type="button" disabled={isBusy} onClick={() => void openGenerationView(batch.id)} className="text-xs font-semibold text-slate-500 hover:text-indigo-600 disabled:opacity-40">生成结果</button>}</div>{more(batch)}</div>
              {editingBatchId === batch.id && editName(batch)}
            </article>)}
          </div>}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:px-7"><p role="status" className="text-[11px] text-slate-400">{isBusy ? '正在处理，请稍候…' : '历史独立保存，查看不会改变当前批次'}</p>{archived.length > 0 && <button type="button" disabled={isBusy} onClick={() => void clearHistory()} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-[11px] text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-3 w-3" />清空历史</button>}</footer>
      </aside>
    </div>, document.body
  );
}
