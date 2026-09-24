import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import { BatchProductItem } from '../model/batchTypes';
import { BatchStage4Header } from './BatchStage4Header';
import { BatchStage4ProductItem } from './BatchStage4ProductItem';
import { BatchStage4GalleryView } from './BatchStage4GalleryView';
import { isEphemeralResultUrl } from '../model/workspaceRecovery';

function describeImageStatus(product: BatchProductItem): { label: string; failed: boolean } {
  const tasks = product.tasks || [];
  const usable = tasks.filter((task) => task.status === 'SUCCESS' && task.resultUrl && !isEphemeralResultUrl(task.resultUrl)).length;
  const failed = tasks.filter((task) => task.status === 'FAILURE').length;
  const running = tasks.filter((task) => task.status === 'IN_PROGRESS' || task.status === 'PENDING').length;
  if (tasks.length === 0) return { label: '图片待生成', failed: false };
  if (running > 0) return { label: `生成中 ${usable}/${tasks.length}`, failed: false };
  if (failed > 0 && usable === 0) return { label: '图片生成失败', failed: true };
  if (failed > 0) return { label: `部分失败 ${usable}/${tasks.length}`, failed: true };
  if (usable === tasks.length) return { label: '图片已完成', failed: false };
  return { label: `图片 ${usable}/${tasks.length}`, failed: false };
}

interface Props {
  successfulItems: BatchProductItem[];
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
  readOnly?: boolean;
  runControlStatus?: 'idle' | 'running' | 'paused';
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  onCancelRun?: () => void;
  onCompleteBatch?: () => void;
  onBackToPrompts?: () => void;
  pipelineStatus?: string;
  onReviewTask?: (itemId: string, taskId: string, decision: 'accepted' | 'retry_requested' | 'rejected') => void;
  onAcknowledgeRecovery?: () => void;
}

export default function BatchStage4Queue({
  successfulItems,
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
  successTaskCount,
  failTaskCount,
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
  readOnly = false,
  runControlStatus = 'idle',
  onPauseRun,
  onResumeRun,
  onCancelRun,
  onCompleteBatch,
  onBackToPrompts,
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

  const hasExportableSuccess = successfulItems.some(item =>
    (item.tasks || []).some(t => t.status === 'SUCCESS' && !!t.resultUrl),
  );

  const liveFailCount = successfulItems.reduce(
    (n, item) => n + (item.tasks || []).filter(t => t.status === 'FAILURE' && !t.resultUrl).length,
    0,
  );

  const displayFailCount = isGeneratingBatch ? failTaskCount : Math.max(failTaskCount, liveFailCount);
  const displaySuccessCount = isGeneratingBatch
    ? successTaskCount
    : successfulItems.reduce(
        (n, item) => n + (item.tasks || []).filter(t => t.status === 'SUCCESS' && !!t.resultUrl).length,
        0,
      );

  const currentModelName =
    availableImageModels.find(m => m.id === selectedImageGenModel)?.shortName
    || availableImageModels.find(m => m.id === selectedImageGenModel)?.name
    || selectedImageGenModel;

  return (
    <div className={`relative w-full space-y-5 rounded-3xl bg-slate-50 border border-slate-200/70 p-3 sm:p-5 ${viewMode === 'single' && successfulItems.length > 1 ? 'pr-16 sm:pr-20' : ''}`}>
      {viewMode === 'single' && successfulItems.length > 1 && (
        <nav aria-label="快速切换商品" className="absolute right-2 sm:right-3 top-64 flex flex-col items-center gap-3">
          <button type="button" aria-label="上一个商品" title="上一个商品" disabled={safeIndex === 0}
            onClick={() => setActiveItemIndex(Math.max(0, safeIndex - 1))}
            className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronUp className="h-5 w-5" /><span className="text-[10px]">上一个</span>
          </button>
          <span className="text-[10px] text-slate-400 tabular-nums">{safeIndex + 1}/{successfulItems.length}</span>
          <button type="button" aria-label="下一个商品" title="下一个商品" disabled={safeIndex === successfulItems.length - 1}
            onClick={() => setActiveItemIndex(Math.min(successfulItems.length - 1, safeIndex + 1))}
            className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronDown className="h-5 w-5" /><span className="text-[10px]">下一个</span>
          </button>
        </nav>
      )}
      {/* 🌟 顶层全景大盘 Header：整合生产大盘总览、商品切换条与交付导出动作 */}
      <BatchStage4Header
        isGeneratingBatch={isGeneratingBatch}
        totalTaskCount={totalTaskCount}
        completedTaskCount={completedTaskCount}
        displaySuccessCount={displaySuccessCount}
        displayFailCount={displayFailCount}
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
      {!readOnly && onAcknowledgeRecovery && successfulItems.some((item) => (item.tasks || []).some((task) => task.recoveryRequired)) && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span>有任务在刷新前未完成，结果待核实。确认后可以重新生成，不会自动重提旧任务。</span>
          <button type="button" onClick={onAcknowledgeRecovery} className="shrink-0 rounded-xl bg-amber-900 px-3 py-1.5 font-bold text-white">确认并重做</button>
        </div>
      )}

      {/* 视图展现 */}
      {viewMode === 'single' ? (
        currentItem ? (
          <BatchStage4ProductItem
            key={currentItem.id}
            item={currentItem}
            onReviewTask={onReviewTask}
            productNavigation={successfulItems.length > 1 ? (
              <nav aria-label="切换交付商品" className="rounded-2xl border border-slate-200/80 bg-white p-3">
                <h3 className="px-2 py-2 text-xs font-semibold text-slate-600">商品列表 · {successfulItems.length} 款</h3>
                <div className="max-h-80 overflow-y-auto space-y-1.5">
                  {successfulItems.map((product, index) => {
                    const cover = product.selectedProductImages?.[0] || product.coverImage;
                    const copyFailed = Boolean(product.copywritingError);
                    const copyReady = Boolean(product.copywriting?.title && product.copywriting?.content);
                    const imageStatus = describeImageStatus(product);
                    return <button key={product.id} type="button" aria-current={index === safeIndex ? 'true' : undefined}
                      onClick={() => setActiveItemIndex(index)} title={product.title}
                      className={`w-full flex items-center gap-3 rounded-xl p-2 text-left transition-colors ${index === safeIndex ? 'bg-indigo-50 text-indigo-900 ring-1 ring-inset ring-indigo-200' : 'text-slate-600 hover:bg-slate-50'}`}>
                      <span className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-slate-50">
                        {cover && <LazyProxyImage src={cover} alt="" thumb width={80} className="!object-contain" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{index + 1}. {product.title}</span>
                        <span className={`block mt-1 text-[11px] ${imageStatus.failed ? 'text-rose-600' : 'text-slate-500'}`}>{imageStatus.label}</span>
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
            retryFailedImageTasks={retryFailedImageTasks}
            retrySingleShotTask={retrySingleShotTask}
            isExportingZip={isExportingZip}
            handleExportSingleProductZip={handleExportSingleProductZip}
            handleDownloadSingleTaskImage={handleDownloadSingleTaskImage}
            setPreviewImageUrl={setPreviewImageUrl}
            onPreviewGallery={onPreviewGallery}
            readOnly={readOnly}
          />
        ) : (
          <div className="p-12 text-center text-slate-400 text-xs">暂无待交付的商品</div>
        )
      ) : viewMode === 'gallery' ? (
        /* 画廊模式：一行 2 张大图快速审阅 */
        <BatchStage4GalleryView
          successfulItems={successfulItems}
          setActiveItemIndex={setActiveItemIndex}
          onPreviewGallery={onPreviewGallery}
          setPreviewImageUrl={setPreviewImageUrl}
        />
      ) : null}
    </div>
  );
}
