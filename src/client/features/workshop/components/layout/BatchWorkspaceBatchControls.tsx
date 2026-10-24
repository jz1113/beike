import { useEffect, useRef, useState } from 'react';
import type { WorkshopBatchSummary } from '@shared/contracts/workshopBatches';
import type { WorkshopBatch } from '@shared/workshopSnapshot';
import { BatchHistoryPanel } from '../history/BatchHistoryPanel';
import { useWorkshopDockActions } from './WorkshopDockActionsContext';

interface Props {
  activeBatch: WorkshopBatch | null;
  historyBatches: WorkshopBatchSummary[];
  itemsCount: number;
  batchInputText: string;
  currentStage: number;
  ready: boolean;
  busy: boolean;
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
  activeBatch, historyBatches, itemsCount, batchInputText, currentStage, ready, busy,
  createNewBatch, refreshHistory, duplicateBatch, clearHistory, deleteHistoryBatch, renameBatch, readBatch, onOpenGenerationView, showToast,
}: Props) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const { setActions } = useWorkshopDockActions();

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

  const requestNew = () => {
    if (busy) { showToast('任务执行中，请等待结束后再新建批次'); return; }
    if (itemsCount === 0 && currentStage === 1 && !batchInputText.trim()) {
      showToast('当前已经是空白新批次，可以直接输入 SKU');
      return;
    }
    if (!window.confirm('新建批次会保留当前内容到历史，并切换到空白批次。确定继续吗？')) return;
    void run(createNewBatch);
  };
  // The toolbar lives above this view; stable callbacks read the current batch state.
  const handlersRef = useRef({ requestNew, openHistory });
  handlersRef.current = { requestNew, openHistory };
  useEffect(() => {
    setActions({
      onCreate: () => handlersRef.current.requestNew(),
      onHistory: () => handlersRef.current.openHistory(),
      disabled: true, createDisabled: true,
    });
    return () => setActions(null);
  }, [setActions]);
  useEffect(() => {
    setActions(current => current && (current.disabled !== (!ready || isRunning) || current.createDisabled !== (!ready || isRunning || busy))
      ? { ...current, disabled: !ready || isRunning, createDisabled: !ready || isRunning || busy } : current);
  }, [ready, isRunning, busy, setActions]);

  return (
    <>
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
