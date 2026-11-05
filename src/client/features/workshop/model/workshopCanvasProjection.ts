import type { WorkshopCanvasProjection } from '@shared/domain/workshop/workshopCanvas';
import type { BatchProductItem } from './batchTypes';
import { isDeliverableWorkshopResult, isUsableWorkshopResult } from './generation/workshopReadiness';

export function workshopCanvasProjection(batchId: string, items: BatchProductItem[], activity: {
  collecting: boolean; analyzing: boolean; generating: boolean; exporting: boolean;
}): WorkshopCanvasProjection {
  const products = items.filter(item => item.status === 'success' && item.selected);
  const tasks = products.flatMap(item => item.tasks).filter(task => task.resultStatus !== 'superseded');
  const images = tasks.filter(isUsableWorkshopResult);
  const deliverable = images.filter(isDeliverableWorkshopResult);
  const copies = products.filter(item => item.copywriting?.title?.trim() && item.copywriting.content?.trim());
  const planned = products.filter(item => item.analyzedSuccess && item.prompts.length);
  const selected = products.filter(item => item.selectedProductImages.length);
  const state = (running: boolean, error: boolean, done: boolean) => running ? 'running' : error ? 'error' : done ? 'success' : 'idle';
  return { batchId, stages: {
    collect: { state: state(activity.collecting, items.some(item => item.status === 'failed'), !!products.length), summary: `商品采集\n已采集 ${products.length} / ${items.length} 条\n支持商品链接与表格导入。` },
    images: { state: selected.length === products.length && !!products.length ? 'success' : 'idle', summary: `选图与生产设置\n已选参考图 ${selected.length} / ${products.length} 条\n在此调整技能、模型、画幅与生成方式。` },
    storyboard: { state: state(activity.analyzing, products.some(item => !!item.analysisError), !!products.length && planned.length === products.length), summary: `图文分镜\n已完成 ${planned.length} / ${products.length} 条\n分析参考图并编辑各镜头提示词。` },
    generate: { state: state(activity.generating || tasks.some(task => task.status === 'IN_PROGRESS'), tasks.some(task => task.status === 'FAILURE' || task.recoveryRequired), !!images.length && images.length === tasks.length), summary: `图片生成\n成功 ${images.length} / ${tasks.length} 张\n待核对 ${tasks.filter(task => task.recoveryRequired).length} 张\n结果自动保存，刷新后查询原任务。` },
    copy: { state: state(products.some(item => !!item.isCopywritingGenerating), products.some(item => !!item.copywritingError), !!products.length && copies.length === products.length), summary: `发布文案\n已完成 ${copies.length} / ${products.length} 条\n可手动编辑标题、正文与标签。` },
    export: { state: activity.exporting ? 'running' : deliverable.length ? 'success' : 'idle', summary: `导出交付\n可用图片 ${deliverable.length} 张，文案 ${copies.length} 条\n支持图片 ZIP、文案与成果清单导出。` },
  }, outputs: products.flatMap(item => [
    ...item.tasks.filter(isUsableWorkshopResult).map(task => ({ id: task.id, title: `${item.title} · 图${task.shot_no}${isDeliverableWorkshopResult(task) ? '' : '（未采用）'}`, url: task.resultUrl })),
    ...(item.copywriting?.content ? [{ id: `${item.id}-copy`, title: item.copywriting.title || `${item.title} · 文案`, text: [item.copywriting.title, item.copywriting.content, item.copywriting.tags?.join(' ')].filter(Boolean).join('\n\n') }] : []),
  ]) };
}
