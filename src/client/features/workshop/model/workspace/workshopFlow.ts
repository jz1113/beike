import type { BatchProductItem, GenerationStrategy } from '../batchTypes';
import { checkWorkshopReadiness, summarizeWorkshopResults } from '../generation/workshopReadiness';

export const workshopSteps = [
  { stage: 1, title: '添加商品', description: '粘贴链接或 SKU，采集商品' },
  { stage: 2, title: '选图与配置', description: '确认商品图、参考素材和生成设置' },
  { stage: 3, title: '分析与确认', description: '生成分镜，核对提示词后再生图' },
  { stage: 4, title: '成图与交付', description: '检查图片、补充文案并导出' },
] as const;

export type WorkshopStage = typeof workshopSteps[number]['stage'];

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
  const hasResults = products.some(item => item.tasks.length > 0);
  const blockedIds = new Set(readiness.issues.map(issue => issue.productId));
  const pendingAnalysisIds = products.filter(item => blockedIds.has(item.id)
    && !item.isAnalyzing && !item.tasks.some(task => task.recoveryRequired)).map(item => item.id);

  const reasonForStage = (stage: number): string | null => {
    if (busy) return '任务执行中，请等待当前任务结束后切换步骤';
    if (stage === 1) return null;
    if (stage === 2) return products.length > 0 ? null : '请先添加并采集商品';
    if (stage === 3) return imagesReady ? null : '请先为每款商品选择至少一张商品图';
    if (stage === 4) return hasResults ? null : '请先在「分析与确认」中确认提示词并开始生图';
    return '无效的工坊步骤';
  };

  return { products, readiness, results, busy, imagesReady, hasResults, pendingAnalysisIds, reasonForStage };
}
