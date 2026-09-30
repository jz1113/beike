import fs from 'node:fs/promises';
import { isMediaDownloadContent } from '@shared/domain/media/mediaDownload';
import { EXPORT_ZIP_LIMITS, getExportMediaByteLimit } from '@shared/domain/media/exportZipLimits';
import { openExportMedia } from './exportZipSources';

export type ExportMediaResult = { ok: true; path: string; bytes: number; contentType: string } | { ok: false; error: string };

/** Shared by concurrent writers; bytes are reserved synchronously before they reach disk. */
export function createExportByteBudget(limit = EXPORT_ZIP_LIMITS.totalMediaBytes) {
  let used = 0;
  return {
    remaining: () => limit - used,
    consume(bytes: number) { if (used + bytes > limit) return false; used += bytes; return true; },
    release(bytes: number) { used = Math.max(0, used - bytes); },
  };
}
export type ExportByteBudget = ReturnType<typeof createExportByteBudget>;

/** Stream each media to disk: bounded memory, exact truncation checks, no partial ZIP entry. */
export async function fetchExportMedia(
  url: string,
  destination: string,
  budget: ExportByteBudget,
  signal: AbortSignal,
  filename = '',
): Promise<ExportMediaResult> {
  let bytes = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let file: Awaited<ReturnType<typeof fs.open>> | undefined;
  const cancelOnAbort = () => { void reader?.cancel(signal.reason).catch(() => {}); };
  try {
    const source = await openExportMedia(url, signal);
    reader = source.body.getReader();
    signal.addEventListener('abort', cancelOnAbort, { once: true });
    const maxBytes = Math.min(getExportMediaByteLimit(source.contentType, url, filename), source.inline ? EXPORT_ZIP_LIMITS.inlineBytes : Infinity);
    if (source.contentLength && source.contentLength > maxBytes) throw new Error(`媒体文件超过 ${maxBytes / 1024 / 1024} MB 导出上限`);
    if (source.contentLength && source.contentLength > budget.remaining()) throw new Error('本次导出素材总量超过 512 MB，请分批导出');
    file = await fs.open(destination, 'wx');
    const prefix = Buffer.alloc(512);
    let prefixBytes = 0;
    let validated = false;
    const validatePrefix = () => {
      if (!isMediaDownloadContent(source.contentType, url, prefix.subarray(0, prefixBytes).toString('utf8'))) throw new Error('下载地址返回了错误页面或非媒体文件');
      validated = true;
    };
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (bytes + value.byteLength > maxBytes) throw new Error(`媒体文件超过 ${maxBytes / 1024 / 1024} MB 导出上限`);
      if (!budget.consume(value.byteLength)) throw new Error('本次导出素材总量超过 512 MB，请分批导出');
      bytes += value.byteLength;
      if (prefixBytes < prefix.length) {
        const length = Math.min(prefix.length - prefixBytes, value.byteLength);
        prefix.set(value.subarray(0, length), prefixBytes);
        prefixBytes += length;
        if (prefixBytes === prefix.length) validatePrefix();
      }
      await file.writeFile(value);
    }
    if (!bytes) throw new Error('媒体文件为空');
    if (!validated) validatePrefix();
    if (source.contentLength !== undefined && source.contentLength !== bytes) throw new Error('媒体文件下载不完整');
    await file.close();
    file = undefined;
    return { ok: true, path: destination, bytes, contentType: source.contentType };
  } catch (error) {
    await reader?.cancel().catch(() => {});
    await file?.close().catch(() => {});
    await fs.rm(destination, { force: true }).catch(() => {});
    budget.release(bytes);
    return { ok: false, error: signal.aborted ? '导出已取消或超时，请重试' : error instanceof Error ? error.message : '媒体文件读取失败或地址未通过安全校验' };
  } finally {
    signal.removeEventListener('abort', cancelOnAbort);
    reader?.releaseLock();
  }
}
