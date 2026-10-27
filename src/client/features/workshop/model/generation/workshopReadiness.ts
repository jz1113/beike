import type { BatchProductItem, BatchTaskItem, GenerationStrategy } from '../batchTypes';
import { isLegacyReferenceShot } from './workshopReferenceInput';
import { isEphemeralResultUrl } from '../workspace/workspaceRecovery';

export function isUsableWorkshopResult(task: BatchTaskItem): boolean {
  return task.status === 'SUCCESS' && Boolean(task.resultUrl) && !isEphemeralResultUrl(task.resultUrl)
    && task.resultStatus !== 'superseded';
}

/** Keep rejected images visible for re-review, but never include them in delivery. */
export function isDeliverableWorkshopResult(task: BatchTaskItem): boolean {
  return isUsableWorkshopResult(task) && task.outputReview !== 'rejected' && task.outputReview !== 'retry_requested';
}

export function summarizeWorkshopResults(items: BatchProductItem[]) {
  const allTasks = items.flatMap((item) => item.tasks || []);
  const tasks = allTasks.filter((task) => task.resultStatus !== 'superseded');
  return {
    total: tasks.length,
    success: tasks.filter(isUsableWorkshopResult).length,
    failed: tasks.filter((task) => task.status === 'FAILURE').length,
    pending: tasks.filter((task) => task.status === 'PENDING').length,
    running: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
    recovery: allTasks.filter((task) => task.recoveryRequired).length,
    copyReady: items.filter((item) => item.copywriting?.title?.trim() && item.copywriting?.content?.trim()).length,
  };
}

export function checkWorkshopReadiness(items: BatchProductItem[], config: { generationStrategy: GenerationStrategy; selectedShotCount: number }) {
  const issues: { productId: string; title: string; reason: string; stage: 2 | 3 | 4; resolution: 'select' | 'analyze' | 'edit' | 'recover' }[] = [];
  for (const item of items) {
    const add = (reason: string, stage: 2 | 3 | 4, resolution: typeof issues[number]['resolution']) => issues.push({ productId: item.id, title: item.title, reason, stage, resolution });
    const shots = (item.prompts || []).filter((shot) => shot.selected !== false);
    if (!(item.selectedProductImages || []).some((url) => url.trim())) add('未选择商品参考图', 2, 'select');
    if (item.tasks?.some((task) => task.recoveryRequired)) add('上次任务结果待核实，请先在生成页确认', 4, 'recover');
    if (!item.analyzedSuccess || item.isAnalyzing || shots.length === 0) add('尚未完成分镜分析', 3, 'analyze');
    else if (shots.length !== config.selectedShotCount) add(`现有 ${shots.length} 镜，与设置的 ${config.selectedShotCount} 镜不一致，请重新分析`, 3, 'analyze');
    if (shots.some(shot => !Number.isInteger(shot.shot_no) || shot.shot_no < 1 || shot.shot_no > config.selectedShotCount) || new Set(shots.map(shot => shot.shot_no)).size !== shots.length) add('分镜编号缺失、重复或超出范围，请重新分析', 3, 'analyze');
    if (shots.some(isLegacyReferenceShot)) add('此商品沿用旧参考素材分镜，请按创作技能重新分析；历史成图与原任务保留', 3, 'analyze');
    if (config.generationStrategy === 'grid_first') {
      if (config.selectedShotCount !== 4) add('四宫格策略需要选择 4 镜', 2, 'select');
      if (!item.gridPrompt?.trim()) add('缺少四宫格整组提示词，请补全或重新分析', 3, 'edit');
    }
    if (shots.some((shot) => !shot.prompt?.trim())) add('存在空白分镜提示词，请补全', 3, 'edit');
  }
  const blocked = new Set(issues.map((issue) => issue.productId));
  return { issues, readyCount: items.filter((item) => !blocked.has(item.id)).length, canGenerate: items.length > 0 && issues.length === 0 };
}
