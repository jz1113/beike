import { useEffect, useRef } from 'react';
import { useAppStore } from '@client/store';
import type { BatchProductItem } from '../model/batchTypes';

function maxStageForItems(items: BatchProductItem[]): number {
  // Failed/uncertain tasks also belong to delivery; do not hide their recovery controls on refresh.
  if (items.some(item => (item.tasks || []).length > 0)) return 4;
  if (items.some((item) => (item.prompts || []).length > 0)) return 3;
  if (items.some((item) => item.status === 'success')) return 2;
  return 1;
}

/** 批次阶段写入 URL，打开时只采纳不超过当前内容允许的 step。 */
export function useWorkspaceSnapshotSync(
  ready: boolean,
  currentStage: number,
  setCurrentStage: (stage: number) => void,
  itemsRef: React.MutableRefObject<BatchProductItem[]>,
) {
  const setBatchStage = useAppStore((s) => s.setBatchStage);
  const appliedUrlStep = useRef(false);
  const entryStep = useRef(useAppStore.getState().pendingFreshWorkshopEntry
    ? null
    : new URLSearchParams(window.location.search).get('step'));

  useEffect(() => {
    if (!ready || appliedUrlStep.current) return;
    appliedUrlStep.current = true;
    if (entryStep.current === null) return;
    const requested = Number(entryStep.current);
    if (!Number.isInteger(requested)) return;
    const allowed = maxStageForItems(itemsRef.current);
    const next = requested >= 1 && requested <= allowed ? requested : 1;
    setCurrentStage(next);
    setBatchStage(next);
  }, [ready, itemsRef, setCurrentStage, setBatchStage]);

  useEffect(() => {
    if (!ready) return;
    setBatchStage(currentStage);
  }, [currentStage, ready, setBatchStage]);
}
