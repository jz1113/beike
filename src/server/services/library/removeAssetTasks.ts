import { assetTaskRepository } from '@server/repositories/assetTasks';
import { getManagedStorageKey } from '@server/infrastructure/storage/storage';
import { isWorkspaceStorageRel } from '@server/infrastructure/storage/storagePaths';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { queueMediaReview } from './mediaReviewQueue';

function managedMediaIdentity(url: string): string | null {
  if (url.startsWith('/storage/')) {
    let relative: string;
    try { relative = decodeURIComponent(url.split(/[?#]/)[0].slice('/storage/'.length)); } catch { return null; }
    if (/[\\%]/.test(relative) || Array.from(relative).some(char => char.charCodeAt(0) < 32) || relative.split('/').some(part => !part || part === '.' || part === '..')) return null;
    if (!isWorkspaceStorageRel(relative, requireWorkspaceId())) return null;
    return `local:${relative}`;
  }
  return getManagedStorageKey(url);
}

/** Remove acknowledged records first; keep physical files until references are reviewed. */
export async function removeAssetTasks(selection: Parameters<typeof assetTaskRepository.removeRecords>[0], protectUrls: string[]) {
  const removed = await assetTaskRepository.removeRecords(selection);
  const mediaCleanup = { deleted: 0, errors: 0, skipped: 0, deferred: 0 };
  const protectedUrls = new Set([...protectUrls, ...removed.referenced]);
  const protectedKeys = new Set(Array.from(protectedUrls, managedMediaIdentity).filter(Boolean));
  const eligibleUrls: string[] = [];
  for (const url of new Set(removed.records.map(record => record.resultUrl).filter((value): value is string => Boolean(value)))) {
    const key = managedMediaIdentity(url);
    if (!key || protectedUrls.has(url) || protectedKeys.has(key)) mediaCleanup.skipped++;
    else eligibleUrls.push(url);
  }
  let warning: string | undefined;
  if (eligibleUrls.length) {
    try {
      await queueMediaReview(eligibleUrls, { assetType: 'imageTask', ids: removed.records.map(record => record.id) });
      mediaCleanup.deferred = eligibleUrls.length;
    } catch {
      mediaCleanup.errors = eligibleUrls.length;
      warning = '记录已删除，但媒体清理复核暂不可用，原文件已保留';
    }
  }
  return { success: true, count: removed.count, mediaCleanup, warning };
}
