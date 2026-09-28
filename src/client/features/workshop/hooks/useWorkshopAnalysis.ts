import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { PreviousGroupSignature } from '@shared/domain/prompts/vision';
import { workshopAnalysisBlockReason } from '../model/analysis/workshopAnalysisPreflight';
import { analyzeBatchProduct, runBatchVisionAnalyze, type VisionAnalyzeDeps } from '../model/analysis/batchVisionAnalyze';
import type { BatchProductItem } from '../model/batchTypes';
import { createRunControl, type RunControl } from '../model/workspace/runControl';

interface WorkshopAnalysisOptions {
  deps: VisionAnalyzeDeps;
  itemsRef: MutableRefObject<BatchProductItem[]>;
  setItems: Dispatch<SetStateAction<BatchProductItem[]>>;
  recipes: Array<{ id: string }>;
  selectedArchId: string;
  showToast: (message: string) => void;
  analyzeConcurrency: number;
  runControlRef: MutableRefObject<RunControl>;
}

export function useWorkshopAnalysis({ deps, itemsRef, setItems, recipes, selectedArchId,
  showToast, analyzeConcurrency, runControlRef }: WorkshopAnalysisOptions) {
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState({ current: 0, total: 0 });
  const analysisInFlight = useRef(false);

  const analyzeSingleProduct = async (
    item: BatchProductItem,
    itemIndexOrSig?: number | PreviousGroupSignature,
  ): Promise<boolean> => {
    const itemIndex = typeof itemIndexOrSig === 'number' ? itemIndexOrSig : undefined;
    try { return await analyzeBatchProduct(deps, item, itemIndex); }
    catch (error) { showToast(error instanceof Error ? error.message : '分析失败，请重试'); return false; }
  };

  const startBatchVisionAnalyze = async (architectureId = selectedArchId): Promise<number> => {
    if (!recipes.some((recipe) => recipe.id === architectureId)) {
      showToast('请先确认类目拍摄架构，再开始提示词分析');
      return 0;
    }

    const analysisDeps = architectureId === selectedArchId ? deps : { ...deps, selectedArchId: architectureId };
    const activeItems = itemsRef.current.filter((item) => item.status === 'success' && item.selected);
    if (activeItems.length === 0) {
      showToast('没有待分析的商品');
      return 0;
    }

    const blocked = activeItems.map(item => ({ item, reason: workshopAnalysisBlockReason(analysisDeps, item) })).filter(row => row.reason);
    if (blocked.length) {
      setItems(prev => prev.map(item => { const issue = blocked.find(row => row.item.id === item.id); return issue ? { ...item, analysisError: issue.reason! } : item; }));
      showToast(`${blocked.length} 款商品未通过分析检查：${blocked[0].reason}`);
      return 0;
    }
    if (analysisInFlight.current) return 0;
    analysisInFlight.current = true;
    runControlRef.current = createRunControl();
    setIsAnalyzingAll(true);
    setAnalyzeProgress({ current: 0, total: activeItems.length });

    try {
      const successCount = await runBatchVisionAnalyze({
        items: activeItems,
        concurrency: analyzeConcurrency || 2,
        isAborted: () => runControlRef.current.status === 'cancelled',
        analyzeOne: async (item, index) => analyzeBatchProduct(analysisDeps, item, index),
        onItemStart: () => {},
        onItemFinish: (finished, total) => setAnalyzeProgress({ current: finished, total }),
        onItemError: (item, error) => console.warn('[BatchVision] 分析失败:', item.title, error),
      });
      const failedCount = activeItems.length - successCount;
      showToast(`AI 视觉分析完毕：${successCount} 款成功${failedCount > 0 ? `，${failedCount} 款待重试` : ''}`);
      return successCount;
    } finally {
      analysisInFlight.current = false;
      setIsAnalyzingAll(false);
    }
  };

  return { isAnalyzingAll, analyzeProgress, analysisInFlight, analyzeSingleProduct, startBatchVisionAnalyze };
}
