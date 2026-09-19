import React, { useState, useMemo } from 'react';
import { BatchProductItem } from '../batchTypes';
import BatchStageFooter from './BatchStageFooter';
import { BatchStage3Header } from './BatchStage3Header';
import { BatchStage3ProductItem } from './BatchStage3ProductItem';
import { useSafeTimeout } from '@/shared/hooks/useSafeTimeout';
import { useAppStore } from '@/store';
import type { AppState } from '../../../../types/store';

interface Props {
  generationStrategy?: 'grid_first' | 'single_shot';
  successfulItems: BatchProductItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  isAnalyzingAll: boolean;
  analyzeProgress: { current: number; total: number };
  startBatchVisionAnalyze: () => Promise<number | void>;
  analyzeSingleProduct: (item: BatchProductItem, itemIndex?: number) => Promise<boolean>;
  analyzeConcurrency?: number;
  setAnalyzeConcurrency?: (n: number) => void;
  handleRemoveItem: (id: string) => void;
  startBatchGeneration: () => Promise<void>;
  onPreviewImage?: (url: string) => void;
  onPrevStage: () => void;
}

// Bound mounted prompt editors even after a large batch has finished.
const PRODUCTS_PER_PAGE = 4;

export default function BatchStage3Prompts({
  generationStrategy = 'single_shot',
  successfulItems,
  setItems,
  isAnalyzingAll,
  analyzeProgress,
  startBatchVisionAnalyze,
  analyzeSingleProduct,
  analyzeConcurrency = 4,
  setAnalyzeConcurrency,
  handleRemoveItem,
  startBatchGeneration,
  onPreviewImage,
  onPrevStage,
}: Props) {
  const { setSafeTimeout } = useSafeTimeout();
  const resolveItemIndex = (item: BatchProductItem) =>
    successfulItems.findIndex((p) => p.id === item.id);
  const [page, setPage] = useState(0);
  const [expandedShots, setExpandedShots] = useState<Record<string, boolean>>({});
  const [copiedShotKey, setCopiedShotKey] = useState<string | null>(null);

  const pageCount = Math.max(1, Math.ceil(successfulItems.length / PRODUCTS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PRODUCTS_PER_PAGE;
  const visibleItems = useMemo(
    () => successfulItems.slice(pageStart, pageStart + PRODUCTS_PER_PAGE),
    [successfulItems, pageStart],
  );

  const readyCount = successfulItems.filter(
    (p) => p.analyzedSuccess && p.prompts && p.prompts.length > 0 &&
      !(generationStrategy === 'grid_first' && p.gridPrompt !== undefined && !p.gridPrompt.trim()),
  ).length;

  const hasUnanalyzed = readyCount < successfulItems.length;
  const showAnalyzeButton =
    !isAnalyzingAll && (hasUnanalyzed || successfulItems.some((p) => p.analysisError));

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
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== itemId) return p;
        const updated = [...p.prompts];
        updated[shotIdx] = {
          ...updated[shotIdx],
          prompt: val,
        };
        return { ...p, prompts: updated };
      }),
    );
  };

  const handleAnalyzeSingleItem = (item: BatchProductItem) => {
    setItems((prev) =>
      prev.map((p) =>
        p.id === item.id ? { ...p, isAnalyzing: true } : p,
      ),
    );
    void analyzeSingleProduct(item, resolveItemIndex(item));
  };

  const setIsWorkshopConfigOpen = useAppStore((s: AppState) => s.setIsWorkshopConfigOpen);

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-4 pb-8 rounded-3xl bg-slate-50 p-3 sm:p-5 border border-slate-200/70">
      {/* 极简扁平顶部栏 */}
      <BatchStage3Header
        readyCount={readyCount}
        totalCount={successfulItems.length}
        analyzeConcurrency={analyzeConcurrency}
        setAnalyzeConcurrency={setAnalyzeConcurrency}
        isAnalyzingAll={isAnalyzingAll}
        showAnalyzeButton={showAnalyzeButton}
        hasUnanalyzed={hasUnanalyzed}
        startBatchVisionAnalyze={startBatchVisionAnalyze}
        analyzeProgress={analyzeProgress}
        onOpenSettings={() => setIsWorkshopConfigOpen(true)}
      />

      {/* 极简高密度商品分镜列表 */}
      <div className="space-y-3">
        {visibleItems.map((item, itemIdx) => (
          <BatchStage3ProductItem
            key={item.id}
            item={item}
            isGridMode={generationStrategy === 'grid_first'}
            onUpdateGridPrompt={(value) => setItems(prev => prev.map(p => p.id === item.id ? { ...p, gridPrompt: value } : p))}
            itemIdx={pageStart + itemIdx}
            isAnalyzingAll={isAnalyzingAll}
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
        <nav aria-label="提示词商品分页" className="flex flex-wrap items-center justify-end gap-3 text-sm text-slate-600">
          <span>共 {successfulItems.length} 款 · 第 {currentPage + 1}/{pageCount} 页</span>
          <button type="button" disabled={currentPage === 0}
            className="rounded-lg border px-3 py-2 disabled:opacity-40"
            onClick={() => setPage(currentPage - 1)}>上一页</button>
          <button type="button" disabled={currentPage === pageCount - 1}
            className="rounded-lg border px-3 py-2 disabled:opacity-40"
            onClick={() => setPage(currentPage + 1)}>下一页</button>
        </nav>
      )}

      {/* 底部操作门禁栏 */}
      <BatchStageFooter
        onPrev={onPrevStage}
        prevLabel="返回配置与选图"
        hint={
          hasUnanalyzed ? (
            <span className="text-xs text-amber-600 font-medium">
              还有 {successfulItems.length - readyCount} 款待完成分析
            </span>
          ) : undefined
        }
        primaryAction={{
          label: hasUnanalyzed
            ? `完成分析后可生图 (${readyCount}/${successfulItems.length})`
            : `确认提示词，启动批量生图 (${readyCount} 款)`,
          onClick: startBatchGeneration,
          disabled:
            isAnalyzingAll ||
            successfulItems.length === 0 ||
            hasUnanalyzed,
        }}
      />
    </div>
  );
}
