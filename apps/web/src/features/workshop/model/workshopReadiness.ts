import type { BatchProductItem, BatchTaskItem, GenerationStrategy } from './batchTypes';
import { isEphemeralResultUrl } from './workspaceRecovery';

export function isUsableWorkshopResult(task: BatchTaskItem): boolean {
  return task.status === 'SUCCESS' && Boolean(task.resultUrl) && !isEphemeralResultUrl(task.resultUrl)
    && task.resultStatus !== 'superseded';
}

export function summarizeWorkshopResults(items: BatchProductItem[]) {
  const tasks = items.flatMap((item) => item.tasks || []).filter((task) => task.resultStatus !== 'superseded');
  return {
    total: tasks.length,
    success: tasks.filter(isUsableWorkshopResult).length,
    failed: tasks.filter((task) => task.status === 'FAILURE').length,
    pending: tasks.filter((task) => task.status === 'PENDING').length,
    running: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
    recovery: tasks.filter((task) => task.recoveryRequired).length,
    copyReady: items.filter((item) => item.copywriting?.title?.trim() && item.copywriting?.content?.trim()).length,
  };
}

export function checkWorkshopReadiness(items: BatchProductItem[], config: { generationStrategy: GenerationStrategy; selectedShotCount: number }) {
  const issues: { productId: string; title: string; reason: string; stage: 2 | 3 | 4 }[] = [];
  for (const item of items) {
    const add = (reason: string, stage: 2 | 3 | 4) => issues.push({ productId: item.id, title: item.title, reason, stage });
    const shots = (item.prompts || []).filter((shot) => shot.selected !== false);
    if (!(item.selectedProductImages || []).some((url) => url.trim())) add('未选择商品参考图', 2);
    if (item.tasks?.some((task) => task.recoveryRequired)) add('上次任务结果待核实，请先在生成页确认', 4);
    if (!item.analyzedSuccess || item.isAnalyzing || shots.length === 0) add('尚未完成分镜分析', 3);
    else if (shots.length !== config.selectedShotCount) add(`现有 ${shots.length} 镜，与设置的 ${config.selectedShotCount} 镜不一致，请重新分析`, 3);
    if (config.generationStrategy === 'grid_first') {
      if (config.selectedShotCount !== 4) add('四宫格策略需要选择 4 镜', 2);
      if (!item.gridPrompt?.trim()) add('缺少四宫格整组提示词，请重新分析', 3);
    } else if (shots.some((shot) => !shot.prompt?.trim())) add('存在空白分镜提示词，请补全', 3);
  }
  const blocked = new Set(issues.map((issue) => issue.productId));
  return { issues, readyCount: items.filter((item) => !blocked.has(item.id)).length, canGenerate: items.length > 0 && issues.length === 0 };
}
