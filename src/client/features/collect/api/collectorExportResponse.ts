import { apiFetch } from '@client/shared/api/apiClient';
import { EXPORT_ZIP_LIMITS } from '@shared/domain/media/exportZipLimits';

const MAX_ZIP_BYTES = EXPORT_ZIP_LIMITS.maxArchiveBytes;
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
async function checkZipDirectory(blob: Blob) {
  if (blob.size < 22) throw new Error('导出接口返回的 ZIP 无效或已损坏');
  const tailStart = Math.max(0, blob.size - 65557);
  const tail = new DataView(await blob.slice(tailStart).arrayBuffer());
  let end = -1;
  for (let index = tail.byteLength - 22; index >= 0; index--) {
    if (tail.getUint32(index, true) === 0x06054b50 && index + 22 + tail.getUint16(index + 20, true) === tail.byteLength) { end = index; break; }
  }
  if (end < 0 || tail.getUint16(end + 4, true) || tail.getUint16(end + 6, true)) throw new Error('导出接口返回的 ZIP 无效或已损坏');
  const count = tail.getUint16(end + 10, true);
  const length = tail.getUint32(end + 12, true);
  const offset = tail.getUint32(end + 16, true);
  if (count !== tail.getUint16(end + 8, true) || count === 65535 || length > 4 * 1024 * 1024 || offset + length !== tailStart + end) throw new Error('导出接口返回的 ZIP 无效或已损坏');
  const directory = new DataView(await blob.slice(offset, offset + length).arrayBuffer());
  let cursor = 0, expanded = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > length || directory.getUint32(cursor, true) !== 0x02014b50) throw new Error('导出接口返回的 ZIP 无效或已损坏');
    expanded += directory.getUint32(cursor + 24, true);
    cursor += 46 + directory.getUint16(cursor + 28, true) + directory.getUint16(cursor + 30, true) + directory.getUint16(cursor + 32, true);
    if (expanded > MAX_ZIP_BYTES || cursor > length) throw new Error('导出 ZIP 超过安全大小限制，请减少每卷素材数量');
  }
  if (cursor !== length) throw new Error('导出接口返回的 ZIP 无效或已损坏');
}

export async function readCollectorZipResponse(response: Response, signal?: AbortSignal) {
  if (response.ok && !response.headers.get('content-type')?.toLowerCase().includes('application/zip')) {
    await response.body?.cancel();
    throw new Error('导出接口未返回有效 ZIP 文件，请重试');
  }
  const blob = await readExportBlob(response, MAX_ZIP_BYTES, signal);
  await checkZipDirectory(blob);
  signal?.throwIfAborted();
  try {
    const { default: JSZip } = await import('jszip');
    await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
  } catch {
    throw new Error('导出接口返回的 ZIP 无效或已损坏，请重试');
  }
  signal?.throwIfAborted();
  return { blob, failed: Math.max(0, Number(response.headers.get('x-export-failed')) || 0) };
}

export function collectorExportSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(360_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function requestCollectorZip(payload: Record<string, unknown>, signal: AbortSignal) {
  signal.throwIfAborted();
  const response = await apiFetch('/api/generate/export-zip', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
  });
  return readCollectorZipResponse(response, signal);
}
