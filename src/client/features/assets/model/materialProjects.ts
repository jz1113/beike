import type { ChatSession } from '@client/store/appStoreTypes';
import type { AssetCanvasProject } from './canvasAssets';
import type { MergedAssetTask } from './mergeAssetTasks';
import { getAssetMediaKind } from './assetMedia';

export interface ProjectFolderItem {
  id: string;
  title: string;
  assetCount: number;
  type: 'session' | 'canvas';
  updatedAt?: number;
  photos: string[];
}

export function taskBelongsToProject(task: MergedAssetTask, project: Pick<ProjectFolderItem, 'id' | 'type'>): boolean {
  if (project.type === 'canvas') {
    return task.canvasProjectId ? task.canvasProjectId === project.id : task.batchId === `canvas-project-${project.id}`;
  }
  return !task.canvasProjectId && !task.batchId?.startsWith('canvas-project-') && task.sessionId === project.id;
}

export function buildMaterialProjects(sessions: ChatSession[], canvases: AssetCanvasProject[], tasks: MergedAssetTask[]): ProjectFolderItem[] {
  const groups = new Map<string, MergedAssetTask[]>();
  for (const task of tasks) {
    if (task.isCanvasPlaceholder) continue;
    const key = task.canvasProjectId ? `canvas:${task.canvasProjectId}`
      : task.batchId?.startsWith('canvas-project-') ? `canvas:${task.batchId.slice('canvas-project-'.length)}`
      : task.sessionId ? `session:${task.sessionId}` : undefined;
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(task);
    groups.set(key, group);
  }
  const projects = [
    ...sessions.map((session) => ({ id: session.id, title: session.title || '新创作对话', type: 'session' as const, updatedAt: session.updatedAt || session.createdAt || 0 })),
    ...canvases.map((canvas) => ({ id: canvas.id, title: canvas.title || '未命名画布', type: 'canvas' as const, updatedAt: canvas.updatedAt || canvas.createdAt || 0 })),
  ];
  return projects.map((project) => {
    const assets = groups.get(`${project.type}:${project.id}`) || [];
    const photos = [...new Set(assets.flatMap((task) => {
      if (task.status === 'FAILURE') return [];
      const kind = getAssetMediaKind(task);
      const url = kind === 'image' ? task.resultUrl : kind === 'video' ? task.coverUrl : undefined;
      return url ? [url] : [];
    }))].slice(0, 3);
    return { ...project, assetCount: assets.length, photos };
  });
}
