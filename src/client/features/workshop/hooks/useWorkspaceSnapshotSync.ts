import { useEffect, useRef } from 'react';
import { useAppStore } from '@client/store';
/** 批次阶段写入 URL，打开时只采纳不超过当前内容允许的 step。 */
export function useWorkspaceSnapshotSync(
  ready: boolean,
  currentStage: number,
  setCurrentStage: (stage: number) => void,
  reasonForStage: (stage: number) => string | null,
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
    const next = reasonForStage(requested) ? currentStage : requested;
    setCurrentStage(next);
    setBatchStage(next);
  }, [ready, currentStage, reasonForStage, setCurrentStage, setBatchStage]);

  useEffect(() => {
    if (!ready) return;
    setBatchStage(currentStage);
  }, [currentStage, ready, setBatchStage]);
}
