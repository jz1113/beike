import React, { useState } from 'react';
import { BatchProductItem } from '../../model/batchTypes';
import BatchStageFooter from './BatchStageFooter';
import { BatchStage3Header } from './BatchStage3Header';
import { BatchStage3ProductItem } from './BatchStage3ProductItem';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';
import { useAppStore } from '@client/store';
import { getWorkshopFlow, type WorkshopStage } from '../../model/workspace/workshopFlow';
import { editWorkshopPrompt } from '../../model/analysis/editWorkshopPrompt';

interface Props {
  selectedShotCount?: number;
  generationStrategy?: 'grid_first' | 'single_shot';
  successfulItems: BatchProductItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  isAnalyzingAll: boolean;
  analyzeProgress: { current: number; total: number };
  startBatchVisionAnalyze: (productIds?: string[]) => Promise<number | void>;
  analyzeSingleProduct: (item: BatchProductItem, itemIndex?: number) => Promise<boolean>;
  handleRemoveItem: (id: string) => void;
  startBatchGeneration: () => Promise<void>;
  onPreviewImage?: (url: string) => void;
  onPrevStage: () => void;
  onGoToStage: (stage: WorkshopStage) => void;
  analysisIssue: string | null;
}

// Bound mounted prompt editors even after a large batch has finished.
const PRODUCTS_PER_PAGE = 4;

export default function BatchStage3Prompts({
  generationStrategy = 'single_shot',
  selectedShotCount = 4,
  successfulItems,
  setItems,
  isAnalyzingAll,
  analyzeProgress,
  startBatchVisionAnalyze,
  analyzeSingleProduct,
  handleRemoveItem,
  startBatchGeneration,
  onPreviewImage,
  onPrevStage,
  onGoToStage,
  analysisIssue,
}: Props) {
  const { setSafeTimeout } = useSafeTimeout();
  const resolveItemIndex = (item: BatchProductItem) =>
    successfulItems.findIndex((p) => p.id === item.id);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'pending' | 'ready' | 'failed'>('all');
  const [expandedShots, setExpandedShots] = useState<Record<string, boolean>>({});
  const [copiedShotKey, setCopiedShotKey] = useState<string | null>(null);

  const flow = getWorkshopFlow(successfulItems, { generationStrategy, selectedShotCount, analyzing: isAnalyzingAll });
  const { readiness, pendingAnalysisIds } = flow;
  const analysisBusy = isAnalyzingAll || successfulItems.some(item => item.isAnalyzing);
  const readyCount = readiness.readyCount;
  const blockedIds = new Set(readiness.issues.map(issue => issue.productId));
  const failedCount = successfulItems.filter(item => item.analysisError && !item.isAnalyzing).length;
  const filteredItems = successfulItems.filter(item => filter === 'all'
    || (filter === 'ready' && !blockedIds.has(item.id))
    || (filter === 'failed' && item.analysisError && !item.isAnalyzing)
    || (filter === 'pending' && blockedIds.has(item.id)));
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PRODUCTS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PRODUCTS_PER_PAGE;
  const visibleItems = filteredItems.slice(pageStart, pageStart + PRODUCTS_PER_PAGE);
  const locateProduct = (id: string) => {
    setFilter('all');
    setPage(Math.floor(successfulItems.findIndex(item => item.id === id) / PRODUCTS_PER_PAGE));
    setSafeTimeout(() => document.getElementById(`workshop-prompt-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const analyzePending = () => { void startBatchVisionAnalyze(pendingAnalysisIds); };
  const reanalyzeAll = () => {
    if (!window.confirm('重新分析会覆盖本批次已有的提示词与手动修改，已有成图将标记为旧版本。确定重新分析全部商品？')) return;
    void startBatchVisionAnalyze();
  };

  const toggleShotExpand = (key: string) => {
    setExpandedShots((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAllCurrentItemShots = (item: BatchProductItem) => {
    const nextState = { ...expandedShots };
    (item.prompts || []).forEach((_, idx) => {
      nextState[`${item.id}-${idx}`] = true;
    });
    setExpandedShots(nextState);
  };

  const copyShotPrompt = async (prompt: string, shotKey: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedShotKey(shotKey);
      setSafeTimeout(() => setCopiedShotKey(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const handleUpdatePrompt = (itemId: string, shotIdx: number, val: string) => {
    setItems(prev => prev.map(item => item.id === itemId ? editWorkshopPrompt(item, shotIdx, val) : item));
  };

  const handleAnalyzeSingleItem = (item: BatchProductItem) => {
    if (analysisBusy || flow.busy) return;
    if (item.prompts.length > 0 && !window.confirm(`重新分析「${item.title}」会覆盖已有提示词与手动修改，已有成图将标记为旧版本。确定继续？`)) return;
    void analyzeSingleProduct(item, resolveItemIndex(item)).catch(() => {
      // 分析执行层已将具体错误写入商品状态。
    });
  };

  const setIsWorkshopConfigOpen = useAppStore(s => s.setIsWorkshopConfigOpen);

  return (
    <div className="w-full space-y-5 pb-8 bg-transparent">
      <BatchStage3Header readyCount={readyCount} totalCount={successfulItems.length} failedCount={failedCount}
        isAnalyzingAll={analysisBusy} analyzeProgress={isAnalyzingAll ? analyzeProgress : { current: 0, total: successfulItems.filter(item => item.isAnalyzing).length }} />
      <p className="px-1 text-xs leading-6 text-slate-500 dark:text-slate-400">根据当前商品图与创作技能设计分镜；实际采用的技能及版本见商品卡片，确认提示词后再生图。</p>
      {!analysisBusy && analysisIssue && pendingAnalysisIds.length > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
        <span>{analysisIssue}</span><button type="button" onClick={() => setIsWorkshopConfigOpen(true)} className="shrink-0 font-semibold underline underline-offset-4">检查生产设置</button>
      </div>}
      <div role="group" aria-label="分镜分析状态筛选" className="flex flex-wrap gap-2">
        {([['all', '全部', successfulItems.length], ['pending', analysisBusy ? '待完成' : '待处理', successfulItems.length - readyCount], ['ready', '已就绪', readyCount], ['failed', '分析失败', failedCount]] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value}
          onClick={() => { setFilter(value); setPage(0); }} className={`rounded-lg border px-3 py-2 text-xs font-medium ${filter === value ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-slate-200 bg-white/90 text-slate-500 dark:border-white/10 dark:bg-[#18191c]/95 dark:text-slate-400'}`}>{label} {count}</button>)}
      </div>
      {/* 极简高密度商品分镜列表 */}
      <div className="space-y-3">
        {visibleItems.length === 0 && <p className="rounded-xl bg-white/95 p-10 text-center text-xs text-slate-500 dark:bg-[#18191c]/95 dark:text-slate-400">此状态下暂无商品</p>}
        {visibleItems.map((item) => (
          <BatchStage3ProductItem
            key={item.id}
            item={item}
            isGridMode={generationStrategy === 'grid_first'}
            onUpdateGridPrompt={(value) => setItems(prev => prev.map(p => p.id === item.id && p.gridPrompt !== value ? { ...p, gridPrompt: value, copywriting: undefined, tasks: p.tasks.map(task => ({ ...task, resultStatus: 'superseded' as const })) } : p))}
            itemIdx={resolveItemIndex(item)}
            isAnalyzingAll={flow.busy || item.tasks.some(task => task.recoveryRequired)}
            expandedShots={expandedShots}
            copiedShotKey={copiedShotKey}
            toggleShotExpand={toggleShotExpand}
            expandAllCurrentItemShots={expandAllCurrentItemShots}
            copyShotPrompt={copyShotPrompt}
            onUpdatePrompt={(shotIdx, val) => handleUpdatePrompt(item.id, shotIdx, val)}
            onAnalyzeSingle={() => handleAnalyzeSingleItem(item)}
            handleRemoveItem={handleRemoveItem}
            onPreviewImage={onPreviewImage}
          />
        ))}
      </div>

      {pageCount > 1 && (
        <nav aria-label="提示词商品分页" className="flex flex-wrap items-center justify-end gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span>共 {successfulItems.length} 款 · 第 {currentPage + 1}/{pageCount} 页</span>
          <button type="button" disabled={currentPage === 0}
            className="rounded-lg border px-3 py-2 disabled:opacity-40"
            onClick={() => setPage(currentPage - 1)}>上一页</button>
          <button type="button" disabled={currentPage === pageCount - 1}
            className="rounded-lg border px-3 py-2 disabled:opacity-40"
            onClick={() => setPage(currentPage + 1)}>下一页</button>
        </nav>
      )}

      {!analysisBusy && readiness.issues.length > 0 && <details open className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
        <summary className="cursor-pointer font-semibold">有 {successfulItems.length - readyCount} 款需要处理，请按原因修正后继续</summary>
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto select-text">{readiness.issues.map((issue, index) => <li key={`${issue.productId}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-1"><span className="font-semibold">{issue.title}</span> · {issue.reason}</span>
          <button type="button" onClick={() => issue.stage === 3 ? locateProduct(issue.productId) : onGoToStage(issue.stage)} className="shrink-0 rounded-md px-2 py-1 font-semibold underline underline-offset-4">{issue.stage === 2 ? '返回选图与配置' : issue.stage === 4 ? '核对生成任务' : '定位商品'}</button>
        </li>)}</ul>
      </details>}
      {/* 底部操作门禁栏 */}
      <BatchStageFooter
        onPrev={onPrevStage}
        prevLabel="返回选图与配置"
        prevDisabled={flow.busy}
        hint={<span className={`text-xs ${analysisBusy ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>
          {analysisBusy ? '正在处理，请等待分析完成' : readiness.canGenerate ? '核对完成后，将按当前配置生成图片' : '已就绪商品会保留，只处理未完成项'}
        </span>}
        secondaryActions={!flow.busy && successfulItems.some(item => item.prompts.length > 0) && !successfulItems.some(item => item.tasks.some(task => task.recoveryRequired)) ? <button type="button" onClick={reanalyzeAll} className="rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5">重新分析全部</button> : undefined}
        primaryAction={{
          label: analysisBusy ? '正在分析分镜…' : readiness.canGenerate ? `确认分镜，开始生图（${readyCount * selectedShotCount} 张）` : pendingAnalysisIds.length > 0 ? `${readyCount > 0 ? '仅分析未就绪' : '开始分析分镜'}（${pendingAnalysisIds.length} 款）` : readiness.issues.some(issue => issue.stage === 4) ? '前往核对原任务' : '定位待修正项',
          onClick: readiness.canGenerate ? startBatchGeneration : pendingAnalysisIds.length ? analyzePending : () => {
            const issue = readiness.issues.find(entry => entry.stage === 4) || readiness.issues[0];
            if (issue?.stage === 3) locateProduct(issue.productId);
            else if (issue) onGoToStage(issue.stage);
          },
          disabled: flow.busy || (!readiness.canGenerate && pendingAnalysisIds.length > 0 && Boolean(analysisIssue)) || successfulItems.length === 0,
        }}
      />
    </div>
  );
}
