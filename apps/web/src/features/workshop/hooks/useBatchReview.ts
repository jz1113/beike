import { reviewWorkshopTask } from '../api/batchCommands';
import type { BatchProductItem } from '../model/batchTypes';

export function useBatchReview(
  itemsRef: React.MutableRefObject<BatchProductItem[]>,
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  retrySingleShotTask: (itemId: string, shotIndex: number) => Promise<void>,
  showToast: (message: string) => void,
) {
  const reviewTask = (itemId: string, taskId: string, decision: 'accepted' | 'retry_requested' | 'rejected') => {
    setItems((prev) => prev.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        tasks: (item.tasks || []).map((task) => task.id === taskId ? { ...task, outputReview: decision } : task),
      };
    }));
    if (decision === 'retry_requested') {
      const item = itemsRef.current.find((entry) => entry.id === itemId);
      const shotIndex = item?.tasks?.findIndex((task) => task.id === taskId) ?? -1;
      if (shotIndex >= 0) void retrySingleShotTask(itemId, shotIndex);
    }
    void reviewWorkshopTask(taskId, { decision }).catch((error) => {
      showToast(error instanceof Error ? error.message : '审核提交失败');
    });
  };
  return { reviewTask };
}
