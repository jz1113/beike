import type { BatchProductItem, GenerationStrategy } from '../batchTypes';
import { checkWorkshopReadiness, summarizeWorkshopResults } from '../generation/workshopReadiness';

// Persisted steps 1 and 2 are the import and selection states of 商品资料.
export type WorkshopStage = 1 | 2 | 3 | 4;
export const workshopSteps = [
  { stage: 2, title: '商品资料', description: '导入商品，逐条选择参考图' },
  { stage: 3, title: '配图方案', description: '按创作技能分析并确认每张配图' },
  { stage: 4, title: '图文交付', description: '核对成图和发布文案，导出本批内容' },
] as const;

export function getWorkshopFlow(items: BatchProductItem[], config: {
  generationStrategy: GenerationStrategy;
  selectedShotCount: number;
  collecting?: boolean;
  analyzing?: boolean;
  generating?: boolean;
}) {
  const products = items.filter(item => item.selected && item.status === 'success');
  const readiness = checkWorkshopReadiness(products, config);
  const results = summarizeWorkshopResults(products);
  const busy = Boolean(config.collecting || config.analyzing || config.generating
    || items.some(item => item.isAnalyzing || item.isCopywritingGenerating
      || item.status === 'collecting' || item.tasks.some(task => task.status === 'IN_PROGRESS')));
  const imagesReady = products.length > 0 && products.every(item => item.selectedProductImages.some(url => url.trim()));
  // Uncertain submissions remain reachable even when deselected or superseded.
  const hasResults = products.some(item => item.tasks.some(task => task.resultStatus !== 'superseded'))
    || items.some(item => item.tasks.some(task => task.recoveryRequired));
  const analysisIds = new Set(readiness.issues.filter(issue => issue.resolution === 'analyze').map(issue => issue.productId));
  const pendingAnalysisIds = products.filter(item => analysisIds.has(item.id)
    && item.selectedProductImages.some(url => url.trim())
    && !item.isAnalyzing && !item.tasks.some(task => task.recoveryRequired || task.status === 'IN_PROGRESS')).map(item => item.id);
  const imageReadyCount = products.filter(item => item.selectedProductImages.some(url => url.trim())).length;
  const completedStages: WorkshopStage[] = [];
  if (products.length > 0) completedStages.push(1);
  if (imagesReady) completedStages.push(2);
  if (readiness.canGenerate) completedStages.push(3);

  const reasonForStage = (stage: number): string | null => {
    if (stage === 4 && hasResults && (!busy || config.generating || items.some(item => item.tasks.some(task => task.status === 'IN_PROGRESS')))) return null;
    if (busy) return '任务执行中，请等待当前任务结束后切换步骤';
    if (stage === 1) return null;
    if (stage === 2) return products.length > 0 ? null : '请先添加并采集商品';
    if (stage === 3) return imagesReady ? null : '请先为每条图文选择至少一张商品图';
    if (stage === 4) return hasResults ? null : '请先在「配图方案」确认方案并开始生图';
    return '无效的电商图文步骤';
  };

  return { products, readiness, results, busy, imagesReady, imageReadyCount, hasResults, pendingAnalysisIds, completedStages, reasonForStage };
}
