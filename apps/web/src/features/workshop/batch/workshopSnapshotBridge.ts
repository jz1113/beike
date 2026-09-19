import { useCallback, useMemo } from 'react';
import type { WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';
import type { BatchProductItem, GenerationStrategy } from './batchTypes';
import { useWorkshopWorkspace } from './hooks/useWorkshopWorkspace';

export interface WorkshopLiveState {
  batchMode: 'original' | 'replication';
  currentStage: number;
  batchInputText: string;
  items: BatchProductItem[];
  selectedVisionModel: string;
  selectedImageGenModel: string;
  selectedArchId: string;
  hasHumanPersona: boolean;
  selectedQuality: 'high' | 'medium' | 'low';
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  selectedShotCount: number;
  useAssetLibrary: boolean;
  lockedPersonaId: string;
  lockedSceneId: string;
  lockedOutfitId: string;
  lockedActionId: string;
  generationStrategy: GenerationStrategy;
  replicationInputMode: 'one_to_one' | 'matrix';
  matrixMasterRefUrl: string;
  matrixMasterRefImages: string[];
}

export function toWorkshopSnapshot(state: WorkshopLiveState): WorkshopSnapshot {
  return {
    version: 1,
    mode: state.batchMode,
    currentStage: Math.min(5, Math.max(1, state.currentStage)),
    batchInputText: state.batchInputText,
    items: state.items as WorkshopSnapshot['items'],
    settings: {
      selectedVisionModel: state.selectedVisionModel,
      selectedImageGenModel: state.selectedImageGenModel,
      selectedArchId: state.selectedArchId,
      hasHumanPersona: state.hasHumanPersona,
      selectedQuality: state.selectedQuality,
      selectedAspect: state.selectedAspect,
      selectedShotCount: state.selectedShotCount,
      useAssetLibrary: state.useAssetLibrary,
      lockedPersonaId: state.lockedPersonaId,
      lockedSceneId: state.lockedSceneId,
      lockedOutfitId: state.lockedOutfitId,
      lockedActionId: state.lockedActionId,
      generationStrategy: state.generationStrategy,
      replicationInputMode: state.replicationInputMode,
      matrixMasterRefUrl: state.matrixMasterRefUrl,
      matrixMasterRefImages: state.matrixMasterRefImages,
    },
  };
}

export function useLiveWorkshopWorkspace(
  state: WorkshopLiveState,
  apply: (snapshot: WorkshopSnapshot) => void,
) {
  const snapshot = useMemo(() => toWorkshopSnapshot(state), [
    state.batchMode, state.currentStage, state.batchInputText, state.items,
    state.selectedVisionModel, state.selectedImageGenModel, state.selectedArchId,
    state.hasHumanPersona, state.selectedQuality, state.selectedAspect, state.selectedShotCount,
    state.useAssetLibrary, state.lockedPersonaId, state.lockedSceneId, state.lockedOutfitId,
    state.lockedActionId, state.generationStrategy, state.replicationInputMode,
    state.matrixMasterRefUrl, state.matrixMasterRefImages,
  ]);
  const restore = useCallback((value: WorkshopSnapshot) => { apply(value); }, [apply]);
  return useWorkshopWorkspace(snapshot, restore);
}
