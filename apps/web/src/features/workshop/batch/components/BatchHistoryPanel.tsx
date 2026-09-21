import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
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
    } catch (error) {
      onError(error instanceof Error ? error.message : '批次命名失败');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/20" role="dialog" aria-modal="true" aria-label="批次历史">
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">批次历史</h2>
            <p className="mt-1 text-xs text-slate-500">历史内容独立保存，不会出现在当前 SKU 清单。</p>
          </div>
          <div className="flex items-center gap-1">
            {historyBatches.some(batch => batch.id !== activeBatch?.id) && <button type="button" disabled={isBusy} onClick={() => void clearHistory()} className="rounded-lg px-2 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50">清空历史</button>}
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="关闭批次历史"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {selectedBatch ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-base font-black text-slate-900">{selectedBatch.name}</p>
                <p className="mt-1 text-xs text-slate-500">{selectedBatch.snapshot.items.length} 款商品 · {selectedBatch.status === 'archived' ? '已归档' : selectedBatch.status}</p>
              </div>
              <button type="button" disabled={isBusy} onClick={() => void duplicate(selectedBatch.id)} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">复制为新批次</button>
            </div>
            <button type="button" disabled={isBusy} onClick={() => void openGenerationView(selectedBatch.id)} className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">进入生成界面查看</button>
            <div className="space-y-2">
              {selectedBatch.snapshot.items.map(item => (
                <article key={item.id} className="flex gap-3 rounded-xl border border-slate-200 p-3">
                  {item.coverImage ? <img src={item.coverImage} alt="" className="h-12 w-12 rounded-lg border border-slate-100 object-cover" /> : <div className="h-12 w-12 rounded-lg bg-slate-100" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{item.title || item.itemId}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.status === 'success' ? '采编完成' : item.status === 'failed' ? '采编失败' : '未完成'} · {item.tasks.filter(task => task.status === 'SUCCESS').length}/{item.tasks.length} 张已生成</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {historyBatches.map(batch => (
              <article key={batch.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {editingBatchId === batch.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={draftName}
                          maxLength={120}
                          onChange={(event) => setDraftName(event.target.value)}
                          onKeyDown={(event) => { if (event.key === 'Enter') void saveName(batch.id); if (event.key === 'Escape') setEditingBatchId(null); }}
                          className="h-8 min-w-0 rounded-lg border border-indigo-200 px-2 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500"
                          aria-label="批次名称"
                        />
                        <button type="button" disabled={isBusy} onClick={() => void saveName(batch.id)} className="shrink-0 text-xs font-bold text-indigo-700 disabled:opacity-50">保存</button>
                        <button type="button" disabled={isBusy} onClick={() => setEditingBatchId(null)} className="shrink-0 text-xs font-bold text-slate-500 disabled:opacity-50">取消</button>
                      </div>
                    ) : <p className="truncate text-sm font-black text-slate-900">{batch.name}</p>}
                    <p className="mt-1 text-xs text-slate-500">{new Date(batch.updatedAt).toLocaleString()} · {batch.itemCount} 款商品 · {batch.readyCount} 款就绪</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${batch.id === activeBatch?.id ? 'bg-indigo-50 text-indigo-700' : batch.status === 'archived' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>{batch.id === activeBatch?.id ? '当前批次' : batch.status === 'archived' ? '已归档' : '进行中'}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={isBusy} onClick={() => void viewBatch(batch.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">查看</button>
                  <button type="button" disabled={isBusy} onClick={() => void openGenerationView(batch.id)} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">查看生成</button>
                  {editingBatchId !== batch.id && <button type="button" disabled={isBusy} onClick={() => { setDraftName(batch.name.startsWith('未命名') ? '' : batch.name); setEditingBatchId(batch.id); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-3 w-3" /> 命名</button>}
                  {batch.id !== activeBatch?.id && <button type="button" disabled={isBusy} onClick={() => void duplicate(batch.id)} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">复制为新批次</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
