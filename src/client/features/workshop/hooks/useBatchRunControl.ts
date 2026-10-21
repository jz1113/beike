import { useState, useReducer, useRef } from 'react';
import { createRunControl, type RunControl } from '../model/workspace/runControl';
import { acknowledgeUncertainTasks } from '../model/generation/generationHelpers';
import { startAutoPilotPipeline as runAutoPilotPipeline } from '../model/analysis/batchAutoPilot';

type BatchRunControlOptions = Pick<Parameters<typeof runAutoPilotPipeline>[0],
  'successfulItems' | 'getItems' | 'setItems' | 'startBatchVisionAnalyze' | 'setCurrentStage' | 'showToast'
> & {
  isBusy: () => boolean;
  archiveCurrentBatch: () => Promise<void>;
};

export function useBatchRunControl({ successfulItems, getItems, setItems, startBatchVisionAnalyze, setCurrentStage, showToast, isBusy, archiveCurrentBatch }: BatchRunControlOptions) {
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
  const [, notifyRunControlChange] = useReducer((revision: number) => revision + 1, 0);
  const runControlRef = useRef<RunControl>(createRunControl());
  // 全自动生产流水线
  const startAutoPilotPipeline = async () => {
    await runAutoPilotPipeline({
      successfulItems,
      getItems: () => getItems(),
      setItems,
      startBatchVisionAnalyze,
      setCurrentStage,
      showToast,
      setIsAutoPilotRunning,
      isAborted: () => runControlRef.current.status === 'cancelled',
    });
  };

  const pauseRun = () => { runControlRef.current = { status: 'paused' }; notifyRunControlChange(); };
  const resumeRun = () => { runControlRef.current = { status: 'running' }; notifyRunControlChange(); };
  const cancelRun = () => {
    runControlRef.current = { status: 'cancelled' };
    notifyRunControlChange();
  };
  const acknowledgeRecovery = () => {
    if (getItems().some(item => item.tasks.some(task => task.status === 'IN_PROGRESS'))) return;
    if (!window.confirm('原任务可能仍在生成并计费。请优先核对原任务。确定放弃所选商品的待核对结果，允许手动重新生成？这可能重复计费；不会立即发起生图。')) return;
    setItems(acknowledgeUncertainTasks);
    showToast('已确认放弃恢复；可按需点击重新生成，不会自动提交');
  };

  const completeCurrentBatch = async () => {
    if (isBusy()) {
      showToast('仍有任务执行中，请等待结束后再归档本批次');
      return;
    }
    if (!window.confirm('完成本批次后会归档当前内容，并开始一个空白新批次。历史内容可在批次历史中恢复。确定继续吗？')) return;
    try {
      await archiveCurrentBatch();
      showToast('本批次已归档，已开始新的空白批次');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '完成本批次失败');
    }
  };

  return {
    runControlRef, isAutoPilotRunning, startAutoPilotPipeline,
    pauseRun, resumeRun, cancelRun, acknowledgeRecovery, completeCurrentBatch,
  };
}
