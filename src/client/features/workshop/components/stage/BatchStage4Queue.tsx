import { WorkshopContentList } from '../layout/WorkshopContentList';
import type { OutputRating } from '@shared/contracts/categorySkills';
import { BatchDeliveryStatus } from '../delivery/BatchDeliveryStatus';
import { isDeliverableWorkshopResult, isUsableWorkshopResult, summarizeWorkshopResults } from '../../model/generation/workshopReadiness';
import { useState, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { BatchProductItem } from '../../model/batchTypes';
import BatchStageFooter from './BatchStageFooter';
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
  focusedId?: string;
  onFocus?: (id: string) => void;
  successfulItems: BatchProductItem[];
  selectedVisionModel: string;
  availableImageModels: Array<{ id: string; name: string; shortName?: string }>;
  selectedImageGenModel: string;
  selectedQuality: 'high' | 'medium' | 'low';
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  isGeneratingBatch: boolean;
  generateCopywritingForProduct: (item: BatchProductItem) => Promise<void>;
  updateItemCopywriting?: (itemId: string, copywriting: { title: string; content: string; tags?: string[] }) => void;
  generateAllCopywriting?: (options?: { force?: boolean }) => Promise<void>;
  retryFailedImageTasks?: () => Promise<void>;
  retrySingleShotTask?: (itemId: string, shotIndex: number) => Promise<void>;
  isExportingZip: boolean;
  handleExportZip: () => Promise<void>;
  handleExportExcel: () => Promise<void>;
  handleDownloadSingleTaskImage?: (url: string, filename?: string) => Promise<void>;
  setPreviewImageUrl: (url: string | null) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  onRecheckTask?: (itemId: string, taskId: string) => Promise<void>;
  readOnly?: boolean;
  runControlStatus?: 'idle' | 'running' | 'paused';
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  onCancelRun?: () => void;
  onReviewBatch?: (decision: 'accepted' | 'rejected') => Promise<boolean>;
  isReviewingOutputs?: boolean;
  onContinueGeneration?: () => Promise<void>;
  onReviewTask?: (itemId: string, taskId: string, decision: 'accepted' | 'retry_requested' | 'rejected', rating?: OutputRating) => void;
  onAcknowledgeRecovery?: () => void;
}

export default function BatchStage4Queue({
  focusedId, onFocus,
  successfulItems,
  selectedVisionModel,
  availableImageModels,
  selectedImageGenModel,
  selectedQuality,
  selectedAspect,
  isGeneratingBatch,
  generateCopywritingForProduct,
  updateItemCopywriting,
  generateAllCopywriting,
  retryFailedImageTasks,
  retrySingleShotTask,
  isExportingZip,
  handleExportZip,
  handleExportExcel,
  handleDownloadSingleTaskImage,
  setPreviewImageUrl,
  onPreviewGallery,
  onRecheckTask,
  readOnly = false,
  runControlStatus = 'idle',
  onPauseRun,
  onResumeRun,
  onCancelRun,
  onReviewBatch,
  isReviewingOutputs = false,
  onContinueGeneration,
  onReviewTask,
  onAcknowledgeRecovery,
}: Props) {
  const [historyFocus, setHistoryFocus] = useState('');
  const activeItemIndex = successfulItems.findIndex(item => item.id === (focusedId ?? historyFocus));
  const setActiveItemIndex = (index: number) => {
    const item = successfulItems[index];
    if (item) (onFocus ?? setHistoryFocus)(item.id);
  };
  const [viewMode, setViewMode] = useState<'single' | 'gallery'>('single');

  // 确保 activeItemIndex 不越界
  const safeIndex = Math.min(Math.max(0, activeItemIndex), Math.max(0, successfulItems.length - 1));
  const currentItem = successfulItems[safeIndex];

  const summary = summarizeWorkshopResults(successfulItems);
  const hasExportableSuccess = successfulItems.some(item => item.tasks.some(isDeliverableWorkshopResult));
  const displayFailCount = successfulItems.flatMap(item => item.tasks || []).filter(task => task.resultStatus !== 'superseded' && task.status === 'FAILURE' && !task.recoveryRequired).length;
  const displaySuccessCount = summary.success;
  const busy = isGeneratingBatch || summary.running > 0;
  const copyBusy = successfulItems.some(item => item.isCopywritingGenerating);

  const currentModelName =
    availableImageModels.find(m => m.id === selectedImageGenModel)?.shortName
    || availableImageModels.find(m => m.id === selectedImageGenModel)?.name
    || selectedImageGenModel;

  return (
    <div className="w-full space-y-5 bg-transparent" style={{ '--workshop-output-aspect': selectedAspect.replace(':', ' / ') } as CSSProperties}>
      {/* 🌟 顶层全景大盘 Header：整合生产大盘总览、商品切换条与交付导出动作 */}
      <BatchStage4Header
        busy={busy}
        totalTaskCount={summary.total}
        completedTaskCount={summary.success + summary.failed}
        displaySuccessCount={displaySuccessCount}
        displayFailCount={displayFailCount}
        recoveryTaskCount={summary.recovery}
        pendingTaskCount={summary.pending}
        hasExportableSuccess={hasExportableSuccess}
        outputLabel={`${currentModelName} · ${selectedAspect} · ${selectedQuality === 'high' ? '高质量' : selectedQuality === 'medium' ? '标准质量' : '快速生成'}`}
        viewMode={viewMode}
        setViewMode={setViewMode}
        generateAllCopywriting={generateAllCopywriting}
        handleExportZip={handleExportZip}
        handleExportExcel={handleExportExcel}
        isExportingZip={isExportingZip} reviewing={isReviewingOutputs}
        successfulItems={successfulItems}
        readOnly={readOnly}
        runControlStatus={runControlStatus}
        onPauseRun={onPauseRun}
        onResumeRun={onResumeRun}
        onCancelRun={onCancelRun}
      />
      <BatchDeliveryStatus retryableFailures={displayFailCount} items={successfulItems} busy={busy} readOnly={readOnly} onRetryFailed={retryFailedImageTasks} onContinue={onContinueGeneration}
        onLocateFailure={() => {
          const failedIndices = successfulItems.flatMap((item, index) => item.tasks.some((task) => task.status === 'FAILURE' && !task.recoveryRequired && task.resultStatus !== 'superseded') ? [index] : []);
          const next = failedIndices.find((index) => index > safeIndex) ?? failedIndices[0];
          if (next !== undefined) { setActiveItemIndex(next); setViewMode('single'); }
        }} />
      {!readOnly && onAcknowledgeRecovery && successfulItems.some((item) => (item.tasks || []).some((task) => task.recoveryRequired)) && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
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
            isReviewingOutputs={isReviewingOutputs}
            productNavigation={successfulItems.length > 1 && <WorkshopContentList label="交付图文列表" items={successfulItems}
              currentId={currentItem.id} onSelect={onFocus ?? setHistoryFocus} status={row => {
                const copy = row.copywritingError ? '文案失败' : row.copywriting?.title && row.copywriting?.content ? '文案就绪' : '待补文案';
                return `${describeImageStatus(row).label} · ${copy}`;
              }} />}
            generateCopywritingForProduct={generateCopywritingForProduct}
            updateItemCopywriting={updateItemCopywriting}
            retrySingleShotTask={busy ? undefined : retrySingleShotTask}
            isExportingZip={isExportingZip}
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
          onReviewTask={onReviewTask}
          isReviewingOutputs={isReviewingOutputs}
          readOnly={readOnly}
        />
      ) : null}
      {!readOnly && onReviewBatch && <BatchStageFooter
        secondaryActions={<button type="button" onClick={() => void onReviewBatch('rejected')}
          disabled={busy || copyBusy || isReviewingOutputs || displaySuccessCount === 0}
          className="rounded-2xl border border-rose-200 px-5 py-3 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-950/30">审核驳回</button>}
        primaryAction={{ label: '审核通过', icon: <Check className="h-4 w-4" />, onClick: () => void onReviewBatch('accepted'), disabled: busy || copyBusy || isReviewingOutputs || summary.recovery > 0 || !hasExportableSuccess }} />}
    </div>
  );
}
