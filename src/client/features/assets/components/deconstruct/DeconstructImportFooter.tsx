import { ArrowRight, ArrowUpRight, Check, FileSpreadsheet, LoaderCircle, Sparkles, Square } from 'lucide-react';
import type { DeconstructQueueApi } from '../../hooks/useDeconstructQueue';
import type { useXhsBatchImport } from '../../hooks/useXhsBatchImport';

export function DeconstructImportFooter({ queueApi, xhsImport }: {
  queueApi: DeconstructQueueApi;
  xhsImport: ReturnType<typeof useXhsBatchImport>;
}) {
  const {
    targetSelectionInvalid,
    multimodalModels,
    queue, isDeconstructing,
    lastExportedCsvFilename, exportQueueCsv, runQueueDeconstruction,
    backgroundJobId, isSubmittingJob = false, handleStopBackgroundJob, handleCloseDeconstructModal,
  } = queueApi;
  const { deconstructSourceMode, xhsLinksInput, isParsingXhsLinks, handleBatchParseXhsLinks } = xhsImport;
  const isBusy = isDeconstructing || isParsingXhsLinks || isSubmittingJob;
  const hasLinks = deconstructSourceMode === 'xhs' && Boolean(xhsLinksInput.trim());
  const totalSelectedImages = queue
    .filter(item => item.status === 'pending' || item.status === 'error')
    .reduce((sum, item) => sum + item.images.filter((_, index) => !item.excludedImageIndices?.includes(index)).length, 0);
  const pendingCount = Math.floor(totalSelectedImages / 4);
  const completedCount = queue.filter(item => item.status === 'done').length;
  const busyLabel = isSubmittingJob ? '正在启动后台任务…' : '正在提取并按 4 张分组…';

  return (
    <footer className="deconstruct-import-footer">
      <div className="deconstruct-bottom-bar">
        <p className="deconstruct-submit-hint">
          {isBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
          <span>
          {isSubmittingJob ? '正在提交后台任务，请稍候…' : isDeconstructing ? '后台处理中 · 可随时收起窗口，右下角查看实时进度'
            : pendingCount > 0 ? `待反推 ${pendingCount} 组 · 共 ${pendingCount * 4} 张图片${completedCount ? ` · 已完成 ${completedCount} 组` : ''}`
              : completedCount > 0 ? `已完成 ${completedCount} 组 · 可查看结果或导出明细`
              : deconstructSourceMode === 'xhs' ? '提取后可预览、筛选图片，再开始反推' : '添加图片后，即可开始反推'}
          </span>
        </p>
        <div className="deconstruct-footer-actions">
          {queue.some(item => item.status === 'done') && (
            <button
              type="button"
              onClick={exportQueueCsv}
              className="deconstruct-action-button deconstruct-secondary-action"
              title={lastExportedCsvFilename ? `已导出：${lastExportedCsvFilename}` : '导出明细表格'}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />导出表格
            </button>
          )}
          {backgroundJobId && isDeconstructing && !isSubmittingJob && (
            <button type="button" onClick={handleStopBackgroundJob}
              title="取消尚未派发的图组；已经派发的请求继续收尾"
              className="deconstruct-action-button deconstruct-text-action">
              <Square className="h-3 w-3" />停止待派发
            </button>
          )}
          {isDeconstructing && !isSubmittingJob ? (
            <button type="button" onClick={handleCloseDeconstructModal}
              className="deconstruct-action-button deconstruct-primary-action">
              收起继续<ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={hasLinks ? handleBatchParseXhsLinks : () => { void runQueueDeconstruction(); }}
              disabled={isBusy || (!hasLinks && (targetSelectionInvalid || multimodalModels.length === 0 || pendingCount === 0))}
              className="deconstruct-action-button deconstruct-primary-action"
            >
              {isBusy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
              {isBusy ? busyLabel : hasLinks ? '提取参考图' : pendingCount ? `开始反推 · ${pendingCount} 组` : completedCount ? '本批已完成' : deconstructSourceMode === 'xhs' ? '提取参考图' : '开始反推'}
              {!isBusy && (hasLinks || deconstructSourceMode === 'xhs' && !pendingCount ? <ArrowRight className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />)}
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
