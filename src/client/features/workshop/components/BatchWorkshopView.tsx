import { WorkspaceSaveNotice } from './layout/WorkspaceSaveNotice';
import { useEffect, useState } from 'react';
import { useBatchWorkshopRunner } from '../hooks/useBatchWorkshopRunner';
import BatchStage1Collect from './stage/BatchStage1Collect';
import BatchStage2Config from './stage/BatchStage2Config';
import { BatchConfigProvider, type BatchConfigContextValue } from './settings/BatchConfigContext';
import BatchStage3Prompts from './stage/BatchStage3Prompts';
import BatchStage4Queue from './stage/BatchStage4Queue';
import { BatchPreviewLightbox } from '@client/shared/modals/lightbox/BatchPreviewLightbox';
import { BatchWorkshopSettings } from './settings/BatchWorkshopSettings';
import { BatchWorkspaceBatchControls } from './layout/BatchWorkspaceBatchControls';
import { WorkshopProductionSummary } from './settings/WorkshopProductionSummary';
import { useAppStore } from '@client/store';
import { BatchProductItem, TypedProductImage } from '../model/batchTypes';
import type { WorkshopBatch } from '@shared/workshopSnapshot';
import type { WorkshopStage } from '../model/workspace/workshopFlow';
import { BatchWorkshopHistoryPreview } from './history/BatchWorkshopHistoryPreview';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';
export type { TypedProductImage, BatchProductItem };
export default function BatchWorkshopView({ onOpenAssetTab }: { onOpenAssetTab?: (type: PromptAssetType) => void }) {
  const runner = useBatchWorkshopRunner();
  const freshEntry = useAppStore(s => s.pendingFreshWorkshopEntry);
  const isWorkshopConfigOpen = useAppStore(s => s.isWorkshopConfigOpen);
  const setIsWorkshopConfigOpen = useAppStore(s => s.setIsWorkshopConfigOpen);
  const setActiveWorkshopTab = useAppStore(s => s.setActiveWorkshopTab);
  const [historyGenerationBatch, setHistoryGenerationBatch] = useState<WorkshopBatch | null>(null);
  const [isHistoryExporting, setIsHistoryExporting] = useState(false);
  const [historyExportItemId, setHistoryExportItemId] = useState<string | null>(null);
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
    selectedArchId,
    availableImageModels,
    selectedImageGenModel,
    pipelineStatus,
    generationStrategy,
    selectedQuality,
    selectedAspect,
    selectedShotCount,
    isAnalyzingAll,
    analyzeProgress,
    activeImgFilter,
    setActiveImgFilter,
    toggleProductImageSelection,
    batchSetProductImages,
    analyzeSingleProduct,
    startBatchVisionAnalyze,
    isGeneratingBatch,
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
    pauseRun,
    resumeRun,
    cancelRun,
    acknowledgeRecovery,
    reviewBatch,
    isReviewingOutputs,
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
    deleteHistoryBatches,
    renameBatch,
    readBatch,
  } = runner;
  const flow = runner.flow;
  useEffect(() => {
    if (workspaceReady && !flow.busy && !historyGenerationBatch && currentStage > 1 && successfulItems.length === 0 && !flow.hasResults) setCurrentStage(1);
  }, [workspaceReady, flow.busy, flow.hasResults, historyGenerationBatch, currentStage, successfulItems.length, setCurrentStage]);
  useEffect(() => {
    // A cached history preview must not hide the newly selected active batch.
    setHistoryGenerationBatch(null);
  }, [runner.activeBatch?.id, freshEntry]);

  const selectStage = (stage: WorkshopStage) => {
    const reason = flow.reasonForStage(stage);
    if (reason) { showToast(reason); return; }
    setCurrentStage(stage);
  };
  const confirmImagesAndAnalyze = () => {
    if (flow.busy) return;
    if (!flow.imagesReady || runner.analysisIssue) {
      showToast(runner.analysisIssue || '请为每款商品至少选择一张商品图');
      return;
    }
    setCurrentStage(3);
    // Returning from image selection must preserve already reviewed prompts.
    if (flow.pendingAnalysisIds.length > 0) void startBatchVisionAnalyze(selectedArchId, { productIds: flow.pendingAnalysisIds });
  };
  const stage2ConfigValue: BatchConfigContextValue = {
    successfulItems, setItems, activeImgFilter, setActiveImgFilter,
    toggleProductImageSelection, batchSetProductImages, handleRemoveItem,
    onPreviewGallery: openGalleryPreview,
    onPreviewImage: url => openGalleryPreview([url], 0),
    onNextStage: confirmImagesAndAnalyze,
    onPrevStage: () => selectStage(1),
    analysisIssue: runner.analysisIssue,
    busy: flow.busy,
  };

  if (!workspaceReady) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8" role={workspaceError ? 'alert' : 'status'}>
        <p>{workspaceError || '正在准备电商图文批次，请稍候…'}</p>
        {workspaceError && <button type="button" onClick={() => void reloadWorkspace()} className="rounded-lg border px-4 py-2">重新加载</button>}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-transparent relative">
      <WorkspaceSaveNotice error={workspaceError} status={workspaceStatus} onRetry={runner.workspaceSaveActions.retry} onDownload={runner.workspaceSaveActions.download} onReload={reloadWorkspace} />
      <BatchWorkspaceBatchControls
        activeBatch={activeBatch}
        historyBatches={historyBatches}
        itemsCount={items.length}
        batchInputText={batchInputText}
        currentStage={currentStage}
        ready={workspaceReady}
        busy={flow.busy}
        createNewBatch={createNewBatch}
        refreshHistory={refreshBatchHistory}
        duplicateBatch={duplicateBatch}
        clearHistory={async () => { const count = await clearHistory(); setHistoryGenerationBatch(null); return count; }}
        deleteHistoryBatches={async ids => { const result = await deleteHistoryBatches(ids); setHistoryGenerationBatch(previous => previous && result.deletedIds.includes(previous.id) ? null : previous); return result; }}
        renameBatch={renameBatch}
        readBatch={readBatch}
        onOpenGenerationView={setHistoryGenerationBatch}
        showToast={showToast}
      />
      <div key={historyGenerationBatch?.id || currentStage} className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-10 sm:px-6 lg:px-8 ${currentStage === 1 && !historyGenerationBatch ? 'pt-1 sm:pt-2' : 'pt-5'}`}>
        <div className={
          !historyGenerationBatch && currentStage === 1
            ? "mx-auto w-full max-w-[1120px] flex-1 flex flex-col"
            : historyGenerationBatch || currentStage === 4
              ? "mx-auto w-full max-w-[1840px] space-y-4"
              : !historyGenerationBatch && currentStage === 2 ? "mx-auto w-full max-w-[1760px] flex-1 flex flex-col min-h-0" : "mx-auto w-full max-w-[1760px] space-y-4"
        }>
          {!historyGenerationBatch && currentStage === 3 && <WorkshopProductionSummary runner={runner} onOpenSettings={() => setIsWorkshopConfigOpen(true)} />}
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
              key={runner.activeBatch?.id || 'draft'}
              batchInputText={batchInputText}
              setBatchInputText={setBatchInputText}
              items={items}
              setItems={setItems}
              isCollecting={isCollecting}
              collectProgress={collectProgress}
              handleTableImport={runner.handleTableImport}
              handleParseInput={handleParseInput}
              startBatchCollect={startBatchCollect}
              onContinue={() => selectStage(2)}
              busy={flow.busy}
            />
          )}

          {!historyGenerationBatch && currentStage === 2 && (
            <BatchConfigProvider value={stage2ConfigValue}>
              <BatchStage2Config key={runner.activeBatch?.id || 'draft'} />
            </BatchConfigProvider>
          )}

          {!historyGenerationBatch && currentStage === 3 && (
            <BatchStage3Prompts
              generationStrategy={generationStrategy}
              selectedShotCount={selectedShotCount}
              successfulItems={successfulItems}
              setItems={setItems}
              isAnalyzingAll={isAnalyzingAll}
              analyzeProgress={analyzeProgress}
              startBatchVisionAnalyze={(productIds) => startBatchVisionAnalyze(selectedArchId, productIds ? { productIds } : undefined)}
              analyzeSingleProduct={analyzeSingleProduct}
              handleRemoveItem={handleRemoveItem}
              startBatchGeneration={startBatchGeneration}
              onPreviewImage={(url) => openGalleryPreview([url], 0)}
              onPrevStage={() => selectStage(2)}
              onGoToStage={selectStage}
              analysisIssue={runner.analysisIssue}
            />
          )}

          {!historyGenerationBatch && currentStage === 4 && (
            <BatchStage4Queue
              successfulItems={items.filter(item => (item.selected && item.status === 'success') || item.tasks.some(task => task.recoveryRequired))}
              selectedVisionModel={runner.selectedVisionModel}
              availableImageModels={availableImageModels}
              selectedImageGenModel={selectedImageGenModel}
              selectedQuality={selectedQuality}
              selectedAspect={selectedAspect}
              isGeneratingBatch={isGeneratingBatch}
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
              onReviewBatch={reviewBatch}
              isReviewingOutputs={isReviewingOutputs}
              onContinueGeneration={startBatchGeneration}
              onRecheckTask={runner.recheckTask}
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
      {/* 🌟 电商图文全局生产预设中心模态框 */}
      <BatchWorkshopSettings
        runner={runner}
        isOpen={isWorkshopConfigOpen}
        onClose={() => setIsWorkshopConfigOpen(false)}
        onOpenAssetTab={onOpenAssetTab}
        onFallbackAssets={() => setActiveWorkshopTab('prompt_assets')}
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
