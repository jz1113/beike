import { ArrowUpRight, FileSpreadsheet, LoaderCircle, Square } from 'lucide-react';
import type { DeconstructQueueApi } from '../hooks/useDeconstructQueue';
import type { useXhsBatchImport } from '../hooks/useXhsBatchImport';
import { deconstructImportTargetHint } from '../model/deconstructImportTarget';
import { DeconstructCategoryPicker } from './DeconstructCategoryPicker';

export function DeconstructImportFooter({ queueApi, xhsImport }: {
  queueApi: DeconstructQueueApi;
  xhsImport: ReturnType<typeof useXhsBatchImport>;
}) {
  const {
    targetCategory, setTargetCategory, targetSubcategory, setTargetSubcategory, productCategories,
    targetSelectionInvalid,
    selectedVisionModel, setSelectedVisionModel, multimodalModels,
    queueConcurrency, handleQueueConcurrencyChange, queue, isDeconstructing,
    lastExportedCsvFilename, exportQueueCsv, runQueueDeconstruction,
    backgroundJobId, isSubmittingJob = false, handleStopBackgroundJob, handleCloseDeconstructModal,
  } = queueApi;
  const { deconstructSourceMode, xhsLinksInput, isParsingXhsLinks, handleBatchParseXhsLinks } = xhsImport;
  const isBusy = isDeconstructing || isParsingXhsLinks || isSubmittingJob;
  const hasLinks = deconstructSourceMode === 'xhs' && Boolean(xhsLinksInput.trim());
  const pendingCount = queue.filter(item => (item.status === 'pending' || item.status === 'error')
    && item.images.some((_, index) => !item.excludedImageIndices?.includes(index))).length;
  const completedCount = queue.filter(item => item.status === 'done').length;
  const fieldClass = 'flex min-w-0 flex-col gap-1.5';
  const selectClass = 'h-10 w-full min-w-0 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-400 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]';
  const busyLabel = isSubmittingJob ? '正在启动后台任务…' : '正在采集链接…';

  return (
    <div className="deconstruct-import-footer shrink-0 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6 dark:bg-white/5 dark:border-white/10">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_100px]">
          <DeconstructCategoryPicker
            value={targetCategory}
            onChange={setTargetCategory}
            subcategory={targetSubcategory}
            onSubcategoryChange={setTargetSubcategory}
            categories={productCategories}
            disabled={isBusy}
          />
          <label className={fieldClass}>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">反推模型</span>
            <select
              aria-label="反推视觉模型"
              value={selectedVisionModel}
              onChange={event => setSelectedVisionModel(event.target.value)}
              disabled={isBusy || multimodalModels.length === 0}
              className={selectClass}
            >
              {multimodalModels.length === 0 ? <option value="">未配置模型</option>
                : multimodalModels.map(model => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
            </select>
          </label>
          <label className={fieldClass}>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">并发图集</span>
            <select
              aria-label="反推并发"
              value={queueConcurrency}
              onChange={event => handleQueueConcurrencyChange(Number(event.target.value) || 4)}
              disabled={isBusy}
              className={selectClass}
              title="本批次同时处理的图集数量"
            >
              {[1, 2, 4, 8].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      <p className={`mt-2 text-[11px] leading-5 ${targetSelectionInvalid ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'}`} aria-live="polite">
        {targetSelectionInvalid ? '所选归档文件夹已删除或不再属于当前大类，请重新选择。'
          : deconstructImportTargetHint(targetCategory, targetSubcategory, productCategories)}
        {targetSelectionInvalid && <button type="button" onClick={() => setTargetCategory(targetCategory)}
          className="ml-2 font-medium text-indigo-600 hover:underline">清除失效选择</button>}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-3 dark:border-white/10">
        <p className="min-w-0 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          {isSubmittingJob ? '正在提交后台任务，请稍候…' : isDeconstructing ? '后台处理中 · 停止仅取消待派发图集，已派发请求继续收尾'
            : pendingCount > 0 ? `${pendingCount} 套待处理${completedCount ? ` · ${completedCount} 套已完成` : ''} · 右下角查看进度与结果`
              : completedCount > 0 ? `${completedCount} 套已完成 · 可查看图集或导出明细`
              : '先添加参考图集，再确认图片并启动反推'}
        </p>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
          {queue.some(item => item.status === 'done') && (
            <button
              type="button"
              onClick={exportQueueCsv}
              className="deconstruct-action-button flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10 dark:border-white/10 dark:bg-[#18191c]"
              title={lastExportedCsvFilename ? `已导出：${lastExportedCsvFilename}` : '导出明细表格'}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />导出表格
            </button>
          )}
          {backgroundJobId && isDeconstructing && !isSubmittingJob && (
            <button type="button" onClick={handleStopBackgroundJob}
              title="取消尚未派发的图集；已经派发的请求继续收尾"
              className="deconstruct-action-button flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/70 dark:text-slate-300">
              <Square className="h-3 w-3" />停止待派发
            </button>
          )}
          {isDeconstructing && !isSubmittingJob ? (
            <button type="button" onClick={handleCloseDeconstructModal}
              className="deconstruct-action-button flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-indigo-500">
              收起继续<ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : (
          <button
            type="button"
            onClick={hasLinks ? handleBatchParseXhsLinks : () => { void runQueueDeconstruction(); }}
            disabled={isBusy || (!hasLinks && (targetSelectionInvalid || multimodalModels.length === 0 || pendingCount === 0))}
            className="deconstruct-action-button flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-indigo-500 disabled:cursor-default disabled:opacity-40"
          >
            {isBusy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            {isBusy ? busyLabel : hasLinks ? '采集图片供选择' : pendingCount ? `后台反推 ${pendingCount} 套` : completedCount ? '本批已完成' : '启动后台反推'}
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
