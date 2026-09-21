import { useCallback, useMemo } from 'react';
import type { WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';
import type { BatchProductItem, GenerationStrategy } from './batchTypes';
import { useWorkshopBatchWorkspace } from './hooks/useWorkshopBatchWorkspace';

export interface WorkshopLiveState {
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
  autoGenerateCopywriting: boolean;
}

export function toWorkshopSnapshot(state: WorkshopLiveState): WorkshopSnapshot {
  return {
    version: 1,
    mode: 'original',
    currentStage: Math.min(4, Math.max(1, state.currentStage)),
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
      autoGenerateCopywriting: state.autoGenerateCopywriting,
    },
  };
}

export function useLiveWorkshopWorkspace(
  state: WorkshopLiveState,
  apply: (snapshot: WorkshopSnapshot) => void,
) {
  const snapshot = useMemo(() => toWorkshopSnapshot(state), [
    state.currentStage, state.batchInputText, state.items,
    state.selectedVisionModel, state.selectedImageGenModel, state.selectedArchId,
    state.hasHumanPersona, state.selectedQuality, state.selectedAspect, state.selectedShotCount,
    state.useAssetLibrary, state.lockedPersonaId, state.lockedSceneId, state.lockedOutfitId,
    state.lockedActionId, state.generationStrategy, state.autoGenerateCopywriting,
  ]);
  const restore = useCallback((value: WorkshopSnapshot) => { apply(value); }, [apply]);
  return useWorkshopBatchWorkspace(snapshot, restore);
}
