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
import { useAppStore } from '@client/store';
import { BatchProductItem, TypedProductImage } from '../model/batchTypes';
import type { WorkshopBatch } from '@shared/workshopSnapshot';
import { isAutoPromptGroupSelection } from '@shared/domain/workshop/workshop-pipeline';
import { getWorkshopFlow, type WorkshopStage } from '../model/workspace/workshopFlow';
import { WorkshopFlowNavigation } from './layout/WorkshopFlowNavigation';
import { WorkshopProductionSummary } from './settings/WorkshopProductionSummary';
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
    deleteHistoryBatch,
    renameBatch,
    readBatch,
  } = runner;
  const flow = getWorkshopFlow(items, { generationStrategy, selectedShotCount, collecting: isCollecting, analyzing: isAnalyzingAll, generating: isGeneratingBatch });
  useEffect(() => {
    if (workspaceReady && !flow.busy && !historyGenerationBatch && currentStage > 1 && successfulItems.length === 0) setCurrentStage(1);
  }, [workspaceReady, flow.busy, historyGenerationBatch, currentStage, successfulItems.length, setCurrentStage]);
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
        <p>{workspaceError || '正在准备工坊批次，请稍候…'}</p>
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
        deleteHistoryBatch={async id => { await deleteHistoryBatch(id); setHistoryGenerationBatch(previous => previous?.id === id ? null : previous); }}
        renameBatch={renameBatch}
        readBatch={readBatch}
        onOpenGenerationView={setHistoryGenerationBatch}
        showToast={showToast}
      />
      {!historyGenerationBatch && <WorkshopFlowNavigation currentStage={currentStage} busy={flow.busy}
        productCount={successfulItems.length} readyCount={flow.readiness.readyCount} resultCount={flow.results.success}
        reasonForStage={flow.reasonForStage} onSelectStage={selectStage} />}
      {/* 主体工作区 Content Area（Stage 1 采编采用黄金阅读宽度；Stage 2+ 选图及后续生产流水线自适应全屏大画幅充盈放大） */}
      <div key={historyGenerationBatch?.id || currentStage} className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-6 sm:px-8 sm:pt-6 sm:pb-8 xl:px-10 flex flex-col">
        <div className={
          !historyGenerationBatch && currentStage === 1
            ? "max-w-[980px] mx-auto w-full flex-1 flex flex-col"
            : historyGenerationBatch || currentStage === 4
              ? "mx-auto w-full max-w-[1840px] space-y-4"
              : !historyGenerationBatch && currentStage === 2 ? "w-full flex-1 flex flex-col min-h-0" : "w-full space-y-4"
        }>
          {!historyGenerationBatch && (currentStage === 2 || currentStage === 3) && <WorkshopProductionSummary runner={runner} onOpenSettings={() => setIsWorkshopConfigOpen(true)} />}
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
              handleParseInput={handleParseInput}
              startBatchCollect={startBatchCollect}
              onContinue={() => selectStage(2)}
            />
          )}

          {!historyGenerationBatch && currentStage === 2 && (
            <BatchConfigProvider value={stage2ConfigValue}>
              {items.some(item => item.status === 'failed' || item.status === 'pending') && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/50 bg-amber-50/85 px-3.5 py-2 text-xs text-amber-800 backdrop-blur-md dark:border-amber-500/30 dark:bg-amber-950/50 dark:text-amber-200">
                <span>{items.filter(item => item.status === 'failed' || item.status === 'pending').length} 款商品未采集成功</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setItems(prev => prev.filter(item => item.status !== 'failed' && item.status !== 'pending'))} className="rounded-lg px-2.5 py-1 hover:bg-amber-500/15">忽略</button>
                  <button type="button" onClick={() => { setCurrentStage(1); void startBatchCollect(); }} className="rounded-lg bg-amber-500/15 px-3 py-1 font-medium hover:bg-amber-500/25">重试采集</button>
                </div>
              </div>}
              <BatchStage2Config key={runner.activeBatch?.id || 'draft'} />
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
              successfulItems={successfulItems}
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
      {/* 🌟 种草工坊全局生产预设中心模态框 */}
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
