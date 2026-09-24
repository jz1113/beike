import { fetchMediaBlob } from '@/shared/media/downloadMedia';
import { apiFetch, proxyMediaUrl, readClientStorageConfig, storageConfigHeaders } from '@/shared/api/apiClient';
import type { BatchProductItem } from './batchTypes';

export type MatrixExportRow = Record<string, string>;

export async function ensurePermanentImageUrl(url: string, filename: string): Promise<string> {
  if (!url) return url;
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

function slotUrls(item: BatchProductItem): string[] {
  return (item.tasks || [])
    .filter((task) => task.status === 'SUCCESS' && task.resultUrl && task.resultStatus !== 'superseded')
    .slice()
    .sort((a, b) => a.shot_no - b.shot_no)
    .map((task) => task.resultUrl || '');
}

export async function buildMatrixExportRows(
  items: BatchProductItem[],
  onProgress?: (current: number, total: number) => void,
  opts?: { offline?: boolean; linkForShot?: (item: BatchProductItem, shotNo: number) => string | undefined }
): Promise<MatrixExportRow[]> {
  const rows: MatrixExportRow[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const content = item.copywriting?.content?.trim() || '';
    const tags = (item.copywriting?.tags || []).map(t => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    let taskCopywriting = content;
    if (tags && !content.includes('#')) taskCopywriting = content ? `${content}\n\n${tags}` : tags;

    const rawUrls = slotUrls(item).map((url, idx) => opts?.linkForShot?.(item, idx + 1) ?? url);
    const finalUrls = opts?.offline
      ? rawUrls
      : await Promise.all(rawUrls.map((url, idx) => url ? ensurePermanentImageUrl(url, `slice_${item.itemId || item.id}_${idx + 1}`) : Promise.resolve('')));

    const row: MatrixExportRow = {
      '任务标题': item.copywriting?.title?.trim() || item.title?.trim() || item.itemId || '未命名任务',
      '任务文案': taskCopywriting,
      '商品名称': item.title?.trim() || '',
      '商品ID': item.itemId?.trim() || item.id || '',
      '图链接1': '',
      '图链接2': '',
      '图链接3': '',
      '图链接4': '',
      '图链接5': '',
      '图链接6': '',
      '图链接7': '',
      '图链接8': '',
    };
    finalUrls.forEach((url, idx) => {
      row[`图链接${idx + 1}`] = url || '';
    });
    rows.push(row);
    onProgress?.(i + 1, items.length);
  }
  return rows;
}
