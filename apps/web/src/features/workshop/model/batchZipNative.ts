import { exportZipDownload } from '@/shared/api/exportZipDownload';
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
): Promise<{ completed: number; total: number } | null> {
  return exportZipDownload({
    offlineMatrix: true,
    batchTitle: '贝壳云图_批量生图矩阵',
    products: items.map(item => ({
      skuId: item.itemId || item.id,
      currentName: item.itemId || item.id,
      title: item.title,
      copywritingTitle: item.copywriting?.title,
      copywritingContent: item.copywriting?.content,
      copywritingTags: item.copywriting?.tags,
      images: (item.tasks || [])
        .filter(task => task.status === 'SUCCESS' && task.resultUrl)
        .map(task => ({ url: toStoragePath(task.resultUrl!), shotNo: task.shot_no, filename: `分镜${task.shot_no}.${task.resultUrl!.split('?')[0].split('.').pop() || 'png'}` })),
    })),
  }, filename, (progress) => {
    onProgress(progress.phase === 'saving' ? '正在保存' : '正在打包');
  });
}
