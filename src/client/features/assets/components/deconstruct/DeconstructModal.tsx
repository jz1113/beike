import React from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen,
  RefreshCw,
  Upload,
  FolderUp,
  Layers,
  Sparkles,
} from 'lucide-react';
import { getFilesFromDataTransfer } from '../../model/assetFolderImport';
import { QueueImageSet } from '../cards/QueueImageSet';
import { formatXhsLinksToOnePerLine, parseXhsUrlsFromText } from '@client/shared/utils/xhsLinkBatch';
import { organizeQueueIntoFourImageGroups, selectedQueueImages } from '../../hooks/deconstructQueueOps';
import type { DeconstructQueueApi } from '../../hooks/useDeconstructQueue';
import type { useXhsBatchImport } from '../../hooks/useXhsBatchImport';
import { DeconstructImportFooter } from './DeconstructImportFooter';
import { DeconstructImportHeader } from './DeconstructImportHeader';
import '../../deconstruct-import.css';

type XhsImportApi = ReturnType<typeof useXhsBatchImport>;

export type DeconstructModalProps = {
  queueApi: DeconstructQueueApi;
  xhsImport: XhsImportApi;
  showToast: (msg: string) => void;
};

export default function DeconstructModal({ queueApi, xhsImport }: DeconstructModalProps) {
  const {
    showDeconstructModal,
    productCategories,
    queue,
    setQueue,
    isDeconstructing,
    processingQueueCount,
    progressById,
    elapsedSeconds,
    fileInputRef,
    folderInputRef,
    handleCloseDeconstructModal,
    processFilesOrFolders,
    isSubmittingJob = false,
  } = queueApi;

  const {
    deconstructSourceMode,
    setDeconstructSourceMode,
    xhsLinksInput,
    setXhsLinksInput,
    showXhsLinkInput,
    openXhsLinkInput,
    isParsingXhsLinks,
    xhsParseProgress,
    collectionIssues,
  } = xhsImport;

  const candidateUrls = React.useMemo(() => parseXhsUrlsFromText(xhsLinksInput), [xhsLinksInput]);
  const hasLinks = Boolean(xhsLinksInput.trim());
  const linkCount = candidateUrls.length;
  const isBusy = isParsingXhsLinks || isDeconstructing || isSubmittingJob;
  const shouldShowXhsLinkInput = showXhsLinkInput || queue.length === 0 || isParsingXhsLinks;
  const completedCount = queue.filter((item) => item.status === 'done' || item.status === 'error').length;
  const activeProgress = queue.find((item) => item.status === 'processing' && progressById[item.id]);
  const needsRegroup = queue.some(
    (item) => (item.status === 'pending' || item.status === 'error') && (item.images.length !== 4 || selectedQueueImages(item).length !== 4),
  );

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleFormatLinks = () => {
    if (!xhsLinksInput.trim()) return;
    setXhsLinksInput(formatXhsLinksToOnePerLine(xhsLinksInput));
  };

  const toggleQueueImage = React.useCallback((itemId: string, imageIndex: number) => {
    if (isBusy) return;
    setQueue((prev) => {
      const queueIndex = prev.findIndex((item) => item.id === itemId);
      if (queueIndex < 0) return prev;
      const item = prev[queueIndex];
      const excluded = new Set(item.excludedImageIndices || []);
      if (excluded.has(imageIndex)) excluded.delete(imageIndex);
      else if (item.images.length - excluded.size > 1) excluded.add(imageIndex);
      else return prev;
      const next = [...prev];
      next[queueIndex] = { ...item, excludedImageIndices: [...excluded].sort((a, b) => a - b) };
      return next;
    });
  }, [isBusy, setQueue]);

  const removeQueueItem = React.useCallback((itemId: string) => {
    if (isBusy) return;
    setQueue((prev) => prev.filter((item) => item.id !== itemId));
  }, [isBusy, setQueue]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasteText = e.clipboardData.getData('text');
    if (
      pasteText &&
      (pasteText.includes('http') ||
        pasteText.includes('xhslink') ||
        pasteText.includes('xiaohongshu') ||
        pasteText.includes('xsec_') ||
        pasteText.includes('\n'))
    ) {
      e.preventDefault();
      const formatted = formatXhsLinksToOnePerLine(pasteText);
      if (formatted) {
        const current = xhsLinksInput.trim();
        const combined = current ? `${current}\n${formatted}` : formatted;
        setXhsLinksInput(formatXhsLinksToOnePerLine(combined));
      }
    }
  };

  React.useEffect(() => {
    if (xhsLinksInput && (/\n\s*xsec_/i.test(xhsLinksInput) || /\?\s*\n/i.test(xhsLinksInput))) {
      const formatted = formatXhsLinksToOnePerLine(xhsLinksInput);
      if (formatted !== xhsLinksInput) setXhsLinksInput(formatted);
    }
  }, [xhsLinksInput, setXhsLinksInput]);

  if (!showDeconstructModal) return null;

  return createPortal(
    <div className="deconstruct-import-overlay fixed inset-0 z-[140] flex items-center justify-center p-3 bg-slate-950/35 backdrop-blur-xs sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deconstruct-import-title"
        className={`deconstruct-import-dialog relative flex max-h-[min(90dvh,880px)] w-full ${queue.length > 0 ? 'max-w-[1040px]' : 'max-w-[820px]'} flex-col rounded-3xl border border-slate-200/80 bg-white text-left shadow-[0_24px_80px_-20px_rgba(15,23,42,0.35)] transition-all dark:border-white/10 dark:bg-[#18191c]`}
      >
        <DeconstructImportHeader mode={deconstructSourceMode} onModeChange={setDeconstructSourceMode} onClose={handleCloseDeconstructModal} disabled={isBusy} />

        <div className="deconstruct-import-content min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-white px-5 py-4 text-xs text-slate-700 sm:px-6 dark:text-slate-200 dark:bg-[#18191c]">
          {deconstructSourceMode === 'xhs' && shouldShowXhsLinkInput ? (
            <div className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/65 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="deconstruct-note-links" className="text-slate-800 font-semibold text-xs dark:text-slate-100">
                    批量粘贴小红书笔记链接
                  </label>
                  <span className="text-[11px] text-slate-400">自动识别链接、跳过视频，每 4 张图自动整理为一组</span>
                </div>
                <div className="flex items-center gap-2">
                  {hasLinks && (
                    <button
                      type="button"
                      onClick={handleFormatLinks}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 cursor-pointer dark:bg-indigo-500/15 dark:text-indigo-300"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>规范一行一条</span>
                    </button>
                  )}
                  {hasLinks && (
                    <button
                      type="button"
                      onClick={() => setXhsLinksInput('')}
                      className="text-[11px] text-slate-400 hover:text-rose-600 px-1 py-0.5 transition-colors cursor-pointer"
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>

              <div className="relative flex overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100/80 dark:border-white/10 dark:bg-[#141518]">
                <div
                  ref={gutterRef}
                  aria-hidden="true"
                  className="py-2.5 pl-2.5 pr-2 bg-slate-50/80 border-r border-slate-100 select-none text-right font-mono text-[11px] text-slate-400 min-w-[34px] max-h-[148px] overflow-hidden leading-relaxed pointer-events-none dark:bg-white/[0.04] dark:border-white/10"
                >
                  {Array.from({ length: Math.max(5, xhsLinksInput.split('\n').length) }).map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>

                <textarea
                  id="deconstruct-note-links"
                  ref={textareaRef}
                  value={xhsLinksInput}
                  onChange={(e) => setXhsLinksInput(e.target.value)}
                  onPaste={handlePaste}
                  onScroll={handleScroll}
                  disabled={isBusy}
                  wrap="off"
                  placeholder={`粘贴笔记链接或分享文案，每行一条\nhttps://www.xiaohongshu.com/explore/…\nhttps://xhslink.com/a/…`}
                  rows={5}
                  className="min-w-0 flex-1 p-2.5 pb-8 bg-transparent border-0 text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-mono whitespace-pre overflow-x-auto resize-none leading-relaxed min-h-[124px] dark:text-slate-100"
                />

                {hasLinks && (
                  <div className="absolute bottom-2 right-2.5 text-[11px] text-slate-500 font-medium pointer-events-none bg-white/90 px-2 py-0.5 rounded-lg border border-slate-200/80 shadow-2xs backdrop-blur-xs flex items-center gap-1.5 dark:text-slate-300 dark:border-white/10 dark:bg-[#18191c]/95">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    <span>已识别 {linkCount} 条链接</span>
                  </div>
                )}
              </div>

              {xhsParseProgress && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-50/70 border border-indigo-100 text-indigo-700 text-xs dark:bg-indigo-500/10 dark:border-indigo-400/20 dark:text-indigo-300" role="status">
                  <span className="flex items-center gap-1.5 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span>
                      正在提取第 {xhsParseProgress.current}/{xhsParseProgress.total} 条链接（已按 4 张一组整理 {xhsParseProgress.success} 组{xhsParseProgress.skipped ? `，跳过 ${xhsParseProgress.skipped} 条` : ''}）...
                    </span>
                  </span>
                </div>
              )}

              {collectionIssues.length > 0 && (
                <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  {collectionIssues.slice(0, 3).map((issue, index) => (
                    <div key={`${issue.url}-${index}`} className="truncate" title={issue.url}>
                      {issue.kind === 'duplicate' ? '已跳过重复链接' : '未能提取图片'}：{issue.reason || issue.url}
                    </div>
                  ))}
                  {collectionIssues.length > 3 && <div>另有 {collectionIssues.length - 3} 条结果未显示</div>}
                </div>
              )}
            </div>
          ) : deconstructSourceMode === 'local' ? (
            <div className="space-y-2.5">
              {queue.length === 0 ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    if (isBusy) return;
                    if (e.dataTransfer) {
                      const files = await getFilesFromDataTransfer(e.dataTransfer);
                      if (files.length > 0) processFilesOrFolders(files);
                    }
                  }}
                  className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/30 px-4 py-7 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer group dark:border-indigo-400/25 dark:bg-indigo-500/[0.04]"
                  onClick={() => { if (!isBusy) fileInputRef.current?.click(); }}
                >
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-all mb-2 shadow-2xs dark:border-white/10 dark:bg-[#18191c]">
                    <FolderOpen className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">拖拽多张参考图片或文件夹至此</span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    系统自动按顺序每 4 张图片整理为一组四图母本
                  </span>
                  <div className="flex items-center gap-2 mt-3.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isBusy}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer dark:text-slate-200 dark:hover:bg-white/5 dark:border-white/10 dark:bg-[#18191c]"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span>选择多张图片</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      disabled={isBusy}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderUp className="w-3.5 h-3.5" />
                      <span>选择文件夹</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    if (isBusy) return;
                    if (e.dataTransfer) {
                      const files = await getFilesFromDataTransfer(e.dataTransfer);
                      if (files.length > 0) processFilesOrFolders(files);
                    }
                  }}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/5"
                >
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    拖拽新图片或文件夹到此处继续追加（自动按每 4 张成组）
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isBusy}
                      className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-medium flex items-center gap-1 cursor-pointer shadow-2xs dark:text-slate-200 dark:hover:bg-white/5 dark:border-white/10 dark:bg-[#18191c]"
                    >
                      <Upload className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                      <span>追加图片</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      disabled={isBusy}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/80 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-400/20"
                    >
                      <FolderUp className="w-3 h-3 text-indigo-600 dark:text-indigo-300" />
                      <span>追加文件夹</span>
                    </button>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                disabled={isBusy}
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) processFilesOrFolders(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                disabled={isBusy}
                // @ts-expect-error webkitdirectory is standard for folder inputs
                webkitdirectory=""
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) processFilesOrFolders(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          ) : null}

          {queue.length > 0 && (
            <div className="space-y-3 pt-0.5">
              {isDeconstructing && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-2.5 dark:border-indigo-400/20 dark:bg-indigo-500/10" role="status" aria-live="polite">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                    <span>反推进度：已完成 {completedCount}/{queue.length} 组 · 正在处理 {processingQueueCount} 组</span>
                    <span>已用时 {Math.floor(elapsedSeconds / 60)} 分 {elapsedSeconds % 60} 秒</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-100 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={completedCount}>
                    <div className="h-full bg-indigo-500 transition-all" style={{ width: `${queue.length ? completedCount / queue.length * 100 : 0}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-indigo-700 dark:text-indigo-300">
                    {activeProgress ? progressById[activeProgress.id].message : '正在提交或等待当前图组任务'}
                    {processingQueueCount > 0 ? ' · 单组视觉分析可能需要数分钟' : ''}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-slate-800 dark:text-slate-100">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-bold">已整理图组</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    共 {queue.length} 组 · 每 4 张一组
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {needsRegroup && !isBusy && (
                    <button
                      type="button"
                      onClick={() => setQueue((prev) => organizeQueueIntoFourImageGroups(prev))}
                      className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer dark:bg-indigo-500/15 dark:text-indigo-300"
                    >
                      按 4 张重新编组
                    </button>
                  )}
                  {deconstructSourceMode === 'xhs' && !shouldShowXhsLinkInput && (
                    <button
                      type="button"
                      onClick={() => {
                        openXhsLinkInput();
                        window.setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                      disabled={isBusy}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer dark:text-indigo-300"
                    >
                      + 继续粘贴链接
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setQueue([])}
                    disabled={isBusy}
                    className="text-[11px] text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    清空队列
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {queue.map((item, idx) => (
                  <QueueImageSet
                    key={item.id}
                    item={item}
                    index={idx}
                    isDeconstructing={isBusy}
                    categories={productCategories}
                    progressMessage={progressById[item.id]?.message}
                    onToggleImage={toggleQueueImage}
                    onRemove={removeQueueItem}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <DeconstructImportFooter queueApi={queueApi} xhsImport={xhsImport} />
      </div>
    </div>,
    document.body,
  );
}
