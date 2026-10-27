import React from 'react';
import { createPortal } from 'react-dom';
import {
  RefreshCw,
  Layers,
  Link2,
} from 'lucide-react';
import { QueueImageSet } from '../cards/QueueImageSet';
import { formatXhsLinksToOnePerLine, parseXhsUrlsFromText } from '@client/shared/utils/xhsLinkBatch';
import { organizeQueueIntoFourImageGroups, selectedQueueImages } from '../../hooks/deconstructQueueOps';
import type { DeconstructQueueApi } from '../../hooks/useDeconstructQueue';
import type { useXhsBatchImport } from '../../hooks/useXhsBatchImport';
import { DeconstructImportSettings } from './DeconstructImportSettings';
import { DeconstructImportFooter } from './DeconstructImportFooter';
import { DeconstructImportHeader } from './DeconstructImportHeader';
import { DeconstructLocalImport } from './DeconstructLocalImport';
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
    handleCloseDeconstructModal,
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
    <div className="deconstruct-import-overlay">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deconstruct-import-title"
        aria-describedby="deconstruct-import-description"
        className={`deconstruct-import-dialog ${queue.length > 0 ? 'deconstruct-has-queue' : ''}`}
      >
        <DeconstructImportHeader mode={deconstructSourceMode} onModeChange={setDeconstructSourceMode} onClose={handleCloseDeconstructModal} disabled={isBusy} />

        <div className="deconstruct-workspace">
        <div id="deconstruct-source-panel" role="tabpanel" aria-labelledby={`deconstruct-source-${deconstructSourceMode}`} className="deconstruct-import-content space-y-5">
          {deconstructSourceMode === 'xhs' && shouldShowXhsLinkInput ? (
            <div className="deconstruct-link-section">
              <div className="deconstruct-input-heading">
                <div>
                  <label htmlFor="deconstruct-note-links" className="deconstruct-input-label">添加小红书参考</label>
                  <p>粘贴分享链接或整段文案，自动提取笔记中的图片。</p>
                </div>
                <span className="deconstruct-batch-badge">批量导入</span>
              </div>

              <div className="deconstruct-link-editor">
                <textarea
                  id="deconstruct-note-links"
                  ref={textareaRef}
                  value={xhsLinksInput}
                  onChange={(e) => setXhsLinksInput(e.target.value)}
                  onPaste={handlePaste}
                  disabled={isBusy}
                  aria-describedby="deconstruct-link-hint"
                  placeholder={`在这里粘贴小红书分享内容…\n\n支持多条笔记链接，每行一条`}
                  rows={8}
                  className="deconstruct-link-textarea"
                />
                <div className="deconstruct-editor-toolbar">
                  <span><Link2 size={13} />小红书分享链接</span>
                  {hasLinks && <div>
                    <button type="button" onClick={handleFormatLinks} disabled={isBusy}>整理链接</button>
                    <button type="button" onClick={() => setXhsLinksInput('')} disabled={isBusy}>清空</button>
                  </div>}
                </div>
              </div>
              <div id="deconstruct-link-hint" className="deconstruct-input-hint">
                <span>支持分享文案 · 自动跳过视频</span>
                <span aria-live="polite" data-state={hasLinks && !linkCount ? 'warning' : linkCount ? 'ready' : 'empty'}>
                  {linkCount ? `已识别 ${linkCount} 条链接` : hasLinks ? '未识别到有效链接' : '等待添加链接'}
                </span>
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
            <DeconstructLocalImport queueApi={queueApi} disabled={isBusy} />
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

              <div className="deconstruct-queue-grid">
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

        <DeconstructImportSettings queueApi={queueApi} disabled={isBusy} />
        </div>
        <DeconstructImportFooter queueApi={queueApi} xhsImport={xhsImport} />
      </div>
    </div>,
    document.body,
  );
}
