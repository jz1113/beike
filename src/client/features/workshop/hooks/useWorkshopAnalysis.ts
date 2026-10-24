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
  const singleInFlight = useRef(new Set<string>());

  const analyzeSingleProduct = async (
    item: BatchProductItem,
    itemIndexOrSig?: number | PreviousGroupSignature,
  ): Promise<boolean> => {
    if (analysisInFlight.current || singleInFlight.current.has(item.id)) return false;
    const latest = itemsRef.current.find(row => row.id === item.id);
    if (!latest || latest.isAnalyzing || latest.tasks.some(task => task.status === 'IN_PROGRESS' || task.recoveryRequired)) {
      showToast('该商品仍有执行中或待核对的任务，请先处理后再分析');
      return false;
    }
    const itemIndex = typeof itemIndexOrSig === 'number' ? itemIndexOrSig : undefined;
    singleInFlight.current.add(item.id);
    try { return await analyzeBatchProduct(deps, latest, itemIndex); }
    catch (error) { showToast(error instanceof Error ? error.message : '分析失败，请重试'); return false; }
    finally { singleInFlight.current.delete(item.id); }
  };

  const startBatchVisionAnalyze = async (architectureId = selectedArchId, options?: { productIds: string[] }): Promise<number> => {
    if (analysisInFlight.current || singleInFlight.current.size > 0) return 0;
    if (architectureId !== 'auto' && !recipes.some((recipe) => recipe.id === architectureId)) {
      showToast('请先确认工坊技能，再开始提示词分析');
      return 0;
    }

    const analysisDeps = architectureId === selectedArchId ? deps : { ...deps, selectedArchId: architectureId };
    const allActiveItems = itemsRef.current.filter((item) => item.status === 'success' && item.selected);
    const requestedIds = options ? new Set(options.productIds) : null;
    const activeItems = allActiveItems.filter(item => !requestedIds || requestedIds.has(item.id));
    if (activeItems.length === 0) {
      showToast('没有待分析的商品');
      return 0;
    }
    if (activeItems.some(item => item.isAnalyzing || item.tasks.some(task => task.status === 'IN_PROGRESS' || task.recoveryRequired))) {
      showToast('存在执行中或待核对的任务，请先在成图与交付中处理');
      return 0;
    }

    const blocked = activeItems.map(item => ({ item, reason: workshopAnalysisBlockReason(analysisDeps, item) })).filter(row => row.reason);
    if (blocked.length) {
      setItems(prev => prev.map(item => { const issue = blocked.find(row => row.item.id === item.id); return issue ? { ...item, analysisError: issue.reason! } : item; }));
      showToast(`${blocked.length} 款商品未通过分析检查（首款 SKU ${blocked[0].item.itemId}）：${blocked[0].reason}`);
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
        analyzeOne: async (item) => analyzeBatchProduct(analysisDeps, item, allActiveItems.findIndex(row => row.id === item.id)),
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
