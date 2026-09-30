import { exportZipDownload, formatExportProgress, type ExportZipResult } from '@client/shared/api/exportZipDownload';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { BatchProductItem } from '../batchTypes';
import { exportFourShots, exportGeneratedTitle, exportProductId, exportPromptGroupName } from './batchExportFields';

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
