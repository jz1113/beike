import type { OutputRating } from '@shared/contracts/categorySkills';
import { useRef, useState } from 'react';
import { reviewWorkshopTask } from '../api/batchCommands';
import type { BatchProductItem } from '../model/batchTypes';
import { isDeliverableWorkshopResult, isUsableWorkshopResult } from '../model/generation/workshopReadiness';

export function useBatchReview(
  itemsRef: React.MutableRefObject<BatchProductItem[]>,
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  retrySingleShotTask: (itemId: string, shotIndex: number) => Promise<void>,
  showToast: (message: string) => void,
  ensureSaved: () => Promise<boolean>,
) {
  const pending = useRef(new Set<string>());
  const batchReviewPending = useRef(false);
  const [isReviewingOutputs, setIsReviewingOutputs] = useState(false);
  const submitReview = async (itemId: string, taskId: string, decision: 'accepted' | 'retry_requested' | 'rejected', rating?: OutputRating): Promise<boolean> => {
    if (pending.current.has(taskId)) return false;
    const task = itemsRef.current.find(item => item.id === itemId)?.tasks.find(task => task.id === taskId);
    if (!task || !isUsableWorkshopResult(task)) return false;
    const previous = task.outputReview;
    const matches = (entry: typeof task) => entry.id === taskId && entry.idempotencyKey === task.idempotencyKey && entry.resultUrl === task.resultUrl;
    pending.current.add(taskId);
    setIsReviewingOutputs(true);
    // Apply the exclusion immediately; keep the same image visible for re-review.
    setItems(items => items.map(item => item.id === itemId
      ? { ...item, tasks: item.tasks.map(entry => matches(entry) ? { ...entry, outputReview: decision, outputRating: rating || entry.outputRating } : entry) } : item));
    try {
      // New results may not yet exist in the server's autosaved snapshot.
      if (!await ensureSaved()) throw new Error('请先确认批次保存成功，再审核成图');
      await reviewWorkshopTask(taskId, { decision, ...(rating || task.outputRating) });
      if (decision === 'retry_requested') {
        const item = itemsRef.current.find(entry => entry.id === itemId);
        const index = item?.tasks.findIndex(matches) ?? -1;
        if (index >= 0) await retrySingleShotTask(itemId, index);
      }
      return true;
    } catch (error) {
      setItems(items => items.map(item => item.id === itemId
        ? { ...item, tasks: item.tasks.map(entry => matches(entry) && entry.outputReview === decision ? { ...entry, outputReview: previous || 'unreviewed', outputRating: task.outputRating } : entry) } : item));
      showToast(error instanceof Error ? error.message : '审核提交失败');
      return false;
    } finally {
      pending.current.delete(taskId);
      setIsReviewingOutputs(batchReviewPending.current || pending.current.size > 0);
    }
  };
  const reviewTask = (itemId: string, taskId: string, decision: 'accepted' | 'retry_requested' | 'rejected', rating?: OutputRating) => {
    if (batchReviewPending.current) return Promise.resolve(false);
    return submitReview(itemId, taskId, decision, rating);
  };
  const reviewBatch = async (decision: 'accepted' | 'rejected'): Promise<boolean> => {
    if (batchReviewPending.current || pending.current.size > 0) return false;
    const targets = itemsRef.current.filter(item => item.selected && item.status === 'success').flatMap(item =>
      item.tasks.filter(decision === 'accepted' ? isDeliverableWorkshopResult : isUsableWorkshopResult)
        .map(task => ({ itemId: item.id, taskId: task.id })));
    if (targets.length === 0) {
      showToast(decision === 'accepted' ? '请先选择至少一张采用的成图' : '暂无可审核的成图');
      return false;
    }
    batchReviewPending.current = true;
    setIsReviewingOutputs(true);
    try {
      // Save and submit each review in order so pending decisions cannot overtake each other.
      for (const target of targets) {
        if (!await submitReview(target.itemId, target.taskId, decision)) return false;
      }
      showToast(decision === 'accepted' ? `审核通过，已采用 ${targets.length} 张成图` : `审核驳回，${targets.length} 张成图已设为不采用`);
      return true;
    } finally {
      batchReviewPending.current = false;
      setIsReviewingOutputs(pending.current.size > 0);
    }
  };
  return { reviewTask, reviewBatch, isReviewingOutputs };
}
