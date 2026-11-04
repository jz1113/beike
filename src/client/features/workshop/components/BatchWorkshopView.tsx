import { createPortal } from 'react-dom';
import { WorkshopOutputPreview } from './product/WorkshopOutputPreview';
import { WorkshopContentList } from './layout/WorkshopContentList';
import { WorkshopStageNavigation } from './layout/WorkshopStageNavigation';
import { WorkspaceSaveNotice } from './layout/WorkspaceSaveNotice';
import { useEffect, useState } from 'react';
import { useBatchWorkshopRunner } from '../hooks/useBatchWorkshopRunner';
import BatchStage1Collect from './stage/BatchStage1Collect';
import BatchStage2Config from './stage/BatchStage2Config';
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
export type { TypedProductImage, BatchProductItem };
export default function BatchWorkshopView({ onOpenSkills, stageNavigationTarget }: { stageNavigationTarget: HTMLElement | null; onOpenSkills: () => void }) {
  const runner = useBatchWorkshopRunner();
  const freshEntry = useAppStore(s => s.pendingFreshWorkshopEntry);
  const isWorkshopConfigOpen = useAppStore(s => s.isWorkshopConfigOpen);
  const setIsWorkshopConfigOpen = useAppStore(s => s.setIsWorkshopConfigOpen);
  const [historyGenerationBatch, setHistoryGenerationBatch] = useState<WorkshopBatch | null>(null);
  const [isHistoryExporting, setIsHistoryExporting] = useState(false);
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
    handleExportZip,
    handleExportExcel,
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
  const [focus, setFocus] = useState({ batch: '', id: '' });
  const batchId = activeBatch?.id || '';
  const focusedId = focus.batch === batchId ? focus.id : '';
  const focusContent = (id: string) => setFocus({ batch: batchId, id });
  const flow = runner.flow;
  const editingProduct = currentStage === 1 || currentStage === 2;
  const pendingCollection = items.filter(item => item.status === 'pending' || item.status === 'failed').length;
  const selectedContentId = (successfulItems.find(item => item.id === focusedId) ?? successfulItems[0])?.id;
  const importing = currentStage === 1 || !successfulItems.length;
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
      {!historyGenerationBatch && stageNavigationTarget && createPortal(<WorkshopStageNavigation stage={currentStage} flow={flow} onSelect={selectStage} />, stageNavigationTarget)}
      <div key={historyGenerationBatch?.id || (editingProduct ? 'products' : currentStage)} className="workshop-main-scroll">
        <div className="w-full min-w-0">
          {historyGenerationBatch ? (
            <BatchWorkshopHistoryPreview
              batch={historyGenerationBatch}
              runner={runner}
              isHistoryExporting={isHistoryExporting}
              setIsHistoryExporting={setIsHistoryExporting}
              onClose={() => setHistoryGenerationBatch(null)}
            />
          ) : editingProduct && <div className="workshop-product-layout">
            <aside className="workshop-product-rail" aria-label="商品与批次内容">
              <header className="workshop-pane-heading"><h2>商品资料</h2>
                {successfulItems.length > 0 && <button type="button" disabled={flow.busy} aria-expanded={importing}
                  onClick={() => selectStage(importing ? 2 : 1)}>{importing ? '收起商品导入' : '添加商品'}</button>}
              </header>
            <div hidden={!importing}><BatchStage1Collect
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
              busy={flow.busy}
            /></div>
              {pendingCollection > 0 && !importing && <button type="button" disabled={flow.busy} className="workshop-rail-notice" onClick={() => selectStage(1)}>处理待采集内容（{pendingCollection} 条）</button>}
              {successfulItems.length > 0 && <WorkshopContentList label="本批图文" items={successfulItems} currentId={selectedContentId}
                onSelect={focusContent} status={row => row.selectedProductImages.length ? `已选 ${row.selectedProductImages.length} 张参考图` : '待选参考图'} />}
            </aside>
            <div className="workshop-product-editor">
            {successfulItems.length > 0 && <fieldset disabled={flow.busy} className="min-w-0">
              <BatchStage2Config key={runner.activeBatch?.id} successfulItems={successfulItems} setItems={setItems} focusedId={focusedId} onFocus={focusContent}
                activeImgFilter={activeImgFilter} setActiveImgFilter={setActiveImgFilter}
                toggleProductImageSelection={toggleProductImageSelection} batchSetProductImages={batchSetProductImages}
                handleRemoveItem={handleRemoveItem} onPreviewGallery={openGalleryPreview}
                onPreviewImage={url => openGalleryPreview([url], 0)} busy={flow.busy} onNextStage={() => selectStage(3)} />
            </fieldset>}
              {!successfulItems.length && <WorkshopOutputPreview shotCount={selectedShotCount} aspect={selectedAspect} strategy={generationStrategy}
                pending={pendingCollection} collecting={isCollecting} busy={flow.busy || runner.isAutoPilotRunning}
                onMode={(mode, count) => { runner.setGenerationStrategy(mode); if (mode === 'single_shot') runner.setSelectedShotCount(count); }}
                onSettings={() => setIsWorkshopConfigOpen(true)} />}
            </div>
          </div>}

          {!historyGenerationBatch && currentStage === 3 && (
            <BatchStage3Prompts
              settings={<WorkshopProductionSummary runner={runner} onOpenSkills={onOpenSkills} onOpenSettings={() => setIsWorkshopConfigOpen(true)} />}
              focusedId={focusedId} onFocus={focusContent}
              flow={flow}
              generationStrategy={generationStrategy}
              selectedShotCount={selectedShotCount}
              successfulItems={successfulItems}
              setItems={setItems}
              isAnalyzingAll={isAnalyzingAll}
              analyzeProgress={analyzeProgress}
              startBatchVisionAnalyze={(productIds) => startBatchVisionAnalyze(selectedArchId, { productIds })}
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
            <BatchStage4Queue focusedId={focusedId} onFocus={focusContent}
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
              handleExportZip={handleExportZip}
              handleExportExcel={handleExportExcel}
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
        onOpenSkills={onOpenSkills}
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
