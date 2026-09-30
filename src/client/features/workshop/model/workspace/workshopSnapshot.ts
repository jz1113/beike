import type { WorkshopSnapshot } from '@shared/contracts/workshopWorkspace';
import type { PreviousGroupSignature } from '@shared/domain/prompts/vision';
import type { BatchProductItem, GenerationStrategy } from '../batchTypes';
import { sanitizeBatchItem } from './snapshotSanitize';

export interface WorkshopLiveState {
  currentStage: number;
  batchInputText: string;
  items: BatchProductItem[];
  selectedVisionModel: string;
  selectedImageGenModel: string;
  selectedArchId: string;
  selectedQuality: 'high' | 'medium' | 'low';
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  gridOutputSize?: string;
  selectedShotCount: number;
  useAssetLibrary: boolean;
  lockedPersonaId: string;
  lockedSceneId: string;
  lockedOutfitId: string;
  lockedActionId: string;
  lockedFullPromptId?: string;
  promptGroupFolderId?: string;
  generationStrategy: GenerationStrategy;
  autoGenerateCopywriting: boolean;
  personaMode?: 'asset_driven' | 'none';
  pipelineStatus?: string;
  planRevision?: number;
  storyboardRevision?: number;
  pausedFrom?: string;
  diversityContext?: {
    groupSignatures: PreviousGroupSignature[];
    actionIds: string[];
    sceneIds: string[];
  };
  pipelineRuns?: WorkshopSnapshot['pipeline']['runs'];
}

export function toWorkshopSnapshot(state: WorkshopLiveState): WorkshopSnapshot {
  const pipelineStatus = (state.pipelineStatus || 'draft') as WorkshopSnapshot['pipeline']['status'];
  return {
    version: 2,
    mode: 'original',
    currentStage: Math.min(4, Math.max(1, state.currentStage)),
    batchInputText: state.batchInputText,
    items: state.items.map((item) => sanitizeBatchItem(item) as WorkshopSnapshot['items'][number]),
    settings: {
      selectedVisionModel: state.selectedVisionModel,
      selectedImageGenModel: state.selectedImageGenModel,
      selectedArchId: state.selectedArchId,
      hasHumanPersona: true,
      personaMode: state.personaMode || 'asset_driven',
      selectedQuality: state.selectedQuality,
      selectedAspect: state.selectedAspect,
      gridOutputSize: state.gridOutputSize,
      selectedShotCount: state.selectedShotCount,
      useAssetLibrary: state.useAssetLibrary,
      lockedPersonaId: state.lockedPersonaId || 'auto',
      lockedSceneId: state.lockedSceneId || 'auto',
      lockedOutfitId: state.lockedOutfitId || 'auto',
      lockedActionId: state.lockedActionId || 'auto',
      lockedFullPromptId: state.lockedFullPromptId || 'auto',
      promptGroupFolderId: state.promptGroupFolderId || 'auto',
      generationStrategy: state.generationStrategy,
      autoGenerateCopywriting: state.autoGenerateCopywriting,
    },
    pipeline: {
      status: pipelineStatus,
      pausedFrom: state.pausedFrom as WorkshopSnapshot['pipeline']['pausedFrom'],
      planRevision: state.planRevision || 0,
      storyboardRevision: state.storyboardRevision || 0,
      diversityContext: {
        groupSignatures: state.diversityContext?.groupSignatures || [],
        actionIds: state.diversityContext?.actionIds || [],
        sceneIds: state.diversityContext?.sceneIds || [],
      },
      runs: state.pipelineRuns || [],
    },
  };
}
