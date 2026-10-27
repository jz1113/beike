import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Archive, CheckSquare, ChevronDown, Clock3, Copy, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { BatchPreviewLightbox } from '@client/shared/modals/lightbox/BatchPreviewLightbox';
import { downloadSingleTaskImage } from '../../model/delivery/batchRunnerExport';
import { batchHistoryCode, batchHistoryTitle, filterBatchHistory, type BatchHistoryFilter, type BatchHistorySort } from '../../model/workspace/batchHistory';
import type { BatchDeleteResult } from '../../api/batchManagement';
import { BatchNameDialog } from './BatchNameDialog';
import { BatchHistoryDeleteDialog } from './BatchHistoryDeleteDialog';
import { WorkshopActionMenu, workshopMenuItemClass } from '../layout/WorkshopActionMenu';
import { BatchHistoryProduct, BatchHistoryRecord, BatchHistoryStats, BatchHistoryArchiveLabel, formatBatchHistoryDate } from './BatchHistoryContent';
import type { WorkshopBatchSummary } from '@shared/contracts/workshopBatches';
import type { WorkshopBatch } from '@shared/workshopSnapshot';
import './batchHistory.css';

interface Props {
  activeBatch: WorkshopBatch | null;
  historyBatches: WorkshopBatchSummary[];
  historyLoading: boolean;
  historyError: string;
  productionBusy: boolean;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  onReadBatch: (id: string) => Promise<WorkshopBatch>;
  onOpenGenerationView: (batch: WorkshopBatch) => void;
  onDuplicateBatch: (id: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onDeleteBatches: (ids: string[]) => Promise<BatchDeleteResult>;
  onRenameBatch: (id: string, name: string) => Promise<void>;
  onCreateBatch: () => void;
  onError: (message: string) => void;
}

const filters: { id: BatchHistoryFilter; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'results', label: '有成图' }, { id: 'unfinished', label: '未完成' }, { id: 'failed', label: '有失败' }, { id: 'empty', label: '空批次' },
];

export function BatchHistoryPanel({ activeBatch, historyBatches, historyLoading, historyError, productionBusy, onRefresh, onClose, onReadBatch, onOpenGenerationView, onDuplicateBatch, onClearHistory, onDeleteBatches, onRenameBatch, onCreateBatch, onError }: Props) {
  const [selection, setSelection] = useState<{ id: string; batch?: WorkshopBatch; error?: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BatchHistoryFilter>('all');
  const [sort, setSort] = useState<BatchHistorySort>('recent');
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; title: string } | 'all' | null>(null);
  const [managing, setManaging] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [gallery, setGallery] = useState<{ images: string[]; currentIndex: number; title: string } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const readSequence = useRef(0);
  const selectedBatch = selection?.batch;
  const archived = historyBatches.filter(batch => batch.id !== activeBatch?.id);
  const visible = filterBatchHistory(historyBatches, activeBatch?.id, query, filter, sort);
  const checked = archived.filter(batch => checkedIds.includes(batch.id));
  const emptyBatches = filterBatchHistory(historyBatches, activeBatch?.id, '', 'empty', 'recent');
  const visibleChecked = visible.filter(batch => checkedIds.includes(batch.id)).length;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const requests = readSequence;
    return () => { requests.current++; document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { if (detailRef.current) detailRef.current.scrollTop = 0; }, [selection?.id]);

  const reportError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    setActionError(message);
    onError(message);
  };
  const viewBatch = useCallback(async (id: string, clearError = true) => {
    if (isBusy) return;
    const sequence = ++readSequence.current;
    setSelection({ id }); setEditing(false);
    if (clearError) setActionError('');
    try {
      const batch = await onReadBatch(id);
      if (sequence === readSequence.current) setSelection({ id, batch });
    } catch (error) {
      if (sequence === readSequence.current) setSelection({ id, error: error instanceof Error ? error.message : '历史批次读取失败' });
    }
  }, [isBusy, onReadBatch]);
  const selectionVisible = visible.some(batch => batch.id === selection?.id);
  useEffect(() => {
    if (!historyLoading && !isBusy && selection && !selectionVisible) { readSequence.current++; setSelection(null); }
  }, [selection, selectionVisible, historyLoading, isBusy]);
  const renameFromList = async (id: string) => {
    if (isBusy) return;
    if (selection?.id === id && selectedBatch) { setEditing(true); return; }
    const sequence = ++readSequence.current;
    setIsBusy(true); setActionError(''); setSelection({ id });
    try {
      const batch = await onReadBatch(id);
      if (sequence === readSequence.current) { setSelection({ id, batch }); setEditing(true); }
    } catch (error) { if (sequence === readSequence.current) reportError(error, '历史批次读取失败'); }
    finally { setIsBusy(false); }
  };
  const exitManaging = () => { setManaging(false); setCheckedIds([]); setDeleteTarget(null); };
  const cancelDelete = () => { setDeleteTarget(null); requestAnimationFrame(() => { const previous = returnFocusRef.current; if (previous?.isConnected) previous.focus(); else (panelRef.current?.querySelector<HTMLElement>('.history-manage-toggle') || panelRef.current)?.focus(); }); };
  const requestDelete = (target: NonNullable<typeof deleteTarget>) => { const focused = document.activeElement as HTMLElement | null; returnFocusRef.current = focused?.closest('.history-header-actions')?.querySelector<HTMLElement>('button[aria-expanded]') || focused; setDeleteError(''); setDeleteTarget(target); };
  const toggleChecked = (id: string) => setCheckedIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  const backToList = () => {
    const id = selection?.id;
    readSequence.current++; setSelection(null); setEditing(false); setDeleteTarget(null); setActionError('');
    requestAnimationFrame(() => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-batch-id]') || []).find(row => row.dataset.batchId === id)?.focus());
  };
  const duplicate = async () => {
    if (!selectedBatch || productionBusy || isBusy) return;
    setIsBusy(true); setActionError('');
    try { await onDuplicateBatch(selectedBatch.id); onClose(); }
    catch (error) { reportError(error, '复制批次失败'); }
    finally { setIsBusy(false); }
  };
  const confirmDelete = async () => {
    if (!deleteTarget || isBusy) return;
    setIsBusy(true); setDeleteError(''); setActionError('');
    try {
      if (deleteTarget === 'all') { await onClearHistory(); readSequence.current++; setSelection(null); setCheckedIds([]); }
      else {
        const result = await onDeleteBatches(deleteTarget.ids);
        if (selection && result.deletedIds.includes(selection.id)) { readSequence.current++; setSelection(null); }
        setCheckedIds(previous => previous.filter(id => !result.deletedIds.includes(id)));
        if (result.failures.length) reportError(new Error(`已删除 ${result.deletedIds.length} 个批次，${result.failures.length} 个未删除：${result.failures[0].message}`), '部分批次删除失败');
      }
      cancelDelete();
    } catch (error) {
      const message = error instanceof Error ? error.message : '历史记录删除失败';
      setDeleteError(message); onError(message);
    }
    finally { setIsBusy(false); }
  };
  const saveName = async (name: string) => {
    if (!selectedBatch || isBusy) return;
    setIsBusy(true); setActionError('');
    try {
      await onRenameBatch(selectedBatch.id, name);
      setSelection(previous => previous?.batch ? { ...previous, batch: { ...previous.batch, name } } : previous);
    }
    finally { setIsBusy(false); }
  };
  const hasTasks = selectedBatch?.snapshot.items.some(item => item.tasks.some(task => task.resultStatus !== 'superseded'));

  return createPortal(<>
    <div inert={!!gallery || editing || !!deleteTarget} className="history-overlay" onClick={event => { if (event.target === event.currentTarget && !isBusy) onClose(); }}>
      <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="历史批次" aria-busy={isBusy} className="batch-history"
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && panelRef.current?.querySelector('[aria-expanded="true"]')) return;
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && searchRef.current?.getClientRects().length) { event.preventDefault(); searchRef.current.focus(); searchRef.current.select(); }
          if (event.key === 'Escape' && !isBusy) {
            event.preventDefault(); event.stopPropagation();
            if (document.activeElement === searchRef.current && query) setQuery('');
            else if (managing) exitManaging();
            else if (selection && window.matchMedia('(max-width: 767px)').matches) backToList();
            else onClose();
          }
          if (event.key === 'Tab') {
            const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]') || []).filter(element => element.getClientRects().length > 0);
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <header className="history-header">
          <div className="history-brand"><span className="history-brand-icon"><Clock3 size={19} strokeWidth={1.6} /></span><div className="history-heading"><h2>历史批次</h2><span>查看、续做和整理已保存的批次</span></div><span className="history-count">{archived.length}</span></div>
          <div className="history-header-actions">
            <button type="button" disabled={historyLoading || isBusy} onClick={() => void onRefresh()} aria-label="刷新批次历史" title="刷新" className="history-icon-button"><RefreshCw size={16} strokeWidth={1.6} className={historyLoading ? 'animate-spin' : ''} /></button>
            <button type="button" disabled={isBusy || productionBusy} onClick={onCreateBatch} aria-label="新建批次" className="history-secondary-button history-create"><Plus size={15} /><span>新建批次</span></button>
            <WorkshopActionMenu label="批次操作" icon={<MoreHorizontal size={16} />} disabled={isBusy || historyLoading}>
              <button type="button" className={workshopMenuItemClass} disabled={!archived.length || managing} onClick={() => setManaging(true)}><CheckSquare size={15} />选择批次</button>
              <button type="button" className={workshopMenuItemClass} disabled={!emptyBatches.length} onClick={() => requestDelete({ ids: emptyBatches.map(batch => batch.id), title: `清理 ${emptyBatches.length} 个空批次？` })}><Archive size={15} />清理空批次（{emptyBatches.length}）</button>
              <button type="button" className={workshopMenuItemClass} onClick={() => requestDelete('all')}><Trash2 size={15} />清空全部历史记录</button>
            </WorkshopActionMenu>
            <span className="history-header-divider" />
            <button type="button" disabled={isBusy} onClick={onClose} className="history-icon-button" aria-label="关闭批次历史"><X size={19} strokeWidth={1.6} /></button>
          </div>
        </header>
        {historyError && <div role="alert" className="history-error"><span>{historyError}</span><button disabled={historyLoading} type="button" onClick={() => void onRefresh()}>重新加载</button></div>}
        <div className="history-workspace" data-detail-open={!!selection}>
          <aside aria-label="历史批次列表" className="history-sidebar">
            <div className="history-search-area">
              <label className="history-search"><Search size={16} strokeWidth={1.7} /><input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索批次名称、编号、商品或 SKU" aria-keyshortcuts="Control+f Meta+f" placeholder="搜索批次或商品" />{query && <button type="button" onClick={() => setQuery('')} aria-label="清除搜索"><X size={14} /></button>}</label>
              <div className="history-filters">{filters.map(option => <button key={option.id} type="button" disabled={isBusy} onClick={() => setFilter(option.id)} aria-pressed={filter === option.id}>{option.label}</button>)}</div>
            </div>
            <div className="history-list-toolbar">
              {managing ? <>
                <label className="history-select-all"><input type="checkbox" disabled={isBusy || !visible.length} checked={visible.length > 0 && visibleChecked === visible.length} ref={element => { if (element) element.indeterminate = visibleChecked > 0 && visibleChecked < visible.length; }} onChange={event => setCheckedIds(previous => event.target.checked ? [...new Set([...previous, ...visible.map(batch => batch.id)])] : previous.filter(id => !visible.some(batch => batch.id === id)))} />全选</label>
                <span role="status" className="history-selected-count">已选 {checked.length}</span>
                <button type="button" className="history-selection-delete" disabled={isBusy || !checked.length} onClick={() => requestDelete({ ids: checked.map(batch => batch.id), title: `删除选中的 ${checked.length} 个批次？` })}><Trash2 size={13} />删除</button>
                <button type="button" disabled={isBusy} className="history-manage-toggle" onClick={exitManaging}>完成</button>
              </> : <>
                <span role="status">{historyLoading ? '正在刷新…' : query || filter !== 'all' ? `${visible.length} / ${archived.length} 个批次` : `${visible.length} 个批次`}</span>
                <label className="history-sort"><select disabled={isBusy} value={sort} onChange={event => setSort(event.target.value as BatchHistorySort)} aria-label="批次排序"><option value="recent">最近更新</option><option value="created">最近创建</option><option value="oldest">最早更新</option><option value="name">名称排序</option></select><ChevronDown size={12} /></label>
              </>}
            </div>
            <div ref={listRef} className="history-records" onKeyDown={event => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('button.history-record:not(:disabled), .history-record > input:not(:disabled)') || []);
              const index = rows.indexOf(document.activeElement as HTMLElement);
              if (index < 0) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
              rows[next]?.focus();
            }}>
              {visible.length ? <div className="history-record-list">{visible.map(batch => <BatchHistoryRecord key={batch.id} batch={batch} selected={selection?.id === batch.id} selectionMode={managing} checked={checkedIds.includes(batch.id)} disabled={isBusy} onView={() => managing ? toggleChecked(batch.id) : void viewBatch(batch.id)} onRename={() => void renameFromList(batch.id)} />)}</div>
                : <div className="history-list-empty"><Archive size={28} strokeWidth={1.3} /><p>{historyLoading ? '正在读取历史批次…' : query || filter !== 'all' ? '没有符合条件的批次' : '还没有历史批次'}</p>{(query || filter !== 'all') && <button type="button" onClick={() => { setQuery(''); setFilter('all'); }}>重置搜索与筛选</button>}</div>}
            </div>
            {activeBatch && <button type="button" className="history-current" disabled={isBusy} onClick={onClose} aria-label={`返回当前批次 ${batchHistoryTitle(activeBatch)}`}><span className="history-current-dot" /><span className="history-current-label"><span>当前工作批次</span><span title={batchHistoryTitle(activeBatch)}>{batchHistoryTitle(activeBatch)}</span></span><ArrowRight size={14} /></button>}
          </aside>
          <main className="history-detail">
            {selection && <div className="history-detail-topline"><button type="button" disabled={isBusy} onClick={backToList} className="history-back"><ArrowLeft size={14} />返回列表</button></div>}
            <div ref={detailRef} className="history-detail-scroll">
              {selectedBatch ? <div className="history-detail-content">
                <section key={selectedBatch.id} className="history-overview">
                  <div className="history-title-row"><h3>{batchHistoryTitle(selectedBatch)}</h3><button type="button" disabled={isBusy || managing} onClick={() => setEditing(true)} className="history-secondary-button history-rename-button" aria-label="重命名批次"><Pencil size={13} strokeWidth={1.6} />重命名</button></div>
                  <div className="history-overview-meta"><BatchHistoryArchiveLabel batch={selectedBatch} /><span>更新于 {formatBatchHistoryDate(selectedBatch.updatedAt)}</span><details className="history-metadata"><summary>信息<ChevronDown size={12} /></summary><div><p className="history-batch-code">{batchHistoryCode(selectedBatch)}</p><p>创建于 {formatBatchHistoryDate(selectedBatch.createdAt)}</p><p className="history-batch-id">完整标识 {selectedBatch.id}</p></div></details></div>
                  <BatchHistoryStats batch={selectedBatch} />
                </section>
                <div className="history-section-heading"><h4>商品与成图</h4></div>
                {selectedBatch.snapshot.items.length ? <ul aria-label="历史批次商品" className="history-products">{selectedBatch.snapshot.items.map((item, index) => <BatchHistoryProduct key={item.id} item={item} index={index} onPreview={(images, currentIndex, title) => setGallery({ images, currentIndex, title })} />)}</ul>
                  : <div className="history-empty-batch"><span><Archive size={32} strokeWidth={1.3} /></span><h4>{selectedBatch.snapshot.batchInputText.trim() ? '商品尚未采集' : '这是一个空白批次'}</h4><p>{selectedBatch.snapshot.batchInputText.trim() ? '保留了待采集输入，可复制后继续采集。' : '还没有商品或生成结果。'}</p>{selectedBatch.snapshot.batchInputText.trim() && <pre>{selectedBatch.snapshot.batchInputText}</pre>}</div>}
              </div> : selection ? <div className="history-loading" role={selection.error ? 'alert' : 'status'}>{selection.error ? <><Archive size={32} strokeWidth={1.4} /><p>{selection.error}</p><button type="button" onClick={() => void viewBatch(selection.id)}>重新读取</button></> : <><Loader2 size={24} className="animate-spin" /><p>正在读取批次内容…</p></>}</div>
                : <div className="history-loading"><Archive size={30} strokeWidth={1.4} /><p>{historyLoading ? '正在读取历史批次…' : !archived.length ? '还没有历史批次' : !visible.length ? '没有符合条件的批次' : '选择批次查看内容'}</p>{!historyLoading && archived.length > 0 && visible.length > 0 && <span className="history-loading-hint">从左侧列表选择一个批次，查看商品、成图和交付状态</span>}</div>}
            </div>
            {selectedBatch && !managing && <div className="history-detail-footer"><div className="history-footer-actions"><button type="button" disabled={isBusy} aria-label="删除此批次" title="删除此批次" className="history-icon-button history-delete-button" onClick={() => requestDelete({ ids: [selectedBatch.id], title: '删除此批次？' })}><Trash2 size={16} /></button><button type="button" disabled={isBusy || productionBusy || (!selectedBatch.snapshot.items.length && !selectedBatch.snapshot.batchInputText.trim())} onClick={() => void duplicate()} title={productionBusy ? '当前任务结束后可复制' : '创建副本并继续制作'} className="history-secondary-button"><Copy size={15} strokeWidth={1.7} />{isBusy ? '正在处理…' : '复制续做'}</button><button type="button" disabled={isBusy || !hasTasks} onClick={() => { onOpenGenerationView(selectedBatch); onClose(); }} className="history-primary-button">查看交付<ArrowUpRight size={15} /></button></div></div>}
          </main>
        </div>
        {actionError && !deleteTarget && <footer role="alert" className="history-error"><span>{actionError}</span><button type="button" onClick={() => setActionError('')} aria-label="关闭操作提示"><X size={15} /></button></footer>}
      </section>
    </div>
    {deleteTarget && <BatchHistoryDeleteDialog title={deleteTarget === 'all' ? `删除全部 ${archived.length} 个历史批次？` : deleteTarget.title} names={archived.filter(batch => deleteTarget === 'all' || deleteTarget.ids.includes(batch.id)).map(batch => batchHistoryTitle(batch))} count={deleteTarget === 'all' ? archived.length : deleteTarget.ids.length} busy={isBusy} error={deleteError} onCancel={cancelDelete} onConfirm={() => void confirmDelete()} />}
    {editing && selectedBatch && <BatchNameDialog mode="rename" initialName={batchHistoryTitle(selectedBatch)} onSave={saveName} onClose={() => setEditing(false)} />}
    <BatchPreviewLightbox previewImageUrl={null} previewGallery={gallery} closeGalleryPreview={() => setGallery(null)} setGalleryIndex={index => setGallery(previous => previous ? { ...previous, currentIndex: (index + previous.images.length) % previous.images.length } : null)} handleDownloadSingleTaskImage={(url, name) => { void downloadSingleTaskImage(url, name, message => { setActionError(message); onError(message); }); }} />
  </>, document.body);
}
