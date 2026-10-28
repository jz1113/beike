import type { MutableRefObject } from 'react';
import { readEffectiveModalityModels } from '@shared/domain/models/modalityStorage';
import { eligibleSalesImages } from '@shared/domain/sales';
import type { VideoSalesStudioState } from './salesStudioDraft';
import { invalidateSalesState } from './salesStageRules';

interface AutoWorkflowStages {
  runAssets: () => Promise<boolean>;
  autoConfirmAssets: () => boolean;
  runFinalize: () => Promise<boolean>;
}

export function createAutomaticSalesWorkflow(input: {
  busyRef: MutableRefObject<{ collecting: boolean; planning: boolean; rendering: boolean; uploading: boolean }>;
  stateRef: MutableRefObject<VideoSalesStudioState>;
  autoRunRef: MutableRefObject<boolean>;
  commit: (recipe: (previous: VideoSalesStudioState) => VideoSalesStudioState) => void;
  setError: (error: string | null) => void;
  setIsRunning: (running: boolean) => void;
  runPlan: () => Promise<boolean>;
  runRender: () => Promise<boolean>;
  stages: AutoWorkflowStages;
}): () => Promise<boolean> {
  return async () => {
    const { busyRef, stateRef, autoRunRef, commit, setError, setIsRunning, runPlan, runRender, stages } = input;
    if (autoRunRef.current || busyRef.current.collecting || busyRef.current.uploading || busyRef.current.rendering) return false;
    const selected = eligibleSalesImages(stateRef.current.imageCatalog, stateRef.current.colorSelection, stateRef.current.variantMetadata);
    if (!selected.length || !stateRef.current.productName.trim()) return false;
    autoRunRef.current = true;
    setIsRunning(true);
    setError(null);
    try {
      const current = stateRef.current;
      const defaultModel = (kind: 'chat' | 'image' | 'video') => {
        const models = readEffectiveModalityModels(kind).models;
        return models.find((model) => model.isDefault)?.id || models[0]?.id || '';
      };
      const defaults = {
        selectedChatModel: current.selectedChatModel || defaultModel('chat'),
        selectedImageModel: current.selectedImageModel || defaultModel('image'),
        selectedVideoModel: current.selectedVideoModel || defaultModel('video'),
      };
      if (defaults.selectedChatModel !== current.selectedChatModel || defaults.selectedImageModel !== current.selectedImageModel || defaults.selectedVideoModel !== current.selectedVideoModel) {
        commit((previous) => invalidateSalesState(previous, defaults));
      }
      if (!await runPlan()) return false;
      if (!await stages.runAssets()) return false;
      if (!stages.autoConfirmAssets()) return false;
      if (!await stages.runFinalize()) return false;
      return await runRender();
    } finally {
      autoRunRef.current = false;
      setIsRunning(false);
    }
  };
}
