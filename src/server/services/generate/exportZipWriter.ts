import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { detectStagedExportMediaFormat } from './exportMediaValidation';
import path from 'node:path';
import { Readable } from 'node:stream';
import JSZip from 'jszip';
import { EXPORT_ZIP_LIMITS } from '@shared/domain/media/exportZipLimits';
import { getMediaDownloadFilename } from '@shared/domain/media/mediaDownload';
import { createExportByteBudget, fetchExportMedia } from './exportZipDownload';
import { stageExportZip, type ExportWorkspace } from './exportZipWorkspace';
import { MEDIA_FILE_OPTS, TXT_FILE_OPTS } from './exportZipFiles';
import { sanitizeFileSystemName, reserveExportFileNames } from './exportZipNames';

/** Stage media on disk while preserving exact export counts and bounded concurrency. */
export function createExportZipWriter(zip: JSZip, workspace: ExportWorkspace) {
  const budget = createExportByteBudget();
  const streams: Readable[] = [];
  const statistics = { total: 0, succeeded: 0, failed: 0, items: [] as Array<{ filename: string; status: 'success' | 'failure'; error?: string }> };
  const usedNames = new WeakMap<JSZip, Set<string>>();
  const reserveFilename = (folder: JSZip, requested: string) => {
    const prefix = (folder as JSZip & { root?: string }).root || '';
    const names = usedNames.get(folder) || new Set<string>(Object.keys(folder.files)
      .filter(name => name.startsWith(prefix)).map(name => name.slice(prefix.length).toLowerCase()));
    usedNames.set(folder, names);
    const extension = requested.match(/\.([a-z0-9]{1,8})$/i)?.[1] || 'bin';
    return reserveExportFileNames(requested, extension, names).filename;
  };

  const addMediaFile = async (folder: JSZip, url: string, requested: string, imageOnly = false) => {
    const index = statistics.total++;
    if (statistics.total > EXPORT_ZIP_LIMITS.maxMediaItems) throw new Error('一次最多导出 500 个媒体文件，请分批导出');
    const result = await fetchExportMedia(url, path.join(workspace.directory, `media-${index}`), budget, workspace.signal, requested);
    let error: string | undefined = result.ok ? undefined : result.error;
    let filename = requested;
    const mediaMime = result.ok ? result.contentType.split(';')[0].trim().toLowerCase() : '';
    const mediaExpected = result.ok && (imageOnly || /^(?:image|video)\//i.test(result.contentType) ||
      (/^(?:application\/octet-stream|binary\/octet-stream)?$/i.test(result.contentType.split(';')[0].trim()) &&
       /\.(?:jpe?g|png|webp|gif|avif|bmp|tiff?|heic|mp4|mov|m4v|webm|mkv|avi|flv|ogv)$/i.test(requested)));
    if (result.ok && mediaExpected) {
      const format = await detectStagedExportMediaFormat(result.path, result.bytes);
      if (!format || (imageOnly && format.kind !== 'image') || (mediaMime.startsWith('image/') && format.kind !== 'image') || (mediaMime.startsWith('video/') && format.kind !== 'video')) {
        error = '下载内容不是有效图片或视频文件';
        await fs.rm(result.path, { force: true });
        budget.release(result.bytes);
      } else filename = imageOnly ? `${requested}.${format.extension}` : filename.replace(/\.[a-z0-9]+$/i, '') + `.${format.extension}`;
    }
    if (result.ok && !error) {
      filename = reserveFilename(folder, mediaExpected ? filename : getMediaDownloadFilename(sanitizeFileSystemName(filename), result.contentType, url));
      const stream = Readable.from((async function* () {
        for await (const chunk of createReadStream(result.path, { highWaterMark: 64 * 1024 })) yield chunk;
      })());
      streams.push(stream);
      folder.file(filename, stream, MEDIA_FILE_OPTS);
      statistics.succeeded++;
      statistics.items.push({ filename, status: 'success' });
      return true;
    }
    filename = reserveFilename(folder, `${sanitizeFileSystemName(requested)}.error.txt`);
    const source = url.startsWith('data:') ? `内嵌素材 data URL（${url.length} 字符）`
      : url.length > 2048 ? `${url.slice(0, 2048)}…（链接过长，后续已省略）` : url;
    folder.file(filename, `${error || '媒体文件读取失败'}\n原始URL: ${source}`, TXT_FILE_OPTS);
    statistics.failed++;
    statistics.items.push({ filename, status: 'failure', error });
    return false;
  };

  const buildZip = async (zipFileName: string) => {
    workspace.signal.throwIfAborted();
    if (!statistics.succeeded) return { kind: 'error' as const, body: { success: false as const, error: statistics.total ? '所有媒体文件均未能下载，请检查文件地址后重试' : '没有可打包的媒体素材', ...statistics }, status: statistics.total ? 502 : 400 };
    if (statistics.failed) zip.file('export-summary.json', JSON.stringify({ ...statistics, partial: true }, null, 2), TXT_FILE_OPTS);
    zip.file('导出结果.txt', `下载成功：${statistics.succeeded} 项\n下载失败：${statistics.failed} 项`, TXT_FILE_OPTS);
    const archive = await stageExportZip(zip, workspace);
    return { kind: 'zip' as const, file: archive.file, bytes: archive.bytes, zipFileName: sanitizeFileSystemName(zipFileName), counts: { completed: statistics.succeeded, total: statistics.total, succeeded: statistics.succeeded, failed: statistics.failed } };
  };
  return { addMediaFile, buildZip, dispose: () => streams.forEach(stream => stream.destroy()) };
}
