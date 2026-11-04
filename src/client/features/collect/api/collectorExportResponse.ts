import { EXPORT_ZIP_LIMITS } from '@shared/domain/media/exportZipLimits';

export const MAX_VIDEO_DOWNLOAD_BYTES = EXPORT_ZIP_LIMITS.videoBytes;

export async function readExportBlob(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || `下载失败 HTTP ${response.status}`);
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error('下载文件超过大小限制，请减少每卷素材数量');
  }
  if (!response.body) throw new Error('下载接口返回了空文件');
  const reader = response.body.getReader();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('下载文件超过大小限制，请减少每卷素材数量');
      }
      parts.push(new Uint8Array(value));
    }
    return new Blob(parts, { type: response.headers.get('content-type') || '' });
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

/** Bound declared expanded bytes before JSZip performs CRC checks, preventing ZIP bombs. */
