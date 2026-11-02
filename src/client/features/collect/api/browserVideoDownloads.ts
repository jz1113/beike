import { apiFetch } from '@client/shared/api/apiClient';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { MAX_VIDEO_DOWNLOAD_BYTES, readExportBlob } from './collectorExportResponse';

interface BrowserVideoItem { id: string; filename: string; url: string }
type Status = 'pending' | 'running' | 'success' | 'failed';

/** Save one bounded response at a time; never send a client path to the server. */
export async function downloadVideosInBrowser(
  items: BrowserVideoItem[],
  signal: AbortSignal,
  onStatus: (id: string, status: Status, error?: string) => void,
): Promise<void> {
  for (const item of items) {
    if (signal.aborted) return;
    onStatus(item.id, 'running');
    try {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(360_000)]);
      const response = await apiFetch(`/api/system/proxy-video?url=${encodeURIComponent(item.url)}`, { signal: requestSignal });
      const blob = await readExportBlob(response, MAX_VIDEO_DOWNLOAD_BYTES, requestSignal);
      signal.throwIfAborted();
      if (blob.size === 0) throw new Error('视频内容为空');
      await saveToDownloadDir(item.filename, blob);
      onStatus(item.id, 'success');
    } catch (error) {
      if (signal.aborted) { onStatus(item.id, 'pending'); return; }
      onStatus(item.id, 'failed', error instanceof Error ? error.message : '视频下载失败');
    }
  }
}
