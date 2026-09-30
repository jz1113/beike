import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { apiFetch, proxyMediaUrl, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { formatWorkshopCopywriting, type WorkshopExportRow } from '@shared/domain/workshop/workshopExport';
import type { BatchProductItem } from '../batchTypes';
import { exportFourShots, exportGeneratedTitle, exportProductId, exportPromptGroupName } from './batchExportFields';

export type MatrixExportRow = WorkshopExportRow;

function existingImageUrl(url: string): string {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return '';
  if (url.startsWith('//')) return new URL(url, window.location.origin).href;
  if (url.startsWith('/')) return new URL(proxyMediaUrl(url), window.location.origin).href;
  return /^(https?:)?\/\//i.test(url) ? url : '';
}

export async function ensurePermanentImageUrl(url: string, filename: string): Promise<string> {
  if (!url) return url;
  if (url.startsWith('//')) url = new URL(url, window.location.origin).href;
  // 已保存的工作区文件无需再次上传；直接导出可在当前站点访问的绝对地址。
  if (url.startsWith('/storage/')) return new URL(proxyMediaUrl(url), window.location.origin).href;
  const looksAlreadyPermanent = /^(https?:)?\/\//i.test(url)
    && !url.startsWith('blob:')
    && !url.startsWith('data:')
    && !url.startsWith('/storage/')
    && /\.(aliyuncs\.com|myqcloud\.com|amazonaws\.com|r2\.dev|r2\.cloudflarestorage\.com|cos\.|qiniucdn|upaiyun|cdn\.)/i.test(url);
  if (looksAlreadyPermanent) return url;

  const needsUpload = url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('/') || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/])/i.test(url);
  if (!needsUpload) return url;

  const blob = await fetchMediaBlob(url);
  if (!blob.size || !blob.type.startsWith('image/')) throw new Error('未获取到有效图片，临时图片可能已失效');
  const formData = new FormData();
  formData.append('category', 'generated/images');
  formData.append('customConfig', JSON.stringify(readClientStorageConfig()));
  formData.append('file', blob, `${filename}.jpg`);
  const upRes = await apiFetch('/api/assets/storage/upload', { method: 'POST', headers: storageConfigHeaders(), body: formData });
  const upData = await upRes.json().catch(() => ({}));
  const uploaded = upData.urls?.[0] || upData.url;
  if (!upRes.ok || upData.success === false || !uploaded) {
    throw new Error(`已停止导出：${upData.error || `上传失败（HTTP ${upRes.status}）`}`);
  }
  const isLocalReturned = typeof uploaded === 'string' && (
    uploaded.startsWith('/') || uploaded.startsWith('blob:') || uploaded.startsWith('data:')
  );
  if (isLocalReturned) {
    throw new Error('已停止导出：存储返回了本地地址，不能用于外部表格导入');
  }
  let parsed: URL;
  try {
    parsed = new URL(uploaded);
  } catch {
    throw new Error('已停止导出：存储返回了无效地址');
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i.test(parsed.hostname)) {
    throw new Error('已停止导出：存储返回本地地址，请检查阿里云 OSS 配置；不能用于外部表格导入');
  }
  return uploaded;
}

export async function buildMatrixExportRows(
  items: BatchProductItem[],
  onProgress?: (current: number, total: number) => void,
  opts?: { includeShot?: (item: BatchProductItem, shotNo: number) => boolean; allowUpload?: boolean },
): Promise<MatrixExportRow[]> {
  const rows: MatrixExportRow[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row: MatrixExportRow = {
      '商品名称': item.title?.trim() || '',
      '商品类目': item.category?.trim() || '',
      '商品id': exportProductId(item),
      '生成图片链接1': '',
      '生成图片链接2': '',
      '生成图片链接3': '',
      '生成图片链接4': '',
      '标题': exportGeneratedTitle(item),
      '文案': formatWorkshopCopywriting(item.copywriting?.content),
      '对应生成的提示词资产分组组名': exportPromptGroupName(item),
    };
    const shots = exportFourShots(item).filter(task => !opts?.includeShot || opts.includeShot(item, task.shot_no));
    await Promise.all(shots.map(async task => {
      row[`生成图片链接${task.shot_no}` as keyof MatrixExportRow] = opts?.allowUpload === false
        ? existingImageUrl(task.resultUrl!)
        : await ensurePermanentImageUrl(task.resultUrl!, `slice_${exportProductId(item)}_${task.shot_no}`);
    }));
    rows.push(row);
    onProgress?.(i + 1, items.length);
  }
  return rows;
}
