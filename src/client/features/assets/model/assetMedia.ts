export type AssetMediaKind = 'image' | 'video' | 'audio' | 'document';

export function getAssetMediaKind(task: { mediaType?: string; resultUrl?: string; model?: string }): AssetMediaKind {
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
import { resolveAssetMediaType } from '@client/shared/utils/assetTaskData';
