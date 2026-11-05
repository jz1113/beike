import { useState } from 'react';
import type { WorkshopCanvasStage } from '@shared/domain/workshop/workshopCanvas';
import type { useBatchWorkshopRunner } from '../../hooks/useBatchWorkshopRunner';
import BatchStage1Collect from '../stage/BatchStage1Collect';
import BatchStage2Config from '../stage/BatchStage2Config';
import BatchStage3Prompts from '../stage/BatchStage3Prompts';
import BatchStage4Queue from '../stage/BatchStage4Queue';
import { WorkshopProductionSummary } from '../settings/WorkshopProductionSummary';
import { WorkshopCanvasDelivery } from './WorkshopCanvasDelivery';
import { WorkshopAssetBindings } from '../settings/WorkshopAssetBindings';
import { isUsableWorkshopResult } from '../../model/generation/workshopReadiness';

export function WorkshopCanvasStages({ runner: r, stage, onStage, onSettings, onSkills }: {
  runner: ReturnType<typeof useBatchWorkshopRunner>; stage: WorkshopCanvasStage;
  onStage: (stage: WorkshopCanvasStage) => void; onSettings: () => void; onSkills: () => void;
}) {
  const [focusedId, onFocus] = useState('');
  if (stage === 'collect') return <div className="p-4"><BatchStage1Collect
    batchInputText={r.batchInputText} setBatchInputText={r.setBatchInputText} items={r.items} setItems={r.setItems}
    isCollecting={r.isCollecting} collectProgress={r.collectProgress} handleParseInput={r.handleParseInput}
    handleTableImport={r.handleTableImport} startBatchCollect={r.startBatchCollect} busy={r.flow.busy} />
    <button type="button" className="mt-4 rounded-lg border px-4 py-2" onClick={() => onStage('images')}>打开商品选图与设置节点</button></div>;
  if (stage === 'images') return <div className="p-4">
    <WorkshopProductionSummary runner={r} onOpenSettings={onSettings} onOpenSkills={onSkills} />
    {r.activeBatch && <WorkshopAssetBindings snapshot={r.activeBatch.snapshot} />}
    {!r.successfulItems.length && <p className="py-6">先在商品采集节点添加商品。</p>}
    <fieldset disabled={r.flow.busy} className="min-w-0"><BatchStage2Config successfulItems={r.successfulItems} setItems={r.setItems} focusedId={focusedId} onFocus={onFocus}
      activeImgFilter={r.activeImgFilter} setActiveImgFilter={r.setActiveImgFilter} toggleProductImageSelection={r.toggleProductImageSelection}
      batchSetProductImages={r.batchSetProductImages} handleRemoveItem={r.handleRemoveItem} onPreviewGallery={r.openGalleryPreview}
      onPreviewImage={url => r.openGalleryPreview([url], 0)} busy={r.flow.busy} onNextStage={() => onStage('storyboard')} /></fieldset>
  </div>;
  if (stage === 'storyboard') return <BatchStage3Prompts
    settings={<WorkshopProductionSummary runner={r} onOpenSettings={onSettings} onOpenSkills={onSkills} />}
    focusedId={focusedId} onFocus={onFocus} flow={r.flow} selectedShotCount={r.selectedShotCount} generationStrategy={r.generationStrategy}
    successfulItems={r.successfulItems} setItems={r.setItems} isAnalyzingAll={r.isAnalyzingAll} analyzeProgress={r.analyzeProgress}
    startBatchVisionAnalyze={ids => r.startBatchVisionAnalyze(r.selectedArchId, { productIds: ids })} analyzeSingleProduct={r.analyzeSingleProduct}
    handleRemoveItem={r.handleRemoveItem} startBatchGeneration={async () => onStage('generate')} generationActionLabel="确认方案，打开图片生成节点" onPreviewImage={url => r.openGalleryPreview([url], 0)}
    onPrevStage={() => onStage('images')} onGoToStage={value => onStage(value === 2 ? 'images' : 'generate')} analysisIssue={r.analysisIssue} />;
  if (stage === 'copy' || stage === 'export') return <WorkshopCanvasDelivery runner={r} mode={stage} />;
  const complete = r.successfulItems.length > 0 && r.successfulItems.every(item => item.prompts.length > 0 && item.prompts.filter(shot => shot.selected !== false).every(shot => item.tasks.some(task => task.shot_no === shot.shot_no && isUsableWorkshopResult(task))));
  return <div className="space-y-4 p-3"><div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
    <button type="button" disabled={complete || r.flow.busy || !r.flow.readiness.canGenerate} className="rounded-lg bg-indigo-600 px-4 py-3 text-sm text-white disabled:opacity-40" onClick={event => { if (event.detail <= 1) void r.startBatchGeneration(); }}>{complete ? '图片已完成' : '生成未完成图片'}</button>
    {!r.flow.readiness.canGenerate && !r.flow.busy && <p className="text-xs text-slate-500">先在选图与分镜节点完成参考图和提示词，再开始生成。</p>}
  </div><BatchStage4Queue focusedId={focusedId} onFocus={onFocus}
    successfulItems={r.items.filter(item => (item.selected && item.status === 'success') || item.tasks.some(task => task.recoveryRequired))}
    selectedVisionModel={r.selectedVisionModel} availableImageModels={r.availableImageModels} selectedImageGenModel={r.selectedImageGenModel}
    selectedQuality={r.selectedQuality} selectedAspect={r.selectedAspect} isGeneratingBatch={r.isGeneratingBatch}
    generateCopywritingForProduct={r.generateCopywritingForProduct} updateItemCopywriting={r.updateItemCopywriting} generateAllCopywriting={r.generateAllCopywriting}
    retryFailedImageTasks={r.retryFailedImageTasks} retrySingleShotTask={r.retrySingleShotTask} isExportingZip={r.isExportingZip}
    handleExportZip={r.handleExportZip} handleExportExcel={r.handleExportExcel} handleDownloadSingleTaskImage={r.handleDownloadSingleTaskImage}
    setPreviewImageUrl={r.setPreviewImageUrl} onPreviewGallery={r.openGalleryPreview}
    runControlStatus={r.isGeneratingBatch && r.pipelineStatus === 'paused' ? 'paused' : r.isGeneratingBatch ? 'running' : 'idle'}
    onPauseRun={r.pauseRun} onResumeRun={r.resumeRun} onCancelRun={r.cancelRun} onReviewBatch={r.reviewBatch}
    isReviewingOutputs={r.isReviewingOutputs} onContinueGeneration={r.startBatchGeneration} onRecheckTask={r.recheckTask}
    onReviewTask={r.reviewTask} onAcknowledgeRecovery={r.acknowledgeRecovery} /></div>;
}
