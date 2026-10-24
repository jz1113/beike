import type { useBatchWorkshopRunner } from '../../hooks/useBatchWorkshopRunner';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';
import { productPropsWithCategory } from '../../model/batchTypes';
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
    availableOutfits,
    availablePersonas,
    availableScenes,
    availableVisionModels,
    generationStrategy,
    imageGenConcurrency,
    isAnalyzingAll,
    isCollecting,
    isGeneratingBatch,
    items,
    lockedOutfitId,
    lockedPersonaId,
    lockedSceneId,
    personaMode,
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
    setLockedOutfitId,
    setLockedPersonaId,
    setLockedSceneId,
    setSelectedArchId,
    setSelectedAspect,
    setSelectedImageGenModel,
    setSelectedQuality,
    setSelectedShotCount,
    setSelectedVisionModel,
    successfulItems,
  } = runner;
  return (
      <WorkshopSettingsModal
        workspaceStatus={runner.workspaceStatus} workspaceError={runner.workspaceError}
        busy={isCollecting || isAnalyzingAll || isGeneratingBatch || runner.isAutoPilotRunning || items.some(item => item.isAnalyzing || item.isCopywritingGenerating)}
        assetLoadState={runner.assetLoadState} assetLoadError={runner.assetLoadError} onReloadAssets={runner.reloadAssets}
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
        lockedPersonaId={lockedPersonaId}
        setLockedPersonaId={setLockedPersonaId}
        availablePersonas={availablePersonas}
        lockedSceneId={lockedSceneId}
        setLockedSceneId={setLockedSceneId}
        availableScenes={availableScenes}
        lockedOutfitId={lockedOutfitId}
        setLockedOutfitId={setLockedOutfitId}
        availableOutfits={availableOutfits}
        lockedFullPromptId={runner.lockedFullPromptId}
        setLockedFullPromptId={runner.setLockedFullPromptId}
        availableFullPrompts={runner.availableFullPrompts}
        availableProductCategories={runner.availableProductCategories}
        promptGroupFolderId={runner.promptGroupFolderId}
        setPromptGroupFolderId={runner.setPromptGroupFolderId}
        products={successfulItems.map(item => ({ title: item.title, props: productPropsWithCategory(item) }))}
        personaMode={personaMode}
        setPersonaMode={runner.setPersonaMode}
      />
  );
}
