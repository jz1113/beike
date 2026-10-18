import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFileDropZone } from '@client/shared/hooks/useFileDropZone';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { PreferredScraper } from '@client/shared/utils/externalScraperCredentials';
import { ArrowUp, Loader2, Download, Trash2, Upload, UploadCloud, ListPlus, Play, Pause, FolderDown, X } from 'lucide-react';
import {
  BatchTaskItem,
  extractUrlsFromRawText,
} from '@client/features/collect/model/collectorTypes';
import BatchTaskCard from './BatchTaskCard';
import { COLLECTOR_BATCH_LIMIT } from '../model/collectorTaskIdentity';
import ScraperEngineSelector from './ScraperEngineSelector';

export interface CollectorBatchPanelProps {
  batchInputMode: 'text' | 'file';
  setBatchInputMode: (v: 'text' | 'file') => void;
  preferredScraper?: PreferredScraper;
  setPreferredScraper?: (v: PreferredScraper) => void;
  batchTextarea: string;
  setBatchTextarea: (v: string) => void;
  handleAddTasksFromText: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onBatchFileSelect: (file: File) => void;
  isBatchImporting?: boolean;
  cancelBatchImport?: () => void;
  handleDownloadCsvTemplate: (e: React.MouseEvent) => void;
  batchTasks: BatchTaskItem[];
  setBatchTasks: React.Dispatch<React.SetStateAction<BatchTaskItem[]>>;
  isBatchRunning: boolean;
  batchExporting: boolean;
  batchSuccessCount: number;
  batchFailedCount: number;
  batchPendingCount: number;
  batchRunningCount: number;
  batchConcurrency?: number;
  setBatchConcurrency?: (v: number) => void;
  handlePauseBatchTasks: () => void;
  handleStartBatchTasks: () => void;
  handleBatchDownloadAllSuccessTasks: () => void;
  handleDownloadSingleZip: (item: any) => void;
  executeSingleTask: (task: BatchTaskItem) => Promise<BatchTaskItem>;
  setPreviewImageUrl: (v: string | null) => void;
}

export default function CollectorBatchPanel({
  batchInputMode,
  setBatchInputMode,
  preferredScraper,
  setPreferredScraper,
  batchTextarea,
  setBatchTextarea,
  handleAddTasksFromText,
  fileInputRef,
  onBatchFileSelect,
  isBatchImporting = false,
  cancelBatchImport,
  handleDownloadCsvTemplate,
  batchTasks,
  setBatchTasks,
  isBatchRunning,
  batchExporting,
  batchSuccessCount,
  batchFailedCount,
  batchPendingCount,
  batchRunningCount,
  batchConcurrency = 6,
  setBatchConcurrency,
  handlePauseBatchTasks,
  handleStartBatchTasks,
  handleBatchDownloadAllSuccessTasks,
  handleDownloadSingleZip,
  executeSingleTask,
  setPreviewImageUrl,
}: CollectorBatchPanelProps) {
  const batchTextareaRef = useRef<HTMLTextAreaElement>(null);
  const detectedInputCount = useMemo(() => extractUrlsFromRawText(batchTextarea).length, [batchTextarea]);

  useLayoutEffect(() => {
    const textarea = batchTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 200), 288)}px`;
  }, [batchTextarea]);

  const acceptBatchFile = (file: File) =>
    /\.(xlsx|xls|csv|tsv|txt)$/i.test(file.name) ||
    file.type.includes('spreadsheet') ||
    file.type === 'text/plain' ||
    file.type.includes('csv');

  const { dropZoneProps: batchFileDropProps } = useFileDropZone({
    onFiles: (files) => {
      if (files[0] && onBatchFileSelect) onBatchFileSelect(files[0]);
    },
    accept: acceptBatchFile,
    disabled: !onBatchFileSelect,
  });

  return (
    <div className="mx-auto max-w-[980px] space-y-5">
      {/* 批量导入入口模式切换 */}
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3">
          <div className="inline-flex max-w-full overflow-x-auto rounded-full bg-slate-200/70 p-1 ring-1 ring-black/[0.06] dark:bg-[#1B1B1E] dark:ring-white/[0.08]">
            <button
              type="button"
              onClick={() => setBatchInputMode('text')}
              className={`inline-flex min-w-[164px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${
                batchInputMode === 'text'
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-[#2C2C32] dark:text-white'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
              }`}
            >
              <ListPlus className="w-3.5 h-3.5" />
              <span>粘贴链接</span>
            </button>

            <button
              type="button"
              onClick={() => setBatchInputMode('file')}
              className={`inline-flex min-w-[164px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${
                batchInputMode === 'file'
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-[#2C2C32] dark:text-white'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>导入文件</span>
            </button>
          </div>

          <span className="text-xs text-slate-400 dark:text-slate-500">
            支持 .csv / .tsv / .xlsx / .xls / .txt，自动去重，每批最多 {COLLECTOR_BATCH_LIMIT} 条
          </span>
        </div>

        {/* 模式 A：多链接文本框粘贴 */}
        {batchInputMode === 'text' ? (
          <div className="mx-auto flex min-h-[300px] w-full max-w-[980px] flex-col rounded-[32px] border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#18181B]/80 px-6 pb-5 pt-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.12)] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:border-slate-300 dark:hover:border-white/20 focus-within:border-indigo-400 dark:focus-within:border-indigo-500/80 sm:px-9 sm:pb-6 sm:pt-7">
            <textarea
              ref={batchTextareaRef}
              rows={1}
              value={batchTextarea}
              onChange={(e) => setBatchTextarea(e.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing && batchTextarea.trim()) {
                  event.preventDefault();
                  handleAddTasksFromText();
                }
              }}
              placeholder={`从 Excel 复制一列链接到这里，或每行粘贴一个链接\n支持商品链接、社媒分享文案与商品 ID，自动识别平台并去重\nhttps://item.jd.com/1000123456.html\nhttps://www.xiaohongshu.com/discovery/item/...`}
              aria-label="粘贴要批量采集的商品或社媒链接"
              spellCheck={false}
              className="max-h-72 min-h-[200px] w-full resize-none overflow-auto border-0 bg-transparent p-0 text-sm leading-[1.85] text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-0 [scrollbar-width:thin]"
            />
            <div className="mt-4 flex min-h-9 items-center justify-between gap-3 border-t border-slate-100 dark:border-white/5 pt-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                <ScraperEngineSelector
                  value={preferredScraper}
                  onChange={setPreferredScraper}
                />
                <span className={`shrink-0 font-medium ${detectedInputCount > 0 ? 'text-slate-700 dark:text-slate-300' : ''}`} aria-live="polite">
                  {detectedInputCount > 0
                    ? `已识别 ${detectedInputCount} 条`
                    : batchTextarea.trim()
                      ? '暂未识别到有效链接或商品 ID'
                      : ''}
                </span>
                {batchTextarea.trim() && <span className="hidden sm:inline">⌘ / Ctrl + Enter 加入队列</span>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {batchTextarea && (
                  <button
                    type="button"
                    onClick={() => setBatchTextarea('')}
                    className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-medium text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-slate-200"
                    aria-label="清空批量链接输入框"
                  >
                    <X className="h-3.5 w-3.5" />清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddTasksFromText}
                  disabled={!batchTextarea.trim()}
                  aria-label={detectedInputCount > 0 ? `解析并加入 ${detectedInputCount} 条任务` : '解析并加入任务队列'}
                  title={detectedInputCount > 0 ? `解析并加入 ${detectedInputCount} 条任务` : '粘贴链接后加入任务队列'}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all ${
                    !batchTextarea.trim()
                      ? 'cursor-not-allowed bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-600'
                      : 'bg-slate-950 dark:bg-white text-white dark:text-slate-950 shadow-sm hover:bg-black dark:hover:bg-slate-100 active:scale-95'
                  }`}
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 模式 B：文件拖拽上传 */
          <div className="mx-auto max-w-[980px] space-y-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              {...batchFileDropProps}
              className="group flex min-h-[300px] w-full cursor-pointer flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-slate-300/80 dark:border-white/15 bg-white/80 dark:bg-[#18181B]/80 px-8 text-center backdrop-blur-xl transition hover:border-indigo-400 dark:hover:border-indigo-500/80 hover:bg-white dark:hover:bg-[#1E1E22]"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-100 text-slate-700 shadow-sm transition group-hover:-translate-y-1 group-hover:border-indigo-600 group-hover:bg-indigo-600 group-hover:text-white dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:group-hover:border-indigo-500 dark:group-hover:bg-indigo-500">
                <UploadCloud className="h-7 w-7" />
              </div>
              <div className="mt-5 text-lg font-black text-slate-900 dark:text-white">点击或拖拽上传批量采集表</div>
              <p className="mt-2 max-w-lg text-sm text-slate-400 dark:text-slate-500">支持 10 MB 以内 .xlsx、.xls、.csv、.tsv、.txt；数字 ID 可填写「所属平台」列，未填默认京东</p>
            </div>
            <div className="flex items-center justify-between px-2">
              <ScraperEngineSelector
                value={preferredScraper}
                onChange={setPreferredScraper}
              />
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 transition hover:text-blue-800 dark:hover:text-blue-300"
                title="下载标准 CSV 表格模板"
              >
                <Download className="h-3.5 w-3.5" />
                下载标准表格模板 (.csv)
              </button>
            </div>
          </div>
        )}
      </div>

      {isBatchImporting && (
        <div className="flex items-center justify-between rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/40 p-3 text-xs text-blue-700 dark:text-blue-300" role="status">
          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />正在读取导入文件...</span>
          <button type="button" onClick={cancelBatchImport} className="font-bold underline cursor-pointer">取消导入</button>
        </div>
      )}

      {/* 任务队列状态看板 */}
      {batchTasks.length > 0 && (
        <div className="p-5 rounded-3xl bg-white/85 dark:bg-[#18181B]/85 border border-slate-200/90 dark:border-white/10 shadow-sm backdrop-blur-xl space-y-4 animate-fade-in">
          {/* 进度与控制头部 */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900 dark:text-white">批量任务队列</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-mono font-bold">
                  共 {batchTasks.length} 个任务
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">✅ 成功: {batchSuccessCount}</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold">❌ 失败: {batchFailedCount}</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold">⏳ 待处理: {batchPendingCount}</span>
                {batchRunningCount > 0 && <span className="text-blue-600 dark:text-blue-400 font-bold animate-pulse">⚡ 进行中: {batchRunningCount}</span>}
              </div>
            </div>

            {/* 控制按钮组 */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 🌟 并发数调节器 */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100/90 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300">
                <span className="font-medium text-slate-500 dark:text-slate-400">并发:</span>
                <select
                  value={batchConcurrency}
                  onChange={(e) => setBatchConcurrency?.(Number(e.target.value))}
                  disabled={isBatchRunning || batchRunningCount > 0}
                  className="bg-transparent font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer text-xs"
                  title="本轮最多同时执行的任务数；遇到频率限制时可降低并发后重试"
                >
                  <option value={2} className="bg-white dark:bg-[#1C1C20]">2 线程 (稳定)</option>
                  <option value={4} className="bg-white dark:bg-[#1C1C20]">4 线程 (平稳)</option>
                  <option value={6} className="bg-white dark:bg-[#1C1C20]">6 线程 (推荐)</option>
                  <option value={8} className="bg-white dark:bg-[#1C1C20]">8 线程 (极速)</option>
                  <option value={12} className="bg-white dark:bg-[#1C1C20]">12 线程 (高并发)</option>
                </select>
              </div>

              {isBatchRunning ? (
                <button
                  type="button"
                  onClick={handlePauseBatchTasks}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>暂停采集</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartBatchTasks}
                  disabled={batchRunningCount > 0 || (batchPendingCount === 0 && batchFailedCount === 0)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    batchRunningCount > 0 || (batchPendingCount === 0 && batchFailedCount === 0)
                      ? 'bg-slate-100 dark:bg-white/10 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25'
                  }`}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{batchRunningCount > 0 ? '单项重试中' : batchFailedCount > 0 && batchPendingCount === 0 ? '重试失败项' : '开始本轮采集'}</span>
                </button>
              )}

              {/* 🌟 一键批量打包下载所有成功商品为 ZIP */}
              <button
                type="button"
                onClick={handleBatchDownloadAllSuccessTasks}
                disabled={batchSuccessCount === 0 || batchExporting}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  batchSuccessCount === 0 || batchExporting
                    ? 'bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-white/10 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                }`}
                title="将已成功采集的素材按商品分别打包，并按素材容量分卷下载。"
              >
                {batchExporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在打包下载...</span>
                  </>
                ) : (
                  <>
                    <FolderDown className="w-3.5 h-3.5" />
                    <span>一键批量打包下载 ({batchSuccessCount}款)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (await confirmAction('确定要清空当前批量任务列表吗？')) {
                    if (isBatchRunning || batchRunningCount > 0) handlePauseBatchTasks();
                    setBatchTasks([]);
                  }
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all cursor-pointer"
                title="清空队列"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 进度条 */}
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${(batchSuccessCount / batchTasks.length) * 100}%` }}
            />
            <div
              className="h-full bg-rose-500 transition-all duration-300"
              style={{ width: `${(batchFailedCount / batchTasks.length) * 100}%` }}
            />
            <div
              className="h-full bg-blue-500 animate-pulse transition-all duration-300"
              style={{ width: `${(batchRunningCount / batchTasks.length) * 100}%` }}
            />
          </div>

          {/* 任务列表详情 */}
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100 dark:divide-white/5" role="list" aria-label="批量采集任务列表">
            {batchTasks.map((task, idx) => (
              <BatchTaskCard
                key={task.id}
                task={task}
                index={idx}
                onRetry={async (t) => {
                  await executeSingleTask(t);
                }}
                retryDisabled={isBatchRunning}
                onRemove={(taskId) => setBatchTasks(prev => prev.filter(t => t.id !== taskId))}
                onPreview={(url) => setPreviewImageUrl(url)}
                onDownloadZip={handleDownloadSingleZip}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
