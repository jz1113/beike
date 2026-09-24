import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store';
import type { BatchProductItem } from '../model/batchTypes';

function maxStageForItems(items: BatchProductItem[]): number {
  const hasImages = items.some((item) => (item.tasks || []).some((task) => task.status === 'SUCCESS' && Boolean(task.resultUrl) && !String(task.resultUrl).startsWith('blob:')));
  if (hasImages) return 4;
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

  useEffect(() => {
    if (!ready || appliedUrlStep.current) return;
    appliedUrlStep.current = true;
    const requested = Number(new URLSearchParams(window.location.search).get('step'));
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
