import { useAppStore } from '@client/store';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import { getEnabledImageModelsFromSettings, readWorkflowModelsFromStorage } from '@shared/domain/models/workflowModels';
import { calculateImageDimensions } from '@client/shared/prompt-bar/promptBarDisplay';
import { IMAGE_RATIO_ITEMS } from '@client/shared/prompt-bar/promptBarConstants';
import { prepareGenerationAttempt, createGenerationAttemptId } from '@client/shared/media/generationAttempt';
import { useCanvasStore } from '../store/useCanvasStore';
import type { CanvasNode } from '../model/types';
import type { GenerationTask } from '@client/store/appStoreTypes';

/** Queue image tools through the same durable task engine used by the drawing editor. */
export function enqueueCanvasImageTool(projectId: string, node: Omit<CanvasNode, 'id' | 'createdAt'>) {
  const canvas = useCanvasStore.getState();
  const store = useAppStore.getState();
  if (!store.generationHistoryReady) throw new Error('正在恢复生成历史，请稍后重试');
  const project = canvas.projects.find(item => item.id === projectId);
  if (!project) throw new Error('画布项目已关闭，请重新打开后生成');
  const config = node.drawing;
  if (!config || !node.referenceImageUrl) throw new Error('参考图片不可用，请重新添加素材');
  const model = config.model || store.quickModel;
  const profile = getApprovedModel(model);
  if (!getEnabledImageModelsFromSettings(readWorkflowModelsFromStorage()).some(item => item.id === model)) {
    throw new Error('请先选择已启用的生图模型');
  }
  if (!profile?.supportEdits) throw new Error('当前模型不支持参考图编辑，请切换模型');
  if (profile.supportedQualities && !profile.supportedQualities.some(quality => quality === config.quality)) {
    throw new Error('当前模型不支持所选画质，请重新选择');
  }
  const ratios = IMAGE_RATIO_ITEMS.filter(item => item.id !== 'smart');
  const source = project.nodes.find(item => item.imageUrl === node.referenceImageUrl);
  const sourceRatio = source?.resultWidth && source.resultHeight
    ? source.resultWidth / source.resultHeight : node.width / node.height;
  const ratio = config.aspect === 'smart'
    ? ratios.reduce((best, item) => Math.abs(Math.log(item.w / item.h / sourceRatio)) < Math.abs(Math.log(best.w / best.h / sourceRatio)) ? item : best)
    : ratios.find(item => item.id === config.aspect);
  if (!ratio) throw new Error('请选择有效的输出比例');
  const { sizeStr } = calculateImageDimensions({ quickModel: model, quickAspectId: ratio.id, quickQuality: config.quality, baseRatio: ratio });
  const task: GenerationTask = {
    id: createGenerationAttemptId(), title: node.title || '图片编辑', prompt: node.content || '',
    model, size: sizeStr, quality: config.quality, mediaType: 'image',
    referenceImageUrl: node.referenceImageUrl, referenceImages: [node.referenceImageUrl],
    images: [node.referenceImageUrl], sourceImageUrl: node.referenceImageUrl, useReferenceImage: true,
    taskType: 'smart_edit', status: 'IN_PROGRESS', progress: '15%', createdAt: Date.now(),
  };
  const nodeId = `canvas-node-${crypto.randomUUID()}`;
  canvas.addNode(projectId, { ...node, id: nodeId, taskId: task.id, status: 'generating', progress: 0,
    drawing: { ...config, model, aspect: ratio.id }, generationSize: sizeStr });
  try { store.addGenerationTask(task, false); }
  catch (error) { canvas.deleteNode(projectId, nodeId); throw error; }
}

/** Retry binds a fresh attempt to the existing node, retaining its exact model and input slots. */
export async function retryCanvasGeneration(projectId: string, node: CanvasNode) {
  const store = useAppStore.getState();
  if (!store.generationHistoryReady) throw new Error('正在恢复生成历史，请稍后重试');
  const tasks = [...store.generationTasks, ...store.sessions.flatMap(session => session.tasks)];
  const taskId = node.taskId || node.id;
  const task = tasks.find(item => item.id === taskId || item.taskId === taskId);
  if (!task) throw new Error('原生成任务不可用，请重新添加参考素材后生成');
  if (task.submissionRecoveryRequired) throw new Error('原任务仍在确认提交结果，请稍后重试');
  const attempt = await prepareGenerationAttempt(task, createGenerationAttemptId('batch'));
  if (!attempt) throw new Error('原参考素材未恢复，请重新添加素材后生成');
  const canvas = useCanvasStore.getState();
  const current = canvas.projects.find(project => project.id === projectId)?.nodes.find(item => item.id === node.id);
  if (!current || current.taskId !== node.taskId || current.status === 'generating') return;
  if (!useAppStore.getState().generationHistoryReady) throw new Error('正在恢复生成历史，请稍后重试');
  canvas.updateNode(projectId, node.id, { taskId: attempt.id, status: 'generating', progress: 0, imageUrl: undefined, videoUrl: undefined });
  try { store.addGenerationTask(attempt, false); }
  catch (error) { canvas.updateNode(projectId, node.id, current); throw error; }
}
