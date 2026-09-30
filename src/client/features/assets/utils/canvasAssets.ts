import { getAssetTime } from '@client/shared/utils/assetTaskData';
import type { AssetTaskBatch } from './assetBatch';

export interface AssetCanvasNode {
  id: string;
  taskId?: string;
  title?: string;
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  referenceImageUrl?: string;
  drawing?: { references?: string[] };
  type: string;
  status?: string;
  createdAt?: number;
  aspectRatio?: string;
  width?: number;
  height?: number;
  model?: string;
}

export interface AssetCanvasProject {
  id: string;
  title: string;
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  nodes: AssetCanvasNode[];
}

interface CanvasAssetTask {
  id: string;
  nodeId: string;
  canvasProjectId: string;
  canvasProjectTitle: string;
  taskId: string;
  batchId: string;
  batchTitle: string;
  title: string;
  prompt: string;
  resultUrl?: string;
  coverUrl?: string;
  status: 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS' | 'EMPTY';
  createdAt: number;
  model: string;
  aspectRatio: string;
  mediaType: 'image' | 'video' | 'audio';
  isCanvasPlaceholder?: boolean;
  rawTask: AssetCanvasNode | AssetCanvasProject;
}

export function buildCanvasAssets(projects: AssetCanvasProject[]) {
  const tasks: CanvasAssetTask[] = [];
  const batches: AssetTaskBatch[] = [];
  for (const project of projects) {
    const mediaNodes = project.nodes.filter((node) => node.imageUrl || node.videoUrl || node.audioUrl
      || ['image', 'video', 'audio'].includes(node.type));
    const projectTasks: CanvasAssetTask[] = mediaNodes.map((node) => {
      // A video thumbnail is its cover; playback/download must use the actual video URL.
      const mediaType = node.videoUrl || node.type === 'video' ? 'video' : node.audioUrl || node.type === 'audio' ? 'audio' : 'image';
      const resultUrl = mediaType === 'video' ? node.videoUrl : mediaType === 'audio' ? node.audioUrl : node.imageUrl;
      return {
        ...node,
        id: `canvas-${project.id}-${node.id}`,
        nodeId: node.id,
        canvasProjectId: project.id,
        canvasProjectTitle: project.title,
        taskId: node.taskId || node.id,
        batchId: `canvas-project-${project.id}`,
        batchTitle: project.title,
        title: node.title || project.title,
        prompt: node.title || node.content || project.title || '画布媒体',
        resultUrl: node.status === 'error' ? undefined : resultUrl,
        coverUrl: mediaType === 'video' ? node.imageUrl : undefined,
        status: node.status === 'error' ? 'FAILURE' : resultUrl ? 'SUCCESS' : node.status === 'generating' ? 'IN_PROGRESS' : 'EMPTY',
        createdAt: getAssetTime(node.createdAt || project.updatedAt || project.createdAt),
        model: node.model || '无限画布',
        aspectRatio: node.aspectRatio || (node.width && node.height ? `${node.width}:${node.height}` : '1:1'),
        mediaType,
        rawTask: node,
      };
    });
    if (projectTasks.length === 0) {
      // Keep empty/legacy projects navigable, without fabricating a downloadable stock image.
      projectTasks.push({
        id: `canvas-${project.id}-${project.thumbnail ? 'cover' : 'init'}`,
        nodeId: project.thumbnail ? 'cover' : 'init',
        canvasProjectId: project.id,
        canvasProjectTitle: project.title,
        taskId: `canvas-project-${project.id}`,
        batchId: `canvas-project-${project.id}`,
        batchTitle: project.title,
        title: project.title,
        prompt: project.title || '画布项目',
        resultUrl: project.thumbnail,
        status: 'SUCCESS',
        createdAt: getAssetTime(project.updatedAt || project.createdAt),
        model: '无限画布',
        aspectRatio: '1:1',
        mediaType: 'image',
        isCanvasPlaceholder: !project.thumbnail,
        rawTask: project,
      });
    }
    tasks.push(...projectTasks);
    batches.push({
      batchId: `canvas-project-${project.id}`,
      title: project.title || '未命名画布',
      prompt: project.title || '画布项目内容',
      model: '无限画布',
      createdAt: getAssetTime(project.updatedAt || project.createdAt),
      tasks: projectTasks,
    });
  }
  batches.sort((a, b) => getAssetTime(b.createdAt) - getAssetTime(a.createdAt));
  return { canvasTasks: tasks, canvasBatches: batches };
}
