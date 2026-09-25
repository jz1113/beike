import { useCallback, useMemo } from 'react';
import type { WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';
import { toWorkshopSnapshot, type WorkshopLiveState } from '../model/workspace/workshopSnapshot';
import { useWorkshopBatchWorkspace } from './useWorkshopBatchWorkspace';

export function useLiveWorkshopWorkspace(
  state: WorkshopLiveState,
  apply: (snapshot: WorkshopSnapshot) => void,
) {
  const snapshot = useMemo(() => toWorkshopSnapshot(state), [
    state.currentStage, state.batchInputText, state.items,
    state.selectedVisionModel, state.selectedImageGenModel, state.selectedArchId,
    state.selectedQuality, state.selectedAspect, state.selectedShotCount,
    state.useAssetLibrary, state.lockedPersonaId, state.lockedSceneId, state.lockedOutfitId,
    state.lockedActionId, state.lockedFullPromptId, state.generationStrategy, state.autoGenerateCopywriting,
    state.personaMode, state.pipelineStatus, state.planRevision, state.storyboardRevision,
    state.pausedFrom, state.diversityContext, state.pipelineRuns,
  ]);
  const restore = useCallback((value: WorkshopSnapshot) => { apply(value); }, [apply]);
  return useWorkshopBatchWorkspace(snapshot, restore);
}
