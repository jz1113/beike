import type { ChatSession } from '@client/store/appStoreTypes';
import type { TaskBatch } from '@client/shared/utils/taskBatchGrouping';
import { extractBaseTheme, areTasksInSameBatch, groupTasksIntoBatches } from '@client/shared/utils/taskBatchGrouping';
import { resolveAssetMediaType } from '@client/shared/utils/assetTaskData';
import type { CustomAssetItem } from '@client/shared/media/customAssetStorage';

export interface MergedAssetTask {
  id: string;
  dbId?: string;
  taskId?: string;
  resultUrl?: string;
  status?: string;
  title?: string;
  prompt?: string;
  batchId?: string;
  sessionId?: string;
  sessionTitle?: string;
  progress?: string;
  failReason?: string;
  size?: string;
  quality?: string;
  createdAt?: unknown;
  model?: string;
  mediaType?: string;
  aspectRatio?: string;
  referenceImages?: string[];
  referenceImageUrl?: string;
  images?: string[];
  sourceImageUrl?: string;
  useReferenceImage?: boolean;
  rawTask?: { id?: string; status?: string; resultUrl?: string; referenceImages?: string[] };
  batchTitle?: string;
  canvasProjectTitle?: string;
  canvasProjectId?: string;
  nodeId?: string;
  isCanvasPlaceholder?: boolean;
  duration?: number | string;
  coverUrl?: string;
  isUploaded?: boolean;
}

export type AssetTaskBatch = TaskBatch<MergedAssetTask>;
export { extractBaseTheme, areTasksInSameBatch, groupTasksIntoBatches };

export type AssetMediaKind = 'image' | 'video' | 'audio' | 'document';

export function getAssetMediaKind(task: {
  mediaType?: string;
  resultUrl?: string;
  model?: string;
  prompt?: string;
  title?: string;
  referenceImages?: string[];
}): AssetMediaKind {
  const type = resolveAssetMediaType(task.mediaType, task.model, task.resultUrl).toLowerCase();
  if (type === 'audio') return 'audio';
  if (type === 'doc' || type === 'document') return 'document';
  if (type === 'video' || type === 'depth-video') return 'video';
  if (type === 'image' || type === 'depth-image') return 'image';
  return 'image';
}

export function isAssetTaskRunning(task: { status?: string; resultUrl?: string }): boolean {
  return !task.resultUrl && (task.status === 'IN_PROGRESS' || task.status === 'PENDING' || task.status === 'IDLE');
}

/** Exclude canvas ownership, including legacy session and batch associations. */
export function agentHistoryTasks(tasks: MergedAssetTask[], sessions: ChatSession[]): MergedAssetTask[] {
  const canvasSessions = new Set(sessions.filter(session => session.canvasProjectId || session.id.startsWith('canvas-session:')).map(session => session.id));
  const canvasAliases = new Set<string>();
  const isCanvas = (task: MergedAssetTask) => Boolean(task.canvasProjectId || task.batchId?.startsWith('canvas-project-') || task.sessionId?.startsWith('canvas-session:') || (task.sessionId && canvasSessions.has(task.sessionId)));
  const aliases = (task: MergedAssetTask) => [task.id, task.dbId, task.taskId].filter((id): id is string => Boolean(id));
  for (const session of sessions) {
    for (const task of session.tasks) {
      if (canvasSessions.has(session.id) || isCanvas(task)) aliases(task).forEach(id => canvasAliases.add(id));
    }
  }
  for (const task of tasks) if (isCanvas(task)) aliases(task).forEach(id => canvasAliases.add(id));
  return tasks.filter(task => !isCanvas(task) && !aliases(task).some(id => canvasAliases.has(id)));
}

/** Browser-owned library records and every saved canvas version still own their media. */
export function collectProtectedAssetMedia(projects: readonly unknown[], assets: readonly CustomAssetItem[]): string[] {
  const urls = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      if (!/^(https?:\/\/|\/(?!\/))/i.test(value)) return;
      if (typeof window !== 'undefined' && /^https?:\/\//i.test(value)) {
        try {
          const url = new URL(value);
          if (url.origin === window.location.origin) value = url.pathname + url.search;
        } catch { return; }
      }
      urls.add(value as string);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  projects.forEach(visit);
  assets.forEach(asset => { visit(asset.mediaUrl); visit(asset.coverUrl); });
  return [...urls];
}

/**
 * 判断一个任务是否仅为纯文本 Agent 对话（如问候“你好”、打招呼或纯文本问答，且无真实文件/媒体交付物）。
 * 纯文本对话应当保存在会话中，但绝不应作为资产呈现在资产库或素材库中。
 */
export function isPureAgentDialogue(task: {
  id?: string;
  mediaType?: string;
  resultUrl?: string;
  images?: string[];
  referenceImages?: string[];
  sourceImageUrl?: string;
  isUploaded?: boolean;
  prompt?: string;
  title?: string;
  rawTask?: unknown;
}): boolean {
  const isAgent =
    task.mediaType === 'agent' ||
    (typeof task.id === 'string' && task.id.startsWith('agent-task-'));

  if (!isAgent) return false;

  // 1. 若拥有真实生成媒体文件（图片、视频、音频 URL）
  if (task.resultUrl && !task.resultUrl.startsWith('agent-file:')) {
    return false;
  }

  // 2. 若有真实生成的图片或媒体列表
  if (
    task.images &&
    task.images.length > 0 &&
    task.images.some((img) => img && !img.startsWith('agent-file:'))
  ) {
    return false;
  }

  // 3. 若为用户在多模态对话中明确上传的素材文件
  if (task.isUploaded) {
    return false;
  }

  // 纯文本对话不作为资产呈现，即使提示词看起来像一份方案
  return true;
}
