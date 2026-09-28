import React from 'react';
import {
  X,
  FolderOpen,
  RefreshCw,
  Upload,
  FolderUp,
  FileSpreadsheet,
  Layers,
  Sparkles,
} from 'lucide-react';
import { getFilesFromDataTransfer } from '../utils/assetFolderImport';
import { QueueImageSet } from './QueueImageSet';
import { formatXhsLinksToOnePerLine, parseXhsUrlsFromText } from '@client/shared/utils/xhsLinkBatch';
import type { DeconstructQueueApi } from '../hooks/useDeconstructQueue';
import type { useXhsBatchImport } from '../hooks/useXhsBatchImport';
import type { WorkflowCapability } from '@shared/domain/models/workflowModels';
import { getSubCategoriesForCategory, type ActionCategoryId } from '@shared/domain/products/productCategory';

type XhsImportApi = ReturnType<typeof useXhsBatchImport>;

export type DeconstructModalProps = {
  queueApi: DeconstructQueueApi;
  xhsImport: XhsImportApi;
  showToast: (msg: string) => void;
};

export default function DeconstructModal({ queueApi, xhsImport }: DeconstructModalProps) {
  const {
    showDeconstructModal,
    multimodalModels,
    selectedVisionModel,
    setSelectedVisionModel,
    targetCategory,
    setTargetCategory,
    queue,
    setQueue,
    currentQueueIndex,
    isDeconstructing,
    queueConcurrency,
    handleQueueConcurrencyChange,
    processingQueueCount,
    progressById,
    elapsedSeconds,
    lastExportedCsvFilename,
    fileInputRef,
    folderInputRef,
    handleCloseDeconstructModal,
    processFilesOrFolders,
    runQueueDeconstruction,
    exportQueueCsv,
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
    handleBatchParseXhsLinks,
  } = xhsImport;

  const candidateUrls = React.useMemo(() => parseXhsUrlsFromText(xhsLinksInput), [xhsLinksInput]);
  const hasLinks = Boolean(xhsLinksInput.trim());
  const linkCount = candidateUrls.length;
  const isBusy = isParsingXhsLinks || isDeconstructing;
  // 首次采集和追加采集时显示编辑器；采集完成后把空间完全让给图集选择。
  const shouldShowXhsLinkInput = showXhsLinkInput || queue.length === 0 || isParsingXhsLinks;
  const completedCount = queue.filter((item) => item.status === 'done' || item.status === 'error').length;
  const activeProgress = queue.find((item) => item.status === 'processing' && progressById[item.id]);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleFormatLinks = () => {
    if (!xhsLinksInput.trim()) return;
    const formatted = formatXhsLinksToOnePerLine(xhsLinksInput);
    setXhsLinksInput(formatted);
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
    setQueue((prev) => prev.filter((item) => item.id !== itemId));
  }, [setQueue]);

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
        const deduped = formatXhsLinksToOnePerLine(combined);
        setXhsLinksInput(deduped);
      }
    }
  };

  // 自动纠偏：若输入内容中包含断行的 query 参数（如换行后以 xsec_token 开头），自动修复为一行一条
  React.useEffect(() => {
    if (xhsLinksInput && (/\n\s*xsec_/i.test(xhsLinksInput) || /\?\s*\n/i.test(xhsLinksInput))) {
      const formatted = formatXhsLinksToOnePerLine(xhsLinksInput);
      if (formatted !== xhsLinksInput) {
        setXhsLinksInput(formatted);
      }
    }
  }, [xhsLinksInput, setXhsLinksInput]);

  if (!showDeconstructModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-[94vw] max-w-[1600px] max-h-[90vh] flex flex-col bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.18)] overflow-hidden text-left">
        
        {/* 顶部标题与模式切换栏 */}
        <div className="px-6 pt-5 pb-3.5 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between pb-3.5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">批量图集 · 智能逆向解构</h3>
              <p className="text-[11px] text-slate-400 font-normal">
                批量解析图集素材，自动提炼场景、穿搭、人物与机位动作
              </p>
            </div>
            <button
              type="button"
              onClick={handleCloseDeconstructModal}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 两个模式的切换置于最上方 (Segmented Tabs) */}
          <div className="flex items-center p-1 bg-slate-100/90 rounded-xl">
            <button
              type="button"
              onClick={() => setDeconstructSourceMode('xhs')}
              className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                deconstructSourceMode === 'xhs'
                  ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-950/5'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>小红书链接批量采集</span>
            </button>
            <button
              type="button"
              onClick={() => setDeconstructSourceMode('local')}
              className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                deconstructSourceMode === 'local'
                  ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-950/5'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>本地文件夹 / 图片导入</span>
            </button>
          </div>
        </div>

        {/* 主内容区域 */}
        <div className="flex-1 overflow-y-auto p-7 space-y-4 text-xs text-slate-700">
          {deconstructSourceMode === 'xhs' && shouldShowXhsLinkInput ? (
            /* 小红书链接输入区 */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-slate-800 font-semibold text-xs">
                    <span>笔记链接（支持多行批量输入）</span>
                  </label>
                  {hasLinks && (
                    <button
                      type="button"
                      onClick={handleFormatLinks}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                      title="自动清洗链接、去除多余参数并规范为一行一条"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>规范为一行一个</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasLinks && (
                    <button
                      type="button"
                      onClick={() => setXhsLinksInput('')}
                      className="text-[11px] text-slate-400 hover:text-rose-600 px-1 py-0.5 transition-colors cursor-pointer"
                    >
                      清空
                    </button>
                  )}
                  <span className="text-[11px] text-slate-400 font-normal">
                    单行一条 · 过滤视频 · ≥3图入选 · 最多10图/套
                  </span>
                </div>
              </div>

              <div className="relative flex overflow-hidden rounded-[24px] border-2 border-dashed border-slate-300 bg-white/70 transition hover:border-blue-300 hover:bg-white focus-within:border-blue-400 focus-within:bg-white">
                {/* 左侧行号栏 */}
                <div
                  ref={gutterRef}
                  className="py-3 pl-2.5 pr-2 bg-slate-100/70 border-r border-slate-200/60 select-none text-right font-mono text-[11px] text-slate-400 min-w-[36px] max-h-[160px] overflow-hidden leading-relaxed pointer-events-none"
                >
                  {Array.from({ length: Math.max(5, xhsLinksInput.split('\n').length) }).map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>

                {/* 右侧文本域 */}
                <textarea
                  ref={textareaRef}
                  value={xhsLinksInput}
                  onChange={(e) => setXhsLinksInput(e.target.value)}
                  onPaste={handlePaste}
                  onScroll={handleScroll}
                  disabled={isBusy}
                  wrap="off"
                  placeholder={`在此粘贴小红书笔记链接或分享文案（每行一条，支持批量粘贴）：\nhttps://www.xiaohongshu.com/explore/6a844a9a0000000005032b86\nhttp://xhslink.com/a/xxxxxx`}
                  rows={6}
                  className="flex-1 p-3 bg-transparent border-0 text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-mono whitespace-pre overflow-x-auto resize-none leading-relaxed min-h-[140px]"
                />

                {hasLinks && (
                  <div className="absolute bottom-2.5 right-3 text-[11px] text-slate-500 font-medium pointer-events-none bg-white/90 px-2 py-0.5 rounded-lg border border-slate-200/80 shadow-2xs backdrop-blur-xs flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    <span>已识别 {linkCount} 条链接（一行一条）</span>
                  </div>
                )}
              </div>

              {/* 实时采编进度状态条 (仅在采编中时展示) */}
              {xhsParseProgress && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-50/70 border border-indigo-100 text-indigo-700 text-xs animate-pulse">
                  <span className="flex items-center gap-1.5 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    <span>
                      {isDeconstructing
                        ? `流水线闭环中：采编第 ${xhsParseProgress.current}/${xhsParseProgress.total} 条（已提取 ${xhsParseProgress.success} 套，跳过 ${xhsParseProgress.skipped} 套）`
                        : `正在采编第 ${xhsParseProgress.current}/${xhsParseProgress.total} 条（已提取 ${xhsParseProgress.success} 套，跳过 ${xhsParseProgress.skipped} 套）...`}
                    </span>
                  </span>
                </div>
              )}

              {collectionIssues.length > 0 && (
                <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
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
            /* 本地文件 / 文件夹导入区 */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-slate-800 font-semibold flex items-center gap-1.5 text-xs">
                  <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
                  <span>参考图集文件或文件夹</span>
                </label>
                <span className="text-[11px] text-slate-400 font-normal">
                  支持多图或多层文件夹 · ≥3图入选 · 最多10图/套
                </span>
              </div>

              {queue.length === 0 ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    if (e.dataTransfer) {
                      const files = await getFilesFromDataTransfer(e.dataTransfer);
                      if (files.length > 0) processFilesOrFolders(files);
                    }
                  }}
                  className="flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all text-center cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-all mb-2 shadow-2xs">
                    <FolderOpen className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">拖拽图集文件夹或多张参考图片至此</span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    支持投入整套多层文件夹，系统自动按子文件夹拆分套组
                  </span>
                  <div className="flex items-center gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>选择图片文件</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/80 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderUp className="w-3.5 h-3.5 text-indigo-600" />
                      <span>选择整套文件夹</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-xs text-slate-600 font-medium">
                    已载入 {queue.length} 套本地参考图集
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-medium flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Upload className="w-3 h-3 text-slate-500" />
                      <span>追加图片</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/80 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <FolderUp className="w-3 h-3 text-indigo-600" />
                      <span>追加文件夹</span>
                    </button>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    processFilesOrFolders(e.target.files);
                  }
                  e.target.value = '';
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory is standard for folder inputs
                webkitdirectory=""
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    processFilesOrFolders(e.target.files);
                  }
                  e.target.value = '';
                }}
              />
            </div>
          ) : null}


          {/* 待反推图集清单（Queue List，仅在队列有项时展开） */}
          {queue.length > 0 && (
            <div className="space-y-4 pt-1">
              {isDeconstructing && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3" role="status" aria-live="polite">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-indigo-800">
                    <span>反推进度：已完成 {completedCount}/{queue.length} 套 · 正在处理 {processingQueueCount} 套</span>
                    <span>已用时 {Math.floor(elapsedSeconds / 60)} 分 {elapsedSeconds % 60} 秒</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={completedCount}>
                    <div className="h-full bg-indigo-500 transition-all" style={{ width: `${queue.length ? completedCount / queue.length * 100 : 0}%` }} />
                  </div>
                  <p className="mt-2 text-[11px] text-indigo-700">
                    {activeProgress ? progressById[activeProgress.id].message : '正在提交或等待当前图集任务'}
                    {processingQueueCount > 0 ? ' · 单套视觉分析可能需要数分钟' : ''}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-800">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-semibold">图集选择</span>
                  <span className="text-[11px] text-slate-400">共 {queue.length} 套 · 点击图片保留或排除</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {deconstructSourceMode === 'xhs' && !shouldShowXhsLinkInput && (
                    <button
                      type="button"
                      onClick={() => {
                        openXhsLinkInput();
                        window.setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                      disabled={isDeconstructing}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer"
                    >
                      继续采集
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setQueue([])}
                    disabled={isDeconstructing}
                    className="text-[11px] text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    清空队列
                  </button>
                </div>
              </div>

              <div className={`space-y-6 overflow-y-auto pr-1 ${shouldShowXhsLinkInput ? 'max-h-72' : 'max-h-[620px]'}`}>
                {queue.map((item, idx) => (
                  <QueueImageSet
                    key={item.id}
                    item={item}
                    index={idx}
                    isDeconstructing={isDeconstructing}
                    progressMessage={progressById[item.id]?.message}
                    onToggleImage={toggleQueueImage}
                    onRemove={removeQueueItem}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作行：模型选择 + 并发设置 + 解析操作按钮（弹性防挤压排版） */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 gap-3">
          {/* 左侧：模型选择 + 并发控制胶囊组 */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {/* 目标品类与二级类目 */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs shrink-0">
              <span className="text-[11px] font-medium text-slate-500 shrink-0">品类</span>
              <select
                value={targetCategory}
                onChange={(e) => setTargetCategory(e.target.value as ActionCategoryId)}
                disabled={isDeconstructing}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="jewelry">珠宝首饰</option>
                <option value="digital_3c">手机数码</option>
                <option value="apparel">服饰穿搭</option>
              </select>
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded font-bold shrink-0 whitespace-nowrap">
                {getSubCategoriesForCategory(targetCategory).length}个二级
              </span>
            </div>

            {/* 模型选择 */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs shrink-0">
              <span className="text-[11px] font-medium text-slate-500 shrink-0">模型</span>
              <select
                value={selectedVisionModel}
                onChange={(e) => setSelectedVisionModel(e.target.value)}
                disabled={isDeconstructing || multimodalModels.length === 0}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[150px] truncate"
              >
                {multimodalModels.length === 0 ? (
                  <option value="">未配置模型</option>
                ) : (
                  multimodalModels.map((m: WorkflowCapability) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.id}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 并发设置 */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-2xs shrink-0">
              <span className="text-[11px] font-medium text-slate-500 shrink-0">并发</span>
              <select
                value={queueConcurrency}
                onChange={(e) => handleQueueConcurrencyChange(Number(e.target.value) || 4)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                title="运行中调整会影响尚未开始的图集；已发出的请求会继续完成"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={4}>4</option>
                <option value={8}>8</option>
              </select>
            </div>

            {queue.length > 0 && (
              <span className="text-[11px] text-slate-600 font-bold shrink-0 whitespace-nowrap bg-slate-200/80 px-2 py-1 rounded-md">
                共 {queue.length} 套
              </span>
            )}
          </div>

          {/* 右侧：操作按钮组 */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {/* 导出表格按钮（若有完成项） */}
            {queue.some((it) => it.status === 'done') && (
              <button
                type="button"
                onClick={exportQueueCsv}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                title={lastExportedCsvFilename ? `已导出：${lastExportedCsvFilename}` : '导出明细表格'}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>导出表格</span>
              </button>
            )}

            {/* 主操作按钮 */}
            {deconstructSourceMode === 'xhs' && hasLinks ? (
              /* 小红书模式且有输入时：采编并直接反推入库 */
              <button
                type="button"
                onClick={handleBatchParseXhsLinks}
                disabled={isBusy || multimodalModels.length === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs shadow-2xs hover:shadow transition-all disabled:opacity-40 disabled:hover:bg-indigo-600 cursor-pointer"
              >
                {isDeconstructing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {processingQueueCount > 0
                        ? `并发解构中 (${processingQueueCount})...`
                        : '正在处理中...'}
                    </span>
                  </>
                ) : isParsingXhsLinks ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>正在采编链接...</span>
                  </>
                ) : (
                  <span>提取图片供选择</span>
                )}
              </button>
            ) : (
              /* 本地模式或队列已有图集：执行队列智能解构 */
              <button
                type="button"
                onClick={() => { void runQueueDeconstruction(); }}
                disabled={isDeconstructing || queue.length === 0 || multimodalModels.length === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs shadow-2xs hover:shadow transition-all disabled:opacity-40 disabled:hover:bg-indigo-600 cursor-pointer"
              >
                {isDeconstructing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {processingQueueCount > 1
                        ? `正在并行反推 ${processingQueueCount} 套...`
                        : `正在反推第 ${currentQueueIndex + 1}/${queue.length} 套...`}
                    </span>
                  </>
                ) : (
                  <span>
                    {queue.length > 0 ? `开始智能解构 (${queue.length}套)` : '开始智能解构'}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
