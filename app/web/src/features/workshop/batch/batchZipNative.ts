import { exportZipDownload } from '@/lib/exportZipDownload';
import type { BatchProductItem } from './batchTypes';

export function toStoragePath(url: string): string {
  const match = url.match(/\/storage\/[^?#]+/);
  return match ? match[0] : url;
}

export function isPersistedStorageUrl(url: string): boolean {
  return Boolean(url) && !url.startsWith('blob:') && !url.startsWith('data:') && /\/storage\//.test(url);
}

export function canNativeOfflineExport(items: BatchProductItem[]): boolean {
  const urls = items.flatMap(item =>
    (item.tasks || []).filter(task => task.status === 'SUCCESS' && task.resultUrl).map(task => task.resultUrl!)
  );
  return urls.length > 0 && urls.every(isPersistedStorageUrl);
}

export async function tryNativeOfflineZip(
  items: BatchProductItem[],
  filename: string,
  onProgress: (msg: string) => void,
): Promise<void> {
  await exportZipDownload({
    offlineMatrix: true,
    products: items.map(item => ({
      id: item.id,
      itemId: item.itemId,
      title: item.title,
      copywriting: item.copywriting,
      images: (item.tasks || [])
        .filter(task => task.status === 'SUCCESS' && task.resultUrl)
        .map(task => ({ url: toStoragePath(task.resultUrl!), shotNo: task.shot_no })),
    })),
  }, filename, (progress) => {
    onProgress(progress.phase === 'saving' ? '正在保存' : '正在打包');
  });
}
