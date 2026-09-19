import { useMemo } from 'react';
import { useBatchWorkshopRunner } from '../hooks/useBatchWorkshopRunner';
import BatchStage1Collect from './BatchStage1Collect';
import BatchStage2Config from './BatchStage2Config';
import { BatchConfigProvider, type BatchConfigContextValue } from './BatchConfigContext';
import BatchStage3Prompts from './BatchStage3Prompts';
import BatchStage4Queue from './BatchStage4Queue';
import './components/BatchPipelineHeader';
import { WorkshopTopBar } from '../../components/WorkshopTopBar';
import { BatchPreviewLightbox } from './BatchPreviewLightbox';
import { WorkshopSettingsModal } from '../../components/WorkshopSettingsModal';
import { useAppStore } from '@/store';
import { 
  BatchProductItem, 
  TypedProductImage, 
  SYSTEM_MASTER_RECIPES 
} from '../batchTypes';

export { SYSTEM_MASTER_RECIPES };
export type { TypedProductImage, BatchProductItem };

interface Props {
  fixedBatchMode?: 'original' | 'replication';
}

export default function BatchWorkshopView({ fixedBatchMode }: Props) {
  const runner = useBatchWorkshopRunner({ fixedBatchMode });
  const isWorkshopConfigOpen = useAppStore(s => s.isWorkshopConfigOpen);
  const setIsWorkshopConfigOpen = useAppStore(s => s.setIsWorkshopConfigOpen);
  const activeWorkshopTab = useAppStore(s => s.activeWorkshopTab);
  const setActiveWorkshopTab = useAppStore(s => s.setActiveWorkshopTab);

  const {
    batchMode,
    currentStage,
    setCurrentStage,
    handleSwitchMode,
    batchInputText,
    setBatchInputText,
    items,
    setItems,
    isCollecting,
    collectProgress,
    successfulItems,
    handleRemoveItem,
    handleParseInput,
    startBatchCollect,
    recipes,
    selectedArchId,
    setSelectedArchId,
    availableVisionModels,
    selectedVisionModel,
    setSelectedVisionModel,
    availableImageModels,
    selectedImageGenModel,
    setSelectedImageGenModel,
    hasHumanPersona,
    setHasHumanPersona,
    useAssetLibrary,
    setUseAssetLibrary,
    lockedPersonaId,
    setLockedPersonaId,
    lockedSceneId,
    setLockedSceneId,
    lockedOutfitId,
    setLockedOutfitId,
    availablePersonas,
    availableScenes,
    availableOutfits,
    generationStrategy,
    setGenerationStrategy,
    imageGenConcurrency,
    setImageGenConcurrency,
    selectedQuality,
    setSelectedQuality,
    selectedAspect,
    setSelectedAspect,
    selectedShotCount,
    setSelectedShotCount,
    isAnalyzingAll,
    analyzeProgress,
    activeImgFilter,
    setActiveImgFilter,
    replicationInputMode,
    setReplicationInputMode,
    matrixMasterRefUrl,
    setMatrixMasterRefUrl,
    matrixMasterRefImages,
    setMatrixMasterRefImages,
    isMatrixParsing,
    isBatchRefParsing,
    handleParseMatrixMasterRef,
    handleBatchParse1to1Refs,
    toggleProductImageSelection,
    batchSetProductImages,
    toggleReferenceImageSelection,
    analyzeSingleProduct,
    startBatchVisionAnalyze,
    analyzeConcurrency,
    setAnalyzeConcurrency,
    isGeneratingBatch,
    totalTaskCount,
    completedTaskCount,
    successTaskCount,
    failTaskCount,
    startBatchGeneration,
    retryFailedImageTasks,
    retrySingleShotTask,
    generateCopywritingForProduct,
    updateItemCopywriting,
    generateAllCopywriting,
    isExportingZip,
    exportingSingleItemId,
    handleExportZip,
    handleExportSingleProductZip,
    handleDownloadSingleTaskImage,
    previewImageUrl,
    setPreviewImageUrl,
    previewGallery,
    openGalleryPreview,
    closeGalleryPreview,
    setGalleryIndex,
    isAutoPilotRunning,
    startAutoPilotPipeline,
    toastMsg,
    workspaceStatus,
  } = runner;

  const readyProductCount = successfulItems.filter(i => i.selectedProductImages && i.selectedProductImages.length > 0).length;

  const stage2ConfigValue = useMemo((): BatchConfigContextValue => ({
    batchMode,
    currentStage,
    successfulItems,
    setItems,
    recipes,
    selectedArchId,
    setSelectedArchId,
    availableVisionModels,
    selectedVisionModel,
    setSelectedVisionModel,
    availableImageModels,
    selectedImageGenModel,
    setSelectedImageGenModel,
    hasHumanPersona,
    setHasHumanPersona,
    useAssetLibrary,
    setUseAssetLibrary,
    lockedPersonaId,
    setLockedPersonaId,
    lockedSceneId,
    setLockedSceneId,
    lockedOutfitId,
    setLockedOutfitId,
    availablePersonas,
    availableScenes,
    availableOutfits,
    generationStrategy,
    setGenerationStrategy,
    imageGenConcurrency,
    setImageGenConcurrency,
    selectedQuality,
    setSelectedQuality,
    selectedAspect,
    setSelectedAspect,
    selectedShotCount,
    setSelectedShotCount,
    analyzeConcurrency,
    setAnalyzeConcurrency,
    isAnalyzingAll,
    analyzeProgress,
    startBatchAnalyze: startBatchVisionAnalyze,
    replicationInputMode,
    setReplicationInputMode,
    matrixMasterRefUrl,
    setMatrixMasterRefUrl,
    matrixMasterRefImages,
    setMatrixMasterRefImages,
    isMatrixParsing,
    handleParseMatrixMasterRef,
    isBatchRefParsing,
    handleBatchParse1to1Refs,
    activeImgFilter,
    setActiveImgFilter,
    toggleProductImageSelection,
    batchSetProductImages,
    toggleReferenceImageSelection,
    handleRemoveItem,
    onPreviewGallery: openGalleryPreview,
    onPreviewImage: (url) => openGalleryPreview([url], 0),
    onStartAutoPilot: startAutoPilotPipeline,
    isAutoPilotRunning,
    onPrevStage: () => setCurrentStage(batchMode === 'original' ? 1 : currentStage === 2 ? 1 : 2),
    openWorkshopConfig: () => setIsWorkshopConfigOpen(true),
    onNextStage: () => {
      if (batchMode === 'replication' && currentStage === 2) {
        setCurrentStage(3);
      } else {
        setCurrentStage(batchMode === 'original' ? 3 : 4);
        void startBatchVisionAnalyze();
      }
    },
  }), [
    setIsWorkshopConfigOpen,
    batchMode,
    currentStage,
    successfulItems,
    setItems,
    recipes,
    selectedArchId,
    setSelectedArchId,
    availableVisionModels,
    selectedVisionModel,
    setSelectedVisionModel,
    availableImageModels,
    selectedImageGenModel,
    setSelectedImageGenModel,
    hasHumanPersona,
    setHasHumanPersona,
    useAssetLibrary,
    setUseAssetLibrary,
    lockedPersonaId,
    setLockedPersonaId,
    lockedSceneId,
    setLockedSceneId,
    lockedOutfitId,
    setLockedOutfitId,
    availablePersonas,
    availableScenes,
    availableOutfits,
    generationStrategy,
    setGenerationStrategy,
    imageGenConcurrency,
    setImageGenConcurrency,
    selectedQuality,
    setSelectedQuality,
    selectedAspect,
    setSelectedAspect,
    selectedShotCount,
    setSelectedShotCount,
    analyzeConcurrency,
    setAnalyzeConcurrency,
    isAnalyzingAll,
    analyzeProgress,
    startBatchVisionAnalyze,
    replicationInputMode,
    setReplicationInputMode,
    matrixMasterRefUrl,
    setMatrixMasterRefUrl,
    matrixMasterRefImages,
    setMatrixMasterRefImages,
    isMatrixParsing,
    handleParseMatrixMasterRef,
    isBatchRefParsing,
    handleBatchParse1to1Refs,
    activeImgFilter,
    setActiveImgFilter,
    toggleProductImageSelection,
    batchSetProductImages,
    toggleReferenceImageSelection,
    handleRemoveItem,
    openGalleryPreview,
    startAutoPilotPipeline,
    isAutoPilotRunning,
    setCurrentStage,
  ]);

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-transparent relative">
      {/* 🌟 极简单层顶栏（完全对齐图1生成界面）：胶囊下拉菜单 + 步骤导轨 + 生产预设 */}
      <WorkshopTopBar
        activeTab={activeWorkshopTab}
        onSelectTab={setActiveWorkshopTab}
        currentStage={currentStage}
        setCurrentStage={setCurrentStage}
        itemsCount={items.length}
        readyProductCount={readyProductCount}
        successfulItemsCount={successfulItems.length}
        batchMode={batchMode}
        onSwitchMode={handleSwitchMode}
        isAutoPilotRunning={isAutoPilotRunning}
      />
      {workspaceStatus ? <p role="status">{workspaceStatus}</p> : null}

      {/* 主体工作区 Content Area（Stage 1 采编采用黄金阅读宽度；Stage 2+ 选图及后续生产流水线自适应全屏大画幅充盈放大） */}
      <div className="flex-1 overflow-y-auto pl-[84px] pr-3 sm:pl-[100px] sm:pr-5 xl:pl-[108px] xl:pr-7 py-3 sm:py-4 flex flex-col">
        <div className={
          currentStage === 1 && items.length === 0
            ? "max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto w-full flex-1 flex flex-col justify-between"
            : "w-full max-w-[1760px] 2xl:max-w-[1920px] mx-auto space-y-4"
        }>
          {currentStage === 1 && (
            <BatchStage1Collect
              batchMode={batchMode}
              batchInputText={batchInputText}
              setBatchInputText={setBatchInputText}
              items={items}
              setItems={setItems}
              isCollecting={isCollecting}
              collectProgress={collectProgress}
              successfulItems={successfulItems}
              handleParseInput={handleParseInput}
              startBatchCollect={startBatchCollect}
              handleRemoveItem={handleRemoveItem}
              onPreviewImage={(url) => openGalleryPreview([url], 0, '商品封面')}
              onNextStage={() => setCurrentStage(batchMode === 'original' ? 2 : 2)}
              recipes={recipes}
              selectedArchId={selectedArchId}
              selectedShotCount={selectedShotCount}
              selectedAspect={selectedAspect}
              selectedQuality={selectedQuality}
              selectedImageGenModel={selectedImageGenModel}
              selectedVisionModel={selectedVisionModel}
              hasHumanPersona={hasHumanPersona}
              onOpenSettings={() => setIsWorkshopConfigOpen(true)}
            />
          )}

          {((batchMode === 'original' && currentStage === 2) || (batchMode === 'replication' && (currentStage === 2 || currentStage === 3))) && (
            <BatchConfigProvider value={stage2ConfigValue}>
              <BatchStage2Config />
            </BatchConfigProvider>
          )}

          {((batchMode === 'original' && currentStage === 3) || (batchMode === 'replication' && currentStage === 4)) && (
            <BatchStage3Prompts
              generationStrategy={generationStrategy}
              successfulItems={successfulItems}
              setItems={setItems}
              isAnalyzingAll={isAnalyzingAll}
              analyzeProgress={analyzeProgress}
              startBatchVisionAnalyze={startBatchVisionAnalyze}
              analyzeSingleProduct={analyzeSingleProduct}
              analyzeConcurrency={analyzeConcurrency}
              setAnalyzeConcurrency={setAnalyzeConcurrency}
              handleRemoveItem={handleRemoveItem}
              startBatchGeneration={startBatchGeneration}
              onPreviewImage={(url) => openGalleryPreview([url], 0)}
              onPrevStage={() => setCurrentStage(batchMode === 'original' ? 2 : 3)}
            />
          )}

          {((batchMode === 'original' && currentStage === 4) || (batchMode === 'replication' && currentStage === 5)) && (
            <BatchStage4Queue
              successfulItems={successfulItems}
              availableImageModels={availableImageModels}
              selectedImageGenModel={selectedImageGenModel}
              setSelectedImageGenModel={setSelectedImageGenModel}
              selectedQuality={selectedQuality}
              setSelectedQuality={setSelectedQuality}
              selectedAspect={selectedAspect}
              setSelectedAspect={setSelectedAspect}
              isGeneratingBatch={isGeneratingBatch}
              totalTaskCount={totalTaskCount}
              completedTaskCount={completedTaskCount}
              successTaskCount={successTaskCount}
              failTaskCount={failTaskCount}
              hasHumanPersona={hasHumanPersona}
              generateCopywritingForProduct={generateCopywritingForProduct}
              updateItemCopywriting={updateItemCopywriting}
              generateAllCopywriting={generateAllCopywriting}
              retryFailedImageTasks={retryFailedImageTasks}
              retrySingleShotTask={retrySingleShotTask}
              isExportingZip={isExportingZip}
              exportingSingleItemId={exportingSingleItemId}
              handleExportZip={handleExportZip}
              handleExportSingleProductZip={handleExportSingleProductZip}
              handleDownloadSingleTaskImage={handleDownloadSingleTaskImage}
              setPreviewImageUrl={setPreviewImageUrl}
              onPreviewGallery={openGalleryPreview}
            />
          )}
        </div>
      </div>

      {/* 高清多图画廊与大图预览 Lightbox */}
      <BatchPreviewLightbox
        previewImageUrl={previewImageUrl}
        previewGallery={previewGallery}
        closeGalleryPreview={closeGalleryPreview}
        setGalleryIndex={setGalleryIndex}
        handleDownloadSingleTaskImage={handleDownloadSingleTaskImage}
      />

      {/* 🌟 种草工坊全局生产预设中心模态框 */}
      <WorkshopSettingsModal
        isOpen={isWorkshopConfigOpen}
        onClose={() => setIsWorkshopConfigOpen(false)}
        selectedArchId={selectedArchId}
        setSelectedArchId={setSelectedArchId}
        recipes={recipes}
        selectedShotCount={selectedShotCount}
        setSelectedShotCount={setSelectedShotCount}
        selectedAspect={selectedAspect}
        setSelectedAspect={setSelectedAspect}
        hasHumanPersona={hasHumanPersona}
        setHasHumanPersona={setHasHumanPersona}
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
        imageGenConcurrency={imageGenConcurrency}
        setImageGenConcurrency={setImageGenConcurrency}
        analyzeConcurrency={analyzeConcurrency}
        setAnalyzeConcurrency={setAnalyzeConcurrency}
        useAssetLibrary={useAssetLibrary}
        setUseAssetLibrary={setUseAssetLibrary}
        lockedPersonaId={lockedPersonaId}
        setLockedPersonaId={setLockedPersonaId}
        availablePersonas={availablePersonas}
        lockedSceneId={lockedSceneId}
        setLockedSceneId={setLockedSceneId}
        availableScenes={availableScenes}
        lockedOutfitId={lockedOutfitId}
        setLockedOutfitId={setLockedOutfitId}
        availableOutfits={availableOutfits}
      />

      {/* 底部 Toast */}
      {toastMsg && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-2.5 bg-slate-900/95 text-white text-xs font-bold rounded-2xl shadow-2xl border border-slate-700/80 z-50 animate-in fade-in slide-in-from-bottom duration-200">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
