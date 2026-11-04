import React, { useState } from 'react';
import { BatchProductItem } from '../../model/batchTypes';
import BatchStageFooter from './BatchStageFooter';
import { BatchStage3Header } from './BatchStage3Header';
import { BatchStage3ProductItem } from './BatchStage3ProductItem';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';
import { useAppStore } from '@client/store';
import type { getWorkshopFlow, WorkshopStage } from '../../model/workspace/workshopFlow';
import { WorkshopContentList } from '../layout/WorkshopContentList';
import { editWorkshopGridPrompt, editWorkshopPrompt } from '../../model/analysis/editWorkshopPrompt';

interface Props {
  settings: React.ReactNode;
  flow: ReturnType<typeof getWorkshopFlow>;
  focusedId: string;
  onFocus: (id: string) => void;
  selectedShotCount?: number;
  generationStrategy?: 'grid_first' | 'single_shot';
  successfulItems: BatchProductItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  isAnalyzingAll: boolean;
  analyzeProgress: { current: number; total: number };
  startBatchVisionAnalyze: (productIds: string[]) => Promise<number | void>;
  analyzeSingleProduct: (item: BatchProductItem, itemIndex?: number) => Promise<boolean>;
  handleRemoveItem: (id: string) => void;
  startBatchGeneration: () => Promise<void>;
  onPreviewImage?: (url: string) => void;
  onPrevStage: () => void;
  onGoToStage: (stage: WorkshopStage) => void;
  analysisIssue: string | null;
}

export default function BatchStage3Prompts({
  flow, focusedId, onFocus, settings,
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
  const [filter, setFilter] = useState<'all' | 'pending' | 'ready' | 'failed'>('all');
  const [expandedShots, setExpandedShots] = useState<Record<string, boolean>>({});
  const [copiedShotKey, setCopiedShotKey] = useState<string | null>(null);

  const { readiness, pendingAnalysisIds } = flow;
  const analysisBusy = isAnalyzingAll || successfulItems.some(item => item.isAnalyzing);
  const readyCount = readiness.readyCount;
  const blockedIds = new Set(readiness.issues.map(issue => issue.productId));
  const failedCount = successfulItems.filter(item => item.analysisError && !item.isAnalyzing).length;
  const matchesFilter = (item: BatchProductItem, value: typeof filter) => value === 'all'
    || (value === 'ready' && !blockedIds.has(item.id))
    || (value === 'failed' && item.analysisError && !item.isAnalyzing)
    || (value === 'pending' && blockedIds.has(item.id));
  const filteredItems = successfulItems.length < 2 ? successfulItems : successfulItems.filter(item => matchesFilter(item, filter));
  const item = filteredItems.find(row => row.id === focusedId) ?? filteredItems[0];
  const locateProduct = (id: string) => { setFilter('all'); onFocus(id); };
  const analyzePending = () => { void startBatchVisionAnalyze(pendingAnalysisIds); };

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
      <BatchStage3Header settings={settings}
        isAnalyzingAll={analysisBusy} analyzeProgress={isAnalyzingAll ? analyzeProgress : { current: 0, total: successfulItems.filter(item => item.isAnalyzing).length }} />
      {!analysisBusy && analysisIssue && pendingAnalysisIds.length > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
        <span>{analysisIssue}</span><button type="button" onClick={() => setIsWorkshopConfigOpen(true)} className="shrink-0 font-semibold underline underline-offset-4">检查生产设置</button>
      </div>}
      {successfulItems.length > 1 && <div role="group" aria-label="分镜分析状态筛选" className="flex flex-wrap gap-2">
        {([['all', '全部', successfulItems.length], ['pending', analysisBusy ? '待完成' : '待处理', successfulItems.length - readyCount], ['ready', '已就绪', readyCount], ['failed', '分析失败', failedCount]] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value}
          onClick={() => {
          setFilter(value);
          const selected = successfulItems.find(row => row.id === focusedId);
          if (!selected || !matchesFilter(selected, value)) {
            const next = successfulItems.find(row => matchesFilter(row, value));
            if (next) onFocus(next.id);
          }
        }} className={`rounded-lg border px-3 py-2 text-xs font-medium ${filter === value ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-slate-200 bg-white/90 text-slate-500 dark:border-white/10 dark:bg-[#18191c]/95 dark:text-slate-400'}`}>{label} {count}</button>)}
      </div>}
      <div className={successfulItems.length > 1 ? "grid items-start gap-3 md:grid-cols-[minmax(180px,250px)_minmax(0,1fr)]" : "min-w-0"}>
        {successfulItems.length > 1 && <WorkshopContentList label="配图方案列表" items={filteredItems} currentId={item?.id} onSelect={onFocus}
          status={row => row.isAnalyzing ? '分析中' : row.analysisError ? '分析失败' : blockedIds.has(row.id) ? '待处理' : '方案就绪'} />}
        {item && (
          <BatchStage3ProductItem
            key={item.id}
            item={item}
            isGridMode={generationStrategy === 'grid_first'}
            onUpdateGridPrompt={value => setItems(prev => prev.map(row => row.id === item.id ? editWorkshopGridPrompt(row, value) : row))}
            itemIdx={resolveItemIndex(item)}
            isAnalyzingAll={flow.busy || item.tasks.some(task => task.recoveryRequired)}
            ready={!blockedIds.has(item.id)}
            expandedShots={expandedShots}
            copiedShotKey={copiedShotKey}
            toggleShotExpand={toggleShotExpand}
            expandAllCurrentItemShots={expandAllCurrentItemShots}
            copyShotPrompt={copyShotPrompt}
            onUpdatePrompt={(shotIdx, val) => handleUpdatePrompt(item.id, shotIdx, val)}
            onAnalyzeSingle={successfulItems.length > 1 || item.prompts.length > 0 ? () => handleAnalyzeSingleItem(item) : undefined}
            handleRemoveItem={handleRemoveItem}
            onPreviewImage={onPreviewImage}
          />
        )}
      </div>

      {!analysisBusy && readiness.issues.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
        <summary className="cursor-pointer font-semibold">有 {successfulItems.length - readyCount} 条图文需要处理，请按原因修正后继续</summary>
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto select-text">{readiness.issues.map((issue, index) => <li key={`${issue.productId}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-1"><span className="font-semibold">{issue.title}</span> · {issue.reason}</span>
          <button type="button" onClick={() => issue.stage === 3 ? locateProduct(issue.productId) : onGoToStage(issue.stage)} className="shrink-0 rounded-md px-2 py-1 font-semibold underline underline-offset-4">{issue.stage === 2 ? '返回商品资料' : issue.stage === 4 ? '核对生成任务' : '定位商品'}</button>
        </li>)}</ul>
      </details>}
      {/* 底部操作门禁栏 */}
      <BatchStageFooter
        onPrev={onPrevStage}
        prevLabel="返回商品资料"
        prevDisabled={flow.busy}
        primaryAction={{
          label: analysisBusy ? '正在分析分镜…' : readiness.canGenerate ? `确认方案，生成配图（${readyCount * selectedShotCount} 张）` : pendingAnalysisIds.length > 0 ? `${readyCount > 0 ? '仅分析未就绪' : successfulItems.length === 1 && item?.analysisError ? '重试分析' : '分析配图方案'}（${pendingAnalysisIds.length} 条）` : readiness.issues.some(issue => issue.stage === 4) ? '前往核对原任务' : '定位待修正项',
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
