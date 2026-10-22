import type { OutputRating } from '@shared/contracts/categorySkills';
import { useRef } from 'react';
import { reviewWorkshopTask } from '../api/batchCommands';
import type { BatchProductItem } from '../model/batchTypes';

export function useBatchReview(
  itemsRef: React.MutableRefObject<BatchProductItem[]>,
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  retrySingleShotTask: (itemId: string, shotIndex: number) => Promise<void>,
  showToast: (message: string) => void,
  ensureSaved: () => Promise<boolean>,
) {
  const pending = useRef(new Set<string>());
  const reviewTask = (itemId: string, taskId: string, decision: 'accepted' | 'retry_requested' | 'rejected', rating?: OutputRating) => {
    if (pending.current.has(taskId)) return;
    const task = itemsRef.current.find(item => item.id === itemId)?.tasks.find(task => task.id === taskId);
    if (!task || task.status !== 'SUCCESS' || task.resultStatus === 'superseded') return;
    const previous = task.outputReview;
    const matches = (entry: typeof task) => entry.id === taskId && entry.idempotencyKey === task.idempotencyKey && entry.resultUrl === task.resultUrl;
    pending.current.add(taskId);
    void (async () => {
      try {
        // New results may not yet exist in the server's autosaved snapshot.
        if (!await ensureSaved()) throw new Error('请先确认批次保存成功，再审核成图');
        await reviewWorkshopTask(taskId, { decision, ...(rating || task.outputRating) });
        setItems(items => items.map(item => item.id === itemId
          ? { ...item, tasks: item.tasks.map(entry => matches(entry) ? { ...entry, outputReview: decision, outputRating: rating || entry.outputRating } : entry) } : item));
        if (decision === 'retry_requested') {
          const item = itemsRef.current.find(entry => entry.id === itemId);
          const index = item?.tasks.findIndex(matches) ?? -1;
          if (index >= 0) await retrySingleShotTask(itemId, index);
        }
      } catch (error) {
        setItems(items => items.map(item => item.id === itemId
          ? { ...item, tasks: item.tasks.map(entry => matches(entry) && entry.outputReview === decision ? { ...entry, outputReview: previous || 'unreviewed' } : entry) } : item));
        showToast(error instanceof Error ? error.message : '审核提交失败');
      } finally { pending.current.delete(taskId); }
    })();
  };
  return { reviewTask };
}
