import { useEffect, useRef } from 'react';
import type { BatchProductItem } from '../model/batchTypes';
import { recheckWorkshopTask, type GridRecoverySettings } from '../model/generation/recheckWorkshopTask';

/** Resume queries after refresh; this path never submits a new generation. */
export function useWorkshopTaskRecovery(
  ready: boolean,
  batchId: string,
  itemsRef: React.MutableRefObject<BatchProductItem[]>,
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  settings: GridRecoverySettings,
) {
  const liveSettings = useRef(settings);
  liveSettings.current = settings;
  useEffect(() => {
    if (!ready || !batchId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const guardedSetItems: typeof setItems = update => { if (!cancelled) setItems(update); };
    const recover = async () => {
      // Re-read each task after awaiting so retries, edits and removals win.
      const candidates = itemsRef.current.flatMap(item => item.tasks
        .filter(task => task.status === 'FAILURE' && task.recoveryRequired && task.resultStatus !== 'superseded'
          && (task.upstreamTaskId || task.idempotencyKey || task.gridTaskKey || task.gridSourceUrl || item.masterGridUrl))
        .map(task => ({ itemId: item.id, taskId: task.id })));
      for (const candidate of candidates) {
        if (cancelled) return;
        const item = itemsRef.current.find(item => item.id === candidate.itemId);
        const task = item?.tasks.find(task => task.id === candidate.taskId);
        if (!task?.recoveryRequired || task.status !== 'FAILURE' || task.resultStatus === 'superseded') continue;
        await recheckWorkshopTask(candidate.itemId, candidate.taskId, itemsRef.current,
          guardedSetItems, () => {}, liveSettings.current);
      }
      // Stay available for interrupted work appearing later in the same batch.
      // A bounded query window leaves persistent errors to the manual controls.
      if (!cancelled && Date.now() - started < 360_000) timer = setTimeout(() => { void recover(); }, 5000);
    };
    void recover();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ready, batchId, itemsRef, setItems]);
}
