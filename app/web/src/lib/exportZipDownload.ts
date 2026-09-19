import { apiFetch } from './apiClient';
import { saveToDownloadDir } from './desktopDownload';

export interface ExportProgress { phase: 'packing' | 'saving' | 'done'; downloaded: number; total?: number }

export function formatExportProgress(progress: ExportProgress): string {
  if (progress.phase === 'packing') return '正在打包…';
  if (progress.phase === 'done') return '已保存';
  const mb = (progress.downloaded / 1024 / 1024).toFixed(0);
  return progress.total ? `正在保存 ${Math.min(100, Math.floor(progress.downloaded / progress.total * 100))}%` : `正在保存 ${mb} MB`;
}

export async function exportZipDownload(payload: Record<string, unknown>, filename: string, onProgress: (progress: ExportProgress) => void): Promise<void> {
  const body = JSON.stringify(payload);
  onProgress({ phase: 'packing', downloaded: 0 });
  const response = await apiFetch('/api/generate/export-zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || `服务端打包失败: HTTP ${response.status}`);
  }
  onProgress({ phase: 'saving', downloaded: 0, total: Number(response.headers.get('content-length')) || undefined });
  await saveToDownloadDir(filename, await response.blob());
  onProgress({ phase: 'done', downloaded: 0 });
}
