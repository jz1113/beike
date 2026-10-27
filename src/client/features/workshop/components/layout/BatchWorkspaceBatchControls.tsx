import { useEffect, useRef, useState } from 'react';
import type { WorkshopBatchSummary } from '@shared/contracts/workshopBatches';
import type { WorkshopBatch } from '@shared/workshopSnapshot';
import { BatchHistoryPanel } from '../history/BatchHistoryPanel';
import { BatchNameDialog } from '../history/BatchNameDialog';
import { batchHistoryTitle } from '../../model/workspace/batchHistory';
import type { BatchDeleteResult } from '../../api/batchManagement';
import { Layers3, Pencil } from 'lucide-react';
import { useWorkshopDockActions } from './WorkshopDockActionsContext';

interface Props {
  activeBatch: WorkshopBatch | null;
  historyBatches: WorkshopBatchSummary[];
  itemsCount: number;
  batchInputText: string;
  currentStage: number;
  ready: boolean;
  busy: boolean;
  createNewBatch: (name?: string) => Promise<void>;
  refreshHistory: () => Promise<WorkshopBatchSummary[]>;
  duplicateBatch: (id: string) => Promise<void>;
  clearHistory: () => Promise<number>;
  deleteHistoryBatches: (ids: string[]) => Promise<BatchDeleteResult>;
  renameBatch: (id: string, name: string) => Promise<void>;
  readBatch: (id: string) => Promise<WorkshopBatch>;
  onOpenGenerationView: (batch: WorkshopBatch) => void;
  showToast: (message: string) => void;
}

export function BatchWorkspaceBatchControls({
  activeBatch, historyBatches, itemsCount, batchInputText, currentStage, ready, busy,
  createNewBatch, refreshHistory, duplicateBatch, clearHistory, deleteHistoryBatches, renameBatch, readBatch, onOpenGenerationView, showToast,
}: Props) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [nameMode, setNameMode] = useState<'create' | 'rename' | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const { setActions } = useWorkshopDockActions();

  const loadHistory = async () => {
    setHistoryLoading(true); setHistoryError('');
    try { await refreshHistory(); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : '历史批次读取失败'); }
    finally { setHistoryLoading(false); }
  };
  const openHistory = () => {
    setIsHistoryOpen(true);
    void loadHistory();
  };

  const requestNew = () => {
    if (busy) { showToast('任务执行中，请等待结束后再新建批次'); return; }
    setNameMode('create');
  };
  const reuseEmpty = itemsCount === 0 && currentStage === 1 && !batchInputText.trim();
  const saveName = async (name: string) => {
    setIsRunning(true);
    try {
      if (nameMode === 'rename' || reuseEmpty) {
        if (!activeBatch) throw new Error('当前批次尚未就绪，请稍后重试');
        const nextName = name || batchHistoryTitle({ ...activeBatch, name: '未命名新批次' });
        if (nextName !== activeBatch.name) await renameBatch(activeBatch.id, nextName);
      } else await createNewBatch(name || undefined);
      showToast(nameMode === 'rename' ? '批次名称已保存' : '新批次已就绪');
    } finally { setIsRunning(false); }
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
      {activeBatch && <div className="batch-workspace-identity">
        <Layers3 size={15} /><span className="batch-workspace-label">当前批次</span>
        <button type="button" disabled={!ready || isRunning} onClick={() => setNameMode('rename')} className="batch-workspace-name" title="编辑当前批次名称"><span>{batchHistoryTitle(activeBatch)}</span><Pencil size={12} /></button>
      </div>}
      {isHistoryOpen && (
        <BatchHistoryPanel
          activeBatch={activeBatch}
          historyBatches={historyBatches}
          historyLoading={historyLoading}
          historyError={historyError}
          productionBusy={busy}
          onRefresh={loadHistory}
          onClose={() => setIsHistoryOpen(false)}
          onReadBatch={readBatch}
          onOpenGenerationView={onOpenGenerationView}
          onDuplicateBatch={duplicateBatch}
          onClearHistory={async () => {
            const deleted = await clearHistory();
            showToast(deleted > 0 ? `已清空 ${deleted} 个历史批次` : '没有可清空的历史批次');
          }}
          onDeleteBatches={deleteHistoryBatches}
          onRenameBatch={renameBatch}
          onCreateBatch={() => { setIsHistoryOpen(false); requestNew(); }}
          onError={showToast}
        />
      )}
      {nameMode && <BatchNameDialog mode={nameMode} initialName={nameMode === 'rename' && activeBatch ? batchHistoryTitle(activeBatch) : ''} reuseEmpty={reuseEmpty} onSave={saveName} onClose={() => setNameMode(null)} />}
    </>
  );
}
