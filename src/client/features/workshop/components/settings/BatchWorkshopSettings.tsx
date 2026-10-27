import type { useBatchWorkshopRunner } from '../../hooks/useBatchWorkshopRunner';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';
import { WorkshopSettingsModal } from './WorkshopSettingsModal';

interface BatchWorkshopSettingsProps {
  runner: ReturnType<typeof useBatchWorkshopRunner>;
  isOpen: boolean;
  onClose: () => void;
  onOpenAssetTab?: (type: PromptAssetType) => void;
  onFallbackAssets: () => void;
}

export function BatchWorkshopSettings({ runner, isOpen, onClose, onOpenAssetTab, onFallbackAssets }: BatchWorkshopSettingsProps) {
  const {
    analyzeConcurrency,
    autoGenerateCopywriting,
    availableImageModels,
    availableVisionModels,
    generationStrategy,
    imageGenConcurrency,
    recipes,
    selectedArchId,
    selectedAspect,
    selectedImageGenModel,
    selectedQuality,
    selectedShotCount,
    selectedVisionModel,
    setAnalyzeConcurrency,
    setAutoGenerateCopywriting,
    setGenerationStrategy,
    setImageGenConcurrency,
    setSelectedArchId,
    setSelectedAspect,
    setSelectedImageGenModel,
    setSelectedQuality,
    setSelectedShotCount,
    setSelectedVisionModel,
  } = runner;
  return (
      <WorkshopSettingsModal
        workspaceStatus={runner.workspaceStatus} workspaceError={runner.workspaceError}
        busy={runner.flow.busy || runner.isAutoPilotRunning}
        skillLoadState={runner.skillLoadState} skillLoadError={runner.skillLoadError} onReloadSkills={runner.reloadSkills}
        onOpenAssets={(type = 'full_prompt') => {
          onClose();
          if (onOpenAssetTab) onOpenAssetTab(type);
          else onFallbackAssets();
        }}
        isOpen={isOpen}
        onClose={onClose}
        selectedArchId={selectedArchId}
        setSelectedArchId={setSelectedArchId}
        recipes={recipes}
        selectedShotCount={selectedShotCount}
        setSelectedShotCount={setSelectedShotCount}
        selectedAspect={selectedAspect}
        setSelectedAspect={setSelectedAspect}
        gridOutputSize={runner.gridOutputSize}
        setGridOutputSize={runner.setGridOutputSize}
        selectedQuality={selectedQuality}
        setSelectedQuality={setSelectedQuality}
        selectedVisionModel={selectedVisionModel}
        setSelectedVisionModel={setSelectedVisionModel}
        availableVisionModels={availableVisionModels}
        selectedImageGenModel={selectedImageGenModel}
        setSelectedImageGenModel={setSelectedImageGenModel}
        availableImageModels={availableImageModels}
        generationStrategy={generationStrategy}
        setGenerationStrategy={setGenerationStrategy}
        autoGenerateCopywriting={autoGenerateCopywriting}
        setAutoGenerateCopywriting={setAutoGenerateCopywriting}
        imageGenConcurrency={imageGenConcurrency}
        setImageGenConcurrency={setImageGenConcurrency}
        analyzeConcurrency={analyzeConcurrency}
        setAnalyzeConcurrency={setAnalyzeConcurrency}

      />
  );
}
