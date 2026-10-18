import { BatchDeliveryStatus } from '../BatchDeliveryStatus';
import { isDeliverableWorkshopResult, isUsableWorkshopResult, summarizeWorkshopResults } from '../../model/generation/workshopReadiness';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import { BatchProductItem } from '../../model/batchTypes';
import { BatchStage4Header } from './BatchStage4Header';
import { BatchStage4ProductItem } from './BatchStage4ProductItem';
import { BatchStage4GalleryView } from './BatchStage4GalleryView';

function describeImageStatus(product: BatchProductItem): { label: string; failed: boolean } {
  const tasks = (product.tasks || []).filter((task) => task.resultStatus !== 'superseded');
  const usable = tasks.filter(isUsableWorkshopResult).length;
  const failed = tasks.filter((task) => task.status === 'FAILURE').length;
  const running = tasks.filter((task) => task.status === 'IN_PROGRESS').length;
  const pending = tasks.filter((task) => task.status === 'PENDING').length;
  if (tasks.some(task => task.recoveryRequired)) return { label: `结果待核对 · ${usable}/${tasks.length}`, failed: false };
  if (tasks.length === 0) return { label: '图片待生成', failed: false };
  if (running > 0 || pending > 0) return { label: `${failed ? `失败 ${failed} 张 · ` : ''}${running ? '生成中' : '待继续'} ${usable}/${tasks.length}`, failed: failed > 0 };
  if (failed > 0 && usable === 0) return { label: '图片生成失败', failed: true };
  if (failed > 0) return { label: `部分失败 ${usable}/${tasks.length}`, failed: true };
  if (usable === tasks.length) return { label: '图片已完成', failed: false };
  return { label: `图片 ${usable}/${tasks.length}`, failed: false };
}

interface Props {
  successfulItems: BatchProductItem[];
  selectedVisionModel: string;
  availableImageModels: any[];
  selectedImageGenModel: string;
  setSelectedImageGenModel: (m: string) => void;
  selectedQuality: 'high' | 'medium' | 'low';
  setSelectedQuality: (q: 'high' | 'medium' | 'low') => void;
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  setSelectedAspect: (a: '3:4' | '1:1' | '9:16' | '16:9') => void;
  isGeneratingBatch: boolean;
  totalTaskCount: number;
  completedTaskCount: number;
  successTaskCount: number;
  failTaskCount: number;
  generateCopywritingForProduct: (item: BatchProductItem) => Promise<void>;
  updateItemCopywriting?: (itemId: string, copywriting: { title: string; content: string; tags?: string[] }) => void;
  generateAllCopywriting?: (options?: { force?: boolean }) => Promise<void>;
  retryFailedImageTasks?: () => Promise<void>;
  retrySingleShotTask?: (itemId: string, shotIndex: number) => Promise<void>;
  isExportingZip: boolean;
  exportingSingleItemId?: string | null;
  handleExportZip: () => Promise<void>;
  handleExportExcel: () => Promise<void>;
  handleExportSingleProductZip?: (item: BatchProductItem) => Promise<void>;
  handleDownloadSingleTaskImage?: (url: string, filename?: string) => Promise<void>;
  setPreviewImageUrl: (url: string | null) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  onRecheckTask?: (itemId: string, taskId: string) => Promise<void>;
  readOnly?: boolean;
  runControlStatus?: 'idle' | 'running' | 'paused';
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  onCancelRun?: () => void;
  onCompleteBatch?: () => void;
  onBackToPrompts?: () => void;
  onContinueGeneration?: () => Promise<void>;
  pipelineStatus?: string;
  onReviewTask?: (itemId: string, taskId: string, decision: 'accepted' | 'retry_requested' | 'rejected') => void;
  onAcknowledgeRecovery?: () => void;
}

export default function BatchStage4Queue({
  successfulItems,
  selectedVisionModel,
  availableImageModels,
  selectedImageGenModel,
  setSelectedImageGenModel,
  selectedQuality,
  setSelectedQuality,
  selectedAspect,
  setSelectedAspect,
  isGeneratingBatch,
  totalTaskCount,
  completedTaskCount,
  generateCopywritingForProduct,
  updateItemCopywriting,
  generateAllCopywriting,
  retryFailedImageTasks,
  retrySingleShotTask,
  isExportingZip,
  handleExportZip,
  handleExportExcel,
  handleExportSingleProductZip,
  handleDownloadSingleTaskImage,
  setPreviewImageUrl,
  onPreviewGallery,
  onRecheckTask,
  readOnly = false,
  runControlStatus = 'idle',
  onPauseRun,
  onResumeRun,
  onCancelRun,
  onCompleteBatch,
  onBackToPrompts,
  onContinueGeneration,
  pipelineStatus,
  onReviewTask,
  onAcknowledgeRecovery,
}: Props) {
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'gallery'>('single');

  // 确保 activeItemIndex 不越界
  const safeIndex = Math.min(Math.max(0, activeItemIndex), Math.max(0, successfulItems.length - 1));
  const currentItem = successfulItems[safeIndex];

  const summary = summarizeWorkshopResults(successfulItems);
  const hasExportableSuccess = successfulItems.some(item => item.tasks.some(isDeliverableWorkshopResult));
  const displayFailCount = successfulItems.flatMap(item => item.tasks || []).filter(task => task.resultStatus !== 'superseded' && task.status === 'FAILURE' && !task.recoveryRequired).length;
  const displaySuccessCount = summary.success;
  const busy = isGeneratingBatch || summary.running > 0;

  const currentModelName =
    availableImageModels.find(m => m.id === selectedImageGenModel)?.shortName
    || availableImageModels.find(m => m.id === selectedImageGenModel)?.name
    || selectedImageGenModel;

  return (
    <div className="mx-auto w-full max-w-[1840px] space-y-5 bg-transparent">
      {/* 🌟 顶层全景大盘 Header：整合生产大盘总览、商品切换条与交付导出动作 */}
      <BatchStage4Header
        isGeneratingBatch={isGeneratingBatch}
        totalTaskCount={totalTaskCount}
        completedTaskCount={completedTaskCount}
        displaySuccessCount={displaySuccessCount}
        displayFailCount={displayFailCount}
        recoveryTaskCount={summary.recovery}
        pendingTaskCount={summary.pending}
        hasExportableSuccess={hasExportableSuccess}
        currentModelName={currentModelName}
        showEngineSettings={showEngineSettings}
        setShowEngineSettings={setShowEngineSettings}
        availableImageModels={availableImageModels}
        selectedImageGenModel={selectedImageGenModel}
        setSelectedImageGenModel={setSelectedImageGenModel}
        selectedQuality={selectedQuality}
        setSelectedQuality={setSelectedQuality}
        selectedAspect={selectedAspect}
        setSelectedAspect={setSelectedAspect}
        viewMode={viewMode}
        setViewMode={setViewMode}
        generateAllCopywriting={generateAllCopywriting}
        handleExportZip={handleExportZip}
        handleExportExcel={handleExportExcel}
        isExportingZip={isExportingZip}
        successfulItems={successfulItems}
        safeIndex={safeIndex}
        setActiveItemIndex={setActiveItemIndex}
        readOnly={readOnly}
        runControlStatus={runControlStatus}
        onPauseRun={onPauseRun}
        onResumeRun={onResumeRun}
        onCancelRun={onCancelRun}
        onCompleteBatch={onCompleteBatch}
        onBackToPrompts={onBackToPrompts}
        pipelineStatus={pipelineStatus}
      />
      <BatchDeliveryStatus items={successfulItems} busy={busy} readOnly={readOnly} onRetryFailed={retryFailedImageTasks} onContinue={onContinueGeneration}
        onLocateFailure={() => {
          const failedIndices = successfulItems.flatMap((item, index) => item.tasks.some((task) => task.status === 'FAILURE' && task.resultStatus !== 'superseded') ? [index] : []);
          const next = failedIndices.find((index) => index > safeIndex) ?? failedIndices[0];
          if (next !== undefined) { setActiveItemIndex(next); setViewMode('single'); }
        }} />
      {!readOnly && onAcknowledgeRecovery && successfulItems.some((item) => (item.tasks || []).some((task) => task.recoveryRequired)) && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span>部分任务的提交或生成结果尚未确认。请先核对原任务；放弃恢复后重做可能重复计费，不会自动重提。</span>
          <button type="button" onClick={onAcknowledgeRecovery} disabled={busy} className="shrink-0 rounded-xl bg-amber-900 px-3 py-1.5 font-bold text-white">放弃恢复，允许重做</button>
        </div>
      )}

      {/* 视图展现 */}
      {viewMode === 'single' ? (
        currentItem ? (
          <BatchStage4ProductItem
            key={currentItem.id}
            item={currentItem}
            selectedVisionModel={selectedVisionModel}
            onReviewTask={onReviewTask}
            productNavigation={successfulItems.length > 1 ? (
              <nav aria-label="切换交付商品" className="min-w-0 rounded-xl border border-slate-200/60 bg-transparent p-3 dark:border-white/10">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">商品列表 <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">{successfulItems.length} 款</span></h3>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="上一个商品" title="上一个商品" disabled={safeIndex === 0}
                      onClick={() => setActiveItemIndex(safeIndex - 1)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-slate-400 dark:hover:bg-white/10">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{safeIndex + 1}/{successfulItems.length}</span>
                    <button type="button" aria-label="下一个商品" title="下一个商品" disabled={safeIndex === successfulItems.length - 1}
                      onClick={() => setActiveItemIndex(safeIndex + 1)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-slate-400 dark:hover:bg-white/10">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto space-y-1 [scrollbar-gutter:stable]">
                  {successfulItems.map((product, index) => {
                    const cover = product.selectedProductImages?.find(Boolean);
                    const copyFailed = Boolean(product.copywritingError);
                    const copyReady = Boolean(product.copywriting?.title && product.copywriting?.content);
                    const imageStatus = describeImageStatus(product);
                    return <button key={product.id} type="button" aria-current={index === safeIndex ? 'true' : undefined}
                      onClick={() => setActiveItemIndex(index)} title={product.title}
                      className={`w-full min-w-0 flex items-center gap-2.5 rounded-lg p-2 text-left transition-colors ${index === safeIndex ? 'bg-indigo-50 text-indigo-900 ring-1 ring-inset ring-indigo-200' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}>
                      <span className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-slate-50 dark:bg-white/5">
                        {cover && <LazyProxyImage src={cover} alt="" thumb width={80} className="!object-contain" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{index + 1}. {product.title}</span>
                        <span className={`block mt-1 text-[11px] ${imageStatus.failed ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'}`}>{imageStatus.label}</span>
                        <span className={`block text-[11px] ${copyFailed ? 'text-rose-600' : 'text-slate-400'}`}>
                          {copyFailed ? '文案失败，待重试' : copyReady ? '文案已就绪' : '文案待生成'}
                        </span>
                      </span>
                    </button>;
                  })}
                </div>
              </nav>
            ) : undefined}
            generateCopywritingForProduct={generateCopywritingForProduct}
            updateItemCopywriting={updateItemCopywriting}
            retrySingleShotTask={busy ? undefined : retrySingleShotTask}
            isExportingZip={isExportingZip}
            handleExportSingleProductZip={handleExportSingleProductZip}
            handleDownloadSingleTaskImage={handleDownloadSingleTaskImage}
            setPreviewImageUrl={setPreviewImageUrl}
            onPreviewGallery={onPreviewGallery}
            onRecheckTask={busy ? undefined : onRecheckTask}
            readOnly={readOnly}
          />
        ) : (
          <div className="p-12 text-center text-slate-400 text-xs">暂无待交付的商品</div>
        )
      ) : viewMode === 'gallery' ? (
        /* 画廊模式：一行 2 张大图快速审阅 */
        <BatchStage4GalleryView
          successfulItems={successfulItems}
          setActiveItemIndex={(index) => { setActiveItemIndex(index); setViewMode('single'); }}
          onPreviewGallery={onPreviewGallery}
          setPreviewImageUrl={setPreviewImageUrl}
        />
      ) : null}
    </div>
  );
}
