import { useCallback, useMemo, useRef } from 'react';
import type { WorkshopSnapshot } from '@shared/contracts/workshopWorkspace';
import { toWorkshopSnapshot, type WorkshopLiveState } from '../model/workspace/workshopSnapshot';
import { useWorkshopBatchWorkspace } from './useWorkshopBatchWorkspace';

export function useLiveWorkshopWorkspace(
  state: WorkshopLiveState,
  apply: (snapshot: WorkshopSnapshot) => void,
  getItems: () => WorkshopLiveState['items'],
) {
  const live = useRef(state);
  live.current = state;
  const readSnapshot = useCallback(() => toWorkshopSnapshot({ ...live.current, items: getItems() }), [getItems]);
  const snapshot = useMemo(() => toWorkshopSnapshot({
    promptGroupFolderId: state.promptGroupFolderId,
    currentStage: state.currentStage, batchInputText: state.batchInputText, items: state.items, selectedVisionModel: state.selectedVisionModel, selectedImageGenModel: state.selectedImageGenModel, selectedArchId: state.selectedArchId, selectedQuality: state.selectedQuality, selectedAspect: state.selectedAspect, gridOutputSize: state.gridOutputSize, selectedShotCount: state.selectedShotCount, useAssetLibrary: state.useAssetLibrary, lockedPersonaId: state.lockedPersonaId, lockedSceneId: state.lockedSceneId, lockedOutfitId: state.lockedOutfitId, lockedActionId: state.lockedActionId, lockedFullPromptId: state.lockedFullPromptId, generationStrategy: state.generationStrategy, autoGenerateCopywriting: state.autoGenerateCopywriting, personaMode: state.personaMode, pipelineStatus: state.pipelineStatus, planRevision: state.planRevision, storyboardRevision: state.storyboardRevision, pausedFrom: state.pausedFrom, diversityContext: state.diversityContext, pipelineRuns: state.pipelineRuns
  }), [
    state.currentStage, state.batchInputText, state.items,
    state.selectedVisionModel, state.selectedImageGenModel, state.selectedArchId,
    state.selectedQuality, state.selectedAspect, state.gridOutputSize, state.selectedShotCount,
    state.useAssetLibrary, state.lockedPersonaId, state.lockedSceneId, state.lockedOutfitId,
    state.lockedActionId, state.lockedFullPromptId, state.promptGroupFolderId, state.generationStrategy, state.autoGenerateCopywriting,
    state.personaMode, state.pipelineStatus, state.planRevision, state.storyboardRevision,
    state.pausedFrom, state.diversityContext, state.pipelineRuns,
  ]);
  const restore = useCallback((value: WorkshopSnapshot) => { apply(value); }, [apply]);
  return useWorkshopBatchWorkspace(snapshot, restore, readSnapshot);
}
