import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type JSZip from 'jszip';
import { EXPORT_ZIP_LIMITS } from '@shared/domain/media/exportZipLimits';

// One export per sidecar bounds total staging disk and prevents parallel Blob-sized jobs.
let exportInProgress = false;
const EXPORT_TIMEOUT_MS = 10 * 60 * 1000;

export async function createExportWorkspace(requestSignal: AbortSignal) {
  if (exportInProgress) return null;
  exportInProgress = true;
  let directory: string;
  try { directory = await fs.mkdtemp(path.join(tmpdir(), 'beike-export-')); }
  catch (error) { exportInProgress = false; throw error; }
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(EXPORT_TIMEOUT_MS)]);
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () => {
    cleanupPromise ??= fs.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch((error) => { console.warn('[export-zip] 临时文件清理失败:', error); }).finally(() => { exportInProgress = false; });
    return cleanupPromise;
  };
  return { directory, signal, cleanup };
}
export type ExportWorkspace = NonNullable<Awaited<ReturnType<typeof createExportWorkspace>>>;

/** JSZip reads one staged file at a time; no ZIP/media-sized Buffer is created. */
export async function stageExportZip(zip: JSZip, workspace: ExportWorkspace): Promise<{ file: string; bytes: number }> {
  const file = path.join(workspace.directory, 'archive.zip');
  let bytes = 0;
  const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.byteLength;
    callback(bytes > EXPORT_ZIP_LIMITS.maxArchiveBytes ? new Error('导出 ZIP 超过 520 MB，请分批导出') : null, chunk);
  } });
  await pipeline(
    zip.generateNodeStream({ streamFiles: true, compression: 'STORE' }),
    limit,
    createWriteStream(file, { flags: 'wx', highWaterMark: 64 * 1024 }),
    { signal: workspace.signal },
  );
  return { file, bytes };
}

/** Cleanup on completed delivery, disconnected clients, explicit cancel, or timeout. */
export function openExportZipBody(file: string, workspace: ExportWorkspace): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(file, { highWaterMark: 64 * 1024 });
  const reader = (Readable.toWeb(nodeStream, { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } }) as ReadableStream<Uint8Array>).getReader();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    workspace.signal.removeEventListener('abort', onAbort);
    await reader.cancel().catch(() => {});
    await workspace.cleanup();
  };
  const onAbort = () => {
    if (finished) return;
    controller.error(new Error('导出下载已取消或超时'));
    void finish().catch((error) => { console.warn('[export-zip] 中断清理失败:', error); });
  };
  return new ReadableStream<Uint8Array>({
    start(target) {
      controller = target;
      workspace.signal.addEventListener('abort', onAbort, { once: true });
      if (workspace.signal.aborted) onAbort();
    },
    async pull(target) {
      if (finished) return;
      try {
        const result = await reader.read();
        if (finished) return;
        if (result.done) {
          await finish();
          target.close();
        } else target.enqueue(result.value);
      } catch (error) {
        if (!finished) target.error(error);
        await finish();
      }
    },
    cancel() { return finish(); },
  }, { highWaterMark: 1 });
}
