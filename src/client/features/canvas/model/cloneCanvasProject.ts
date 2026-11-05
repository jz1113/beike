import type { CanvasProject } from './types';

export function cloneCanvasProject(project: CanvasProject, id: string, now = Date.now()): CanvasProject {
  const copy = structuredClone(project);
  copy.id = id;
  if (copy.sales) copy.sales = { ...copy.sales, draftId: id };
  if (project.workshop) copy.workshop = { sourceBatchId: project.workshop.batchId || project.workshop.sourceBatchId, ...(project.workshop.hiddenOutputIds ? { hiddenOutputIds: [...project.workshop.hiddenOutputIds] } : {}) };
  copy.title = project.title.slice(0, 37) + ' 副本';
  copy.draft = false;
  copy.createdAt = copy.updatedAt = now;
  copy.nodes = copy.nodes.map(node => ({ ...node, taskId: undefined,
    status: node.status === 'generating' ? node.imageUrl || node.videoUrl || node.audioUrl ? 'success' : 'idle' : node.status }));
  if (copy.studioScene) copy.studioScene.nodes = copy.studioScene.nodes.map(node => ({
    ...node, beikeTaskId: undefined, beikeTaskRecord:undefined,beikeLastTaskId:undefined, beikeTaskStopped:undefined, beikeLastTaskPrompt:undefined, beikeLastTaskSettings:undefined, isGenerating: false,
    settings: { ...(node.settings as object || {}), isGenerating: false,
      _executeTrigger: undefined, _agentRunning: false, _preGenerateSnapshot: undefined },
  }));
  return copy;
}
