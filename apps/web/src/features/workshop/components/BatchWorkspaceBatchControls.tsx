import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, Plus } from 'lucide-react';
import type { WorkshopBatch, WorkshopBatchSummary } from '@beike/contracts/workshopBatches';
import { BatchHistoryPanel } from './BatchHistoryPanel';

interface Props {
  activeBatch: WorkshopBatch | null;
  historyBatches: WorkshopBatchSummary[];
  itemsCount: number;
  currentStage: number;
  ready: boolean;
  createNewBatch: () => Promise<void>;
  refreshHistory: () => Promise<WorkshopBatchSummary[]>;
  duplicateBatch: (id: string) => Promise<void>;
  clearHistory: () => Promise<number>;
  deleteHistoryBatch: (id: string) => Promise<void>;
  renameBatch: (id: string, name: string) => Promise<void>;
  readBatch: (id: string) => Promise<WorkshopBatch>;
  onOpenGenerationView: (batch: WorkshopBatch) => void;
  showToast: (message: string) => void;
}

export function BatchWorkspaceBatchControls({
  activeBatch, historyBatches, itemsCount, currentStage, ready,
  createNewBatch, refreshHistory, duplicateBatch, clearHistory, deleteHistoryBatch, renameBatch, readBatch, onOpenGenerationView, showToast,
}: Props) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [newBatchTarget, setNewBatchTarget] = useState<HTMLElement | null>(null);
  const [historyTarget, setHistoryTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setNewBatchTarget(document.getElementById('workshop-batch-new-anchor'));
    setHistoryTarget(document.getElementById('workshop-batch-history-anchor'));
  }, []);

  const run = async (action: () => Promise<void>) => {
    setIsRunning(true);
    try {
      await action();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '批次操作失败，请重试');
    } finally {
      setIsRunning(false);
    }
  };

  const openHistory = () => {
    void refreshHistory().catch(error => showToast(error instanceof Error ? error.message : '历史批次读取失败'));
    setIsHistoryOpen(true);
  };

  return (
    <>
      {newBatchTarget && createPortal(
        <button
          type="button"
          disabled={!ready || isRunning}
          onClick={() => {
            if (itemsCount === 0 && currentStage === 1) {
              showToast('当前已经是空白新批次，可以直接输入 SKU');
              return;
            }
            if (!window.confirm('新建批次会保留当前内容到历史，并切换到空白批次。确定继续吗？')) return;
            void run(createNewBatch);
          }}
          aria-label="新建批次"
          title="新建批次"
          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm transition-[transform,colors,box-shadow] duration-200 ease-out hover:scale-110 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          <Plus className="h-4 w-4" />
        </button>
      , newBatchTarget)}

      {historyTarget && createPortal(
        <button
          type="button"
          disabled={!ready || isRunning}
          onClick={openHistory}
          aria-label="批次历史"
          title="批次历史"
          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm transition-[transform,colors,box-shadow] duration-200 ease-out hover:scale-110 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          <History className="h-4 w-4" />
        </button>
      , historyTarget)}

      {isHistoryOpen && (
        <BatchHistoryPanel
          activeBatch={activeBatch}
          historyBatches={historyBatches}
          onClose={() => setIsHistoryOpen(false)}
          onReadBatch={readBatch}
          onOpenGenerationView={onOpenGenerationView}
          onDuplicateBatch={duplicateBatch}
          onClearHistory={async () => {
            const deleted = await clearHistory();
            showToast(deleted > 0 ? `已清空 ${deleted} 个历史批次` : '没有可清空的历史批次');
          }}
          onDeleteBatch={async id => { await deleteHistoryBatch(id); showToast('已删除该条历史记录'); }}
          onRenameBatch={renameBatch}
          onError={showToast}
        />
      )}

    </>
  );
}
