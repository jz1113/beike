import { WorkshopTopBar } from './WorkshopTopBar';
import { WorkshopProductionOverview } from './WorkshopProductionOverview';
import { WorkspaceSaveNotice } from './WorkspaceSaveNotice';
import { useEffect, useMemo, useState } from 'react';
import { useBatchWorkshopRunner } from '../hooks/useBatchWorkshopRunner';
import BatchStage1Collect from './stage/BatchStage1Collect';
import BatchStage2Config from './stage/BatchStage2Config';
import { BatchConfigProvider, type BatchConfigContextValue } from './BatchConfigContext';
import BatchStage3Prompts from './stage/BatchStage3Prompts';
import BatchStage4Queue from './stage/BatchStage4Queue';
import { BatchPreviewLightbox } from '@client/shared/modals/lightbox/BatchPreviewLightbox';
import { BatchWorkshopSettings } from './settings/BatchWorkshopSettings';
import { BatchWorkspaceBatchControls } from './BatchWorkspaceBatchControls';
import { BatchArchitectureConfirmDialog } from './BatchArchitectureConfirmDialog';
import { useAppStore } from '@client/store';
import { BatchProductItem, TypedProductImage, SYSTEM_MASTER_RECIPES } from '../model/batchTypes';
import type { WorkshopBatch } from '@shared/workshopSnapshot';
import { isAutoPromptGroupSelection } from '@shared/domain/workshop/workshop-pipeline';
import { BatchWorkshopHistoryPreview } from './history/BatchWorkshopHistoryPreview';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';
export { SYSTEM_MASTER_RECIPES };
export type { TypedProductImage, BatchProductItem };
export default function BatchWorkshopView({ onOpenAssetTab }: { onOpenAssetTab?: (type: PromptAssetType) => void }) {
  const runner = useBatchWorkshopRunner();
  const freshEntry = useAppStore(s => s.pendingFreshWorkshopEntry);
  const isWorkshopConfigOpen = useAppStore(s => s.isWorkshopConfigOpen);
  const setIsWorkshopConfigOpen = useAppStore(s => s.setIsWorkshopConfigOpen);
  const activeWorkshopTab = useAppStore(s => s.activeWorkshopTab);
  const setActiveWorkshopTab = useAppStore(s => s.setActiveWorkshopTab);
  const [historyGenerationBatch, setHistoryGenerationBatch] = useState<WorkshopBatch | null>(null);
  const [isHistoryExporting, setIsHistoryExporting] = useState(false);
  const [historyExportItemId, setHistoryExportItemId] = useState<string | null>(null);
  const [isArchitectureConfirmOpen, setIsArchitectureConfirmOpen] = useState(false);
  const {
    currentStage,
    setCurrentStage,
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
    pipelineStatus,
    useAssetLibrary,
    setUseAssetLibrary,
    lockedPersonaId,
    setLockedPersonaId,
    lockedSceneId,
    setLockedSceneId,
    lockedOutfitId,
    setLockedOutfitId,
    lockedActionId,
    setLockedActionId,
    availablePersonas,
    availableScenes,
    availableOutfits,
    availableActions,
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
    toggleProductImageSelection,
    batchSetProductImages,
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
    handleExportExcel,
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
    pauseRun,
    resumeRun,
    cancelRun,
    acknowledgeRecovery,
    completeCurrentBatch,
    reviewTask,
    toastMsg,
    showToast,
    workspaceError,
    workspaceStatus,
    reloadWorkspace,
    workspaceReady,
    activeBatch,
    historyBatches,
    refreshBatchHistory,
    createNewBatch,
    duplicateBatch,
    clearHistory,
    deleteHistoryBatch,
    renameBatch,
    readBatch,
  } = runner;
  useEffect(() => {
    // A cached history preview must not hide the newly selected active batch.
    setHistoryGenerationBatch(null);
    setIsArchitectureConfirmOpen(false);
  }, [runner.activeBatch?.id, freshEntry]);

  const stage2ConfigValue = useMemo((): BatchConfigContextValue => ({
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
    useAssetLibrary,
    setUseAssetLibrary,
    lockedPersonaId,
    setLockedPersonaId,
    lockedSceneId,
    setLockedSceneId,
    lockedOutfitId,
    setLockedOutfitId,
    lockedActionId,
    setLockedActionId,
    availablePersonas,
    availableScenes,
    availableOutfits,
    availableActions,
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
    activeImgFilter,
    setActiveImgFilter,
    toggleProductImageSelection,
    batchSetProductImages,
    handleRemoveItem,
    onPreviewGallery: openGalleryPreview,
    onPreviewImage: (url) => openGalleryPreview([url], 0),
    onStartAutoPilot: startAutoPilotPipeline,
    isAutoPilotRunning,
    onPrevStage: () => setCurrentStage(1),
    openWorkshopConfig: () => setIsWorkshopConfigOpen(true),
    onNextStage: () => setIsArchitectureConfirmOpen(true),
  }), [setIsWorkshopConfigOpen, setIsArchitectureConfirmOpen, currentStage, successfulItems, setItems, recipes, selectedArchId, setSelectedArchId, availableVisionModels, selectedVisionModel, setSelectedVisionModel, availableImageModels, selectedImageGenModel, setSelectedImageGenModel, useAssetLibrary, setUseAssetLibrary, lockedPersonaId, setLockedPersonaId, lockedSceneId, setLockedSceneId, lockedOutfitId, setLockedOutfitId, lockedActionId, setLockedActionId, availablePersonas, availableScenes, availableOutfits, availableActions, generationStrategy, setGenerationStrategy, imageGenConcurrency, setImageGenConcurrency, selectedQuality, setSelectedQuality, selectedAspect, setSelectedAspect, selectedShotCount, setSelectedShotCount, analyzeConcurrency, setAnalyzeConcurrency, isAnalyzingAll, analyzeProgress, startBatchVisionAnalyze, activeImgFilter, setActiveImgFilter, toggleProductImageSelection, batchSetProductImages, handleRemoveItem, openGalleryPreview, startAutoPilotPipeline, isAutoPilotRunning, setCurrentStage]);

  const confirmArchitectureAndAnalyze = (architectureId: string) => {
    if (architectureId !== 'auto' && !recipes.some((recipe) => recipe.id === architectureId)) {
      showToast('请先选择有效的类目拍摄架构，再开始提示词分析');
      return;
    }
    if (recipes.length === 0) {
      showToast('暂无可用拍摄架构，请先到拍摄架构页同步或新建');
      return;
    }

    setSelectedArchId(architectureId);
    setIsArchitectureConfirmOpen(false);
    setCurrentStage(3);
    void startBatchVisionAnalyze(architectureId);
  };

  if (!workspaceReady) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8" role={workspaceError ? 'alert' : 'status'}>
        <p>{workspaceError || '正在准备工坊批次，请稍候…'}</p>
        {workspaceError && <button type="button" onClick={() => void reloadWorkspace()} className="rounded-lg border px-4 py-2">重新加载</button>}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-transparent relative">
      <WorkshopTopBar activeTab={activeWorkshopTab} onSelectTab={setActiveWorkshopTab} />
      {workspaceStatus && workspaceStatus !== '当前批次已就绪' && workspaceStatus !== '当前批次已保存' && !workspaceError ? (
        <p className="px-4 sm:px-6 text-xs text-slate-500 dark:text-slate-400">{workspaceStatus}</p>
      ) : null}
      <WorkspaceSaveNotice error={workspaceError} status={workspaceStatus} onRetry={runner.workspaceSaveActions.retry} onDownload={runner.workspaceSaveActions.download} onReload={reloadWorkspace} />
      <BatchWorkspaceBatchControls
        activeBatch={activeBatch}
        historyBatches={historyBatches}
        itemsCount={items.length}
        batchInputText={batchInputText}
        currentStage={currentStage}
        ready={workspaceReady}
        createNewBatch={createNewBatch}
        refreshHistory={refreshBatchHistory}
        duplicateBatch={duplicateBatch}
        clearHistory={async () => { const count = await clearHistory(); setHistoryGenerationBatch(null); return count; }}
        deleteHistoryBatch={async id => { await deleteHistoryBatch(id); setHistoryGenerationBatch(previous => previous?.id === id ? null : previous); }}
        renameBatch={renameBatch}
        readBatch={readBatch}
        onOpenGenerationView={setHistoryGenerationBatch}
        showToast={showToast}
      />
      {/* 主体工作区 Content Area（Stage 1 采编采用黄金阅读宽度；Stage 2+ 选图及后续生产流水线自适应全屏大画幅充盈放大） */}
      <div className="flex-1 overflow-y-auto px-3 pt-11 pb-3 sm:px-5 sm:pt-11 sm:pb-4 xl:px-7 flex flex-col">
        <div className={
          !historyGenerationBatch && currentStage === 1 && items.length === 0
            ? "max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto w-full flex-1 flex flex-col justify-between"
            : historyGenerationBatch || currentStage === 4
              ? "mx-auto w-full max-w-[1840px] space-y-4"
              : "w-full space-y-4"
        }>
          {!historyGenerationBatch && items.length > 0 && <WorkshopProductionOverview items={items} currentStage={currentStage} onStageChange={setCurrentStage}
            busy={isCollecting || isAnalyzingAll || isGeneratingBatch || isAutoPilotRunning || items.some((item) => item.isAnalyzing)}
            analysisIssue={runner.analysisIssue} strategy={generationStrategy} shotCount={selectedShotCount} aspect={selectedAspect} gridOutputSize={runner.gridOutputSize} concurrency={imageGenConcurrency} onSettings={() => setIsWorkshopConfigOpen(true)} />}
          {historyGenerationBatch ? (
            <BatchWorkshopHistoryPreview
              batch={historyGenerationBatch}
              runner={runner}
              isHistoryExporting={isHistoryExporting}
              historyExportItemId={historyExportItemId}
              setIsHistoryExporting={setIsHistoryExporting}
              setHistoryExportItemId={setHistoryExportItemId}
              onClose={() => setHistoryGenerationBatch(null)}
            />
          ) : currentStage === 1 && (
            <BatchStage1Collect
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
              onNextStage={() => setCurrentStage(2)}
              recipes={recipes}
              selectedArchId={selectedArchId}
              selectedShotCount={selectedShotCount}
              selectedAspect={selectedAspect}
              selectedQuality={selectedQuality}
              selectedImageGenModel={selectedImageGenModel}
              selectedVisionModel={selectedVisionModel}
              onOpenSettings={() => setIsWorkshopConfigOpen(true)}
            />
          )}

          {!historyGenerationBatch && currentStage === 2 && (
            <BatchConfigProvider value={stage2ConfigValue}>
              <BatchStage2Config />
            </BatchConfigProvider>
          )}

          {!historyGenerationBatch && currentStage === 3 && (
            <BatchStage3Prompts
              autoMatchMotherTemplate={isAutoPromptGroupSelection(runner.lockedFullPromptId)}
              generationStrategy={generationStrategy}
              selectedShotCount={selectedShotCount}
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
              onPrevStage={() => setCurrentStage(2)}
            />
          )}

          {!historyGenerationBatch && currentStage === 4 && (
            <BatchStage4Queue
              successfulItems={successfulItems}
              selectedVisionModel={selectedVisionModel}
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
              generateCopywritingForProduct={generateCopywritingForProduct}
              updateItemCopywriting={updateItemCopywriting}
              generateAllCopywriting={generateAllCopywriting}
              retryFailedImageTasks={retryFailedImageTasks}
              retrySingleShotTask={retrySingleShotTask}
              isExportingZip={isExportingZip}
              exportingSingleItemId={exportingSingleItemId}
              handleExportZip={handleExportZip}
              handleExportExcel={handleExportExcel}
              handleExportSingleProductZip={handleExportSingleProductZip}
              handleDownloadSingleTaskImage={handleDownloadSingleTaskImage}
              setPreviewImageUrl={setPreviewImageUrl}
              onPreviewGallery={openGalleryPreview}
              runControlStatus={isGeneratingBatch && pipelineStatus === 'paused' ? 'paused' : isGeneratingBatch ? 'running' : 'idle'}
              onPauseRun={pauseRun}
              onResumeRun={resumeRun}
              onCancelRun={cancelRun}
              onCompleteBatch={completeCurrentBatch}
              onBackToPrompts={() => setCurrentStage(3)}
              onContinueGeneration={startBatchGeneration}
              onRecheckTask={runner.recheckTask}
              pipelineStatus={pipelineStatus}
              onReviewTask={reviewTask}
              onAcknowledgeRecovery={acknowledgeRecovery}
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
      <BatchWorkshopSettings
        runner={runner}
        isOpen={isWorkshopConfigOpen}
        onClose={() => setIsWorkshopConfigOpen(false)}
        onOpenAssetTab={onOpenAssetTab}
        onFallbackAssets={() => setActiveWorkshopTab('prompt_assets')}
      />
      <BatchArchitectureConfirmDialog
        key={isArchitectureConfirmOpen ? 'architecture-confirm-open' : 'architecture-confirm-closed'}
        isOpen={isArchitectureConfirmOpen}
        recipes={recipes}
        selectedArchId={selectedArchId}
        onCancel={() => setIsArchitectureConfirmOpen(false)}
        onConfirm={confirmArchitectureAndAnalyze}
        products={successfulItems}
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
