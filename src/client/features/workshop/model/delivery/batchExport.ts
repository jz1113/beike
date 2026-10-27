import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import { getCachedAssetsSync } from '@client/shared/api/assetLibraryCache';
import type { BatchProductItem, BatchTaskItem } from '../batchTypes';
import { isDeliverableWorkshopResult } from '../generation/workshopReadiness';
import { exportZipDownload, formatExportProgress, type ExportZipResult } from '@client/shared/api/exportZipDownload';
import { proxyMediaUrl } from '@client/shared/api/apiClient';


export function exportPromptGroupName(item: BatchProductItem): string {
  if (item.contentPlan) return `内容${item.contentPlan.index}-${item.contentPlan.theme}`;
  const label = fullPromptGroupLabel(item.appliedFullPromptDisplayNumber);
  if (label !== '未编号图组') return label;
  if (!item.appliedFullPromptId) return '未绑定图组';
  const cached = getCachedAssetsSync('full_prompt').find(asset => asset.id === item.appliedFullPromptId);
  return fullPromptGroupLabel(cached?.displayNumber);
}

export function exportProductId(item: BatchProductItem): string {
  return item.itemId?.trim() || item.id;
}

export function exportGeneratedTitle(item: BatchProductItem): string {
  return item.copywriting?.title?.trim() || '';
}

export function exportFourShots(item: BatchProductItem): BatchTaskItem[] {
  const byShot = new Map<number, BatchTaskItem>();
  for (const task of item.tasks || []) {
    if (task.shot_no >= 1 && task.shot_no <= 4 && isDeliverableWorkshopResult(task)) {
      byShot.set(task.shot_no, task);
    }
  }
  return [...byShot.values()].sort((a, b) => a.shot_no - b.shot_no);
}

export function toStoragePath(url: string): string {
  if (url.startsWith('/storage/')) return url.split(/[?#]/)[0];
  try {
    const parsed = new URL(url, window.location.origin);
    const storageOrigin = new URL(proxyMediaUrl('/storage/'), window.location.origin).origin;
    if (parsed.origin === storageOrigin && parsed.pathname.startsWith('/storage/')) return parsed.pathname;
  } catch { /* Keep malformed or remote URLs intact for the download layer. */ }
  return url;
}

export function isPersistedStorageUrl(url: string): boolean {
  return Boolean(url) && toStoragePath(url).startsWith('/storage/');
}

export function canNativeOfflineExport(items: BatchProductItem[]): boolean {
  const urls = items.flatMap(item => exportFourShots(item).map(task => task.resultUrl!));
  return urls.length > 0 && urls.every(isPersistedStorageUrl);
}

export async function tryNativeOfflineZip(
  items: BatchProductItem[],
  filename: string,
  onProgress: (msg: string) => void,
  singleProductExport = false,
): Promise<ExportZipResult> {
  const result = await exportZipDownload({
    offlineMatrix: true,
    singleProductExport,
    batchTitle: '贝壳云图_批量生图矩阵',
    products: items.map(item => ({
      skuId: exportProductId(item),
      title: item.title,
      category: item.category,
      promptAssetGroupName: exportPromptGroupName(item),
      copywritingTitle: exportGeneratedTitle(item),
      copywritingContent: item.copywriting?.content,
      images: exportFourShots(item)
        .map(task => ({
          url: toStoragePath(task.resultUrl!),
          originalUrl: new URL(
            task.resultUrl!.startsWith('/storage/') ? proxyMediaUrl(task.resultUrl!) : task.resultUrl!,
            window.location.origin,
          ).href,
          shotNo: task.shot_no,
        })),
    })),
  }, filename, (progress) => {
    onProgress(formatExportProgress(progress));
  });
  return result;
}
