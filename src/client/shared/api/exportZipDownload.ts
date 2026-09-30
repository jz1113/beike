import { apiFetch } from './apiClient';
import { saveToDownloadDir } from '../media/saveDownload';
import { EXPORT_ZIP_LIMITS } from '@shared/domain/media/exportZipLimits';

export interface ExportZipStatistics { total: number; succeeded: number; failed: number; partial: boolean }
export interface ExportZipResult extends ExportZipStatistics { savedVia: 'browser' }
export interface ExportProgress { phase: 'packing' | 'saving' | 'done'; downloaded: number; total?: number; result?: ExportZipStatistics; savedVia?: 'browser' }

export function readExportZipResult(response: Response): ExportZipStatistics {
  const count = (key: string) => {
    const raw = response.headers.get(key);
    const value = raw && /^\d+$/.test(raw) ? Number(raw) : 0;
    return Number.isSafeInteger(value) ? value : 0;
  };
  const failed = count('X-Export-Failed');
  return { total: count('X-Export-Total'), succeeded: count('X-Export-Succeeded'), failed, partial: failed > 0 || response.headers.get('X-Export-Partial') === 'true' };
}

export function formatExportProgress(progress: ExportProgress): string {
  if (progress.phase === 'packing') return '正在打包…';
  if (progress.phase === 'done') {
    const delivery = '已发起下载';
    return progress.result?.partial ? `${delivery}；${progress.result.succeeded}/${progress.result.total} 个文件成功，${progress.result.failed} 个失败` : delivery;
  }
  const mb = (progress.downloaded / 1024 / 1024).toFixed(0);
  return progress.total ? `正在保存 ${Math.min(100, Math.floor(progress.downloaded / progress.total * 100))}%` : `正在保存 ${mb} MB`;
}

async function readZipBlob(response: Response, onBytes: (bytes: number) => void): Promise<Blob> {
  if (!response.body) throw new Error('ZIP 文件没有内容，请重新导出');
  const reader = response.body.getReader();
  let downloaded = 0;
  let lastProgress = 0;
  // Let the browser construct its Blob; avoid a second JS array of every received chunk.
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          onBytes(downloaded);
          controller.close();
          return;
        }
        downloaded += next.value.byteLength;
        if (downloaded > EXPORT_ZIP_LIMITS.maxArchiveBytes) throw new Error('ZIP 文件超过 520 MB，请分批导出');
        const now = Date.now();
        if (now - lastProgress >= 100) { onBytes(downloaded); lastProgress = now; }
        controller.enqueue(next.value);
      } catch (error) {
        await reader.cancel().catch(() => {});
        controller.error(error);
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/zip' } }).blob();
}

/** Verify the central-directory terminator even when Content-Length is absent. */
async function isCompleteZip(blob: Blob): Promise<boolean> {
  if (blob.size < 26) return false;
  const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (signature[0] !== 80 || signature[1] !== 75 || signature[2] !== 3 || signature[3] !== 4) return false;
  const tailStart = Math.max(0, blob.size - 65557);
  const tail = new Uint8Array(await blob.slice(tailStart).arrayBuffer());
  const view = new DataView(tail.buffer);
  for (let index = tail.length - 22; index >= 0; index--) {
    if (view.getUint32(index, true) !== 0x06054b50) continue;
    if (index + 22 + view.getUint16(index + 20, true) !== tail.length) continue;
    const disk = view.getUint16(index + 4, true);
    const directoryDisk = view.getUint16(index + 6, true);
    const entriesOnDisk = view.getUint16(index + 8, true);
    const entries = view.getUint16(index + 10, true);
    const directorySize = view.getUint32(index + 12, true);
    const directoryStart = view.getUint32(index + 16, true);
    return disk === 0 && directoryDisk === 0 && entries > 0 && entries === entriesOnDisk && directoryStart + directorySize === tailStart + index;
  }
  return false;
}

export async function exportZipDownload(payload: Record<string, unknown>, filename: string, onProgress: (progress: ExportProgress) => void): Promise<ExportZipResult> {
  const body = JSON.stringify(payload);
  onProgress({ phase: 'packing', downloaded: 0 });
  const response = await apiFetch('/api/generate/export-zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || `服务端打包失败: HTTP ${response.status}`);
  }
  if (!response.headers.get('content-type')?.includes('application/zip')) {
    await response.body?.cancel().catch(() => {});
    throw new Error('导出服务未返回 ZIP 文件，请重试');
  }
  const result = readExportZipResult(response);
  if (response.headers.has('X-Export-Succeeded') && result.succeeded === 0) {
    await response.body?.cancel().catch(() => {});
    throw new Error('没有成功导出的媒体文件');
  }
  const rawTotal = response.headers.get('content-length');
  const parsedTotal = rawTotal && /^\d+$/.test(rawTotal) ? Number(rawTotal) : 0;
  const total = Number.isSafeInteger(parsedTotal) && parsedTotal > 0 ? parsedTotal : undefined;
  if (total && total > EXPORT_ZIP_LIMITS.maxArchiveBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error('ZIP 文件超过 520 MB，请分批导出');
  }
  onProgress({ phase: 'saving', downloaded: 0, total, result });
  const blob = await readZipBlob(response, (downloaded) => onProgress({ phase: 'saving', downloaded, total, result }));
  if ((total && blob.size !== total) || !await isCompleteZip(blob)) throw new Error('ZIP 文件不完整，请重新导出');
  const savedVia = await saveToDownloadDir(filename, blob);
  onProgress({ phase: 'done', downloaded: blob.size, total, result, savedVia });
  return { ...result, savedVia };
}
