import JSZip from 'jszip';
import type { ExportZipBody } from '@shared/contracts/exportZip';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { exportMediaKey } from './exportMediaValidation';
import { buildCopywritingTxtContent, sanitizeFileSystemName } from './exportZipNames';
import { createExportZipWriter } from './exportZipWriter';
import type { ExportWorkspace } from './exportZipWorkspace';
import { EXPORT_ZIP_LIMITS } from '@shared/domain/media/exportZipLimits';
import { TXT_FILE_OPTS, mediaExtension, addExportManifest, type ExportManifestRow } from './exportZipFiles';
import { addWorkshopProductsToZip } from './exportZipWorkshop';

export { sanitizeFileSystemName, buildProductFolderName, buildCopywritingTxtContent } from './exportZipNames';

type Product = NonNullable<ExportZipBody['products']>[number];
type Image = NonNullable<ExportZipBody['images']>[number];
interface PendingDownloadTask {
  folder: JSZip;
  names: Set<string>;
  filename: string;
  url: string;
  kind: 'image' | 'video';
}

type ExportZipResult =
  | { kind: 'zip'; file: string; bytes: number; zipFileName: string; counts: { completed: number; total: number; succeeded: number; failed: number } }
  | { kind: 'error'; body: { success: false; error: string }; status: number };

function errorResult(error: string, status: number): ExportZipResult {
  return { kind: 'error', body: { success: false, error }, status };
}

function uniqueImages(images: Image[]): Image[] {
  const seen = new Set<string>();
  return images.filter(image => {
    const key = exportMediaKey(typeof image === 'string' ? image : image.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueVideos(product: Pick<Product, 'video' | 'videoUrl' | 'videos'>): string[] {
  return Array.from(new Set([
    ...(Array.isArray(product.videos) ? product.videos : []), product.video, product.videoUrl,
  ].filter((url): url is string => typeof url === 'string' && Boolean(url.trim())).map(exportMediaKey)));
}

function sourceDescription(product: Pick<Product, 'description' | 'sourceUrl'>): string {
  const description = product.description || '';
  return product.sourceUrl && !description.includes(product.sourceUrl)
    ? `${description}${description ? '\n' : ''}来源链接：${product.sourceUrl}` : description;
}

/** Preserve workshop matrix exports while limiting all collected media before body reads. */
export async function generateExportZip(body: ExportZipBody, workspace: ExportWorkspace): Promise<ExportZipResult> {
  const signal = workspace.signal;
  const zip = new JSZip();
  const writer = createExportZipWriter(zip, workspace);
  try {
    signal.throwIfAborted();
    const {
      batchTitle = '全渠道采集批量导出', offlineMatrix = false, singleProductExport = false,
      products, productTitle = '采集素材图集', images = [],
    } = body;
    const downloadConcurrency = Math.max(1, Math.min(EXPORT_ZIP_LIMITS.maxDownloadConcurrency, Math.floor(body.downloadConcurrency || EXPORT_ZIP_LIMITS.downloadConcurrency)));
    const metadataBytes = (products || [body]).reduce((sum, product) => sum + Buffer.byteLength(
      buildCopywritingTxtContent(product.copywritingTitle, product.copywritingContent, product.copywritingTags, product.description)
    ), 0);
    if (metadataBytes > 4 * 1024 * 1024) return errorResult('分卷文案超过 4 MB，请减少每卷条目数量', 413);

    const buildZipResult = writer.buildZip;

    if (offlineMatrix && products && products.length > 0) {
      const total = products.reduce((sum, product) => {
        const shots = new Set(product.images.map((image, index) => typeof image === 'string' ? index + 1 : image.shotNo ?? index + 1)
          .filter(shot => Number.isInteger(shot) && shot >= 1 && shot <= 4));
        return sum + shots.size;
      }, 0);
      if (total > EXPORT_ZIP_LIMITS.maxMediaItems) return errorResult('一次最多导出 500 个媒体文件，请分批导出', 413);
      const result = await addWorkshopProductsToZip(zip, products, {
        singleProductExport, batchTitle, downloadConcurrency, signal,
        addMediaFile: writer.addMediaFile,
      });
      return await buildZipResult(result.filename);
    }

    const pending: PendingDownloadTask[] = [];
    const reserveNames = () => new Set(['小红书种草文案.txt', '采集清单.xlsx', '导出结果.txt']);
    const appendTasks = (folder: JSZip, names: Set<string>, productImages: Image[], videos: string[]) => {
      const entries = uniqueImages(productImages);
      for (let index = 0; index < entries.length; index++) {
        const image = entries[index];
        const url = typeof image === 'string' ? image.trim() : image.url.trim();
        const number = typeof image === 'object' && image.shotNo ? image.shotNo : index + 1;
        pending.push({ folder, names, kind: 'image', url,
          filename: typeof image === 'object' && image.filename ? image.filename : `${number}.${mediaExtension(url, 'image')}` });
      }
      videos.forEach((url, index) => pending.push({ folder, names, kind: 'video', url,
        filename: `${entries.length + index + 1}.${mediaExtension(url, 'video')}` }));
    };
    let zipFileName: string;

    if (products && products.length > 0) {
      zipFileName = sanitizeFileSystemName(batchTitle, '全渠道批量采集成果');
      const rootFolder = zip.folder(zipFileName) || zip;
      const folderNames = new Set<string>();
      const manifestRows: ExportManifestRow[] = [];
      for (let index = 0; index < products.length; index++) {
        const product = products[index];
        const title = product.copywritingTitle || product.title || product.productTitle || `商品_${index + 1}`;
        const currentName = sanitizeFileSystemName(String(product.currentName || index + 1), String(index + 1));
        let folderName = currentName;
        for (let suffix = 2; folderNames.has(folderName.toLowerCase()); suffix++) folderName = `${currentName}_${suffix}`;
        folderNames.add(folderName.toLowerCase());
        const folder = rootFolder.folder(folderName) || rootFolder;
        const firstImage = product.images[0];
        manifestRows.push({ '当前命名': folderName, '原标题': title, '链接': product.sourceUrl || '',
          '封面图链接': product.coverImage || (typeof firstImage === 'string' ? firstImage : firstImage?.url || '') });
        const copy = buildCopywritingTxtContent(product.copywritingTitle || product.title, product.copywritingContent,
          product.copywritingTags, sourceDescription(product));
        if (copy) folder.file('小红书种草文案.txt', copy, TXT_FILE_OPTS);
        appendTasks(folder, reserveNames(), product.images, uniqueVideos(product));
      }
      addExportManifest(rootFolder, manifestRows);
    } else {
      zipFileName = body.folderName ? sanitizeFileSystemName(body.folderName) : sanitizeFileSystemName(body.currentName || '1', '1');
      const folder = zip.folder(zipFileName) || zip;
      const copy = buildCopywritingTxtContent(body.copywritingTitle, body.copywritingContent, body.copywritingTags, sourceDescription(body));
      if (copy) folder.file('小红书种草文案.txt', copy, TXT_FILE_OPTS);
      appendTasks(folder, reserveNames(), images, uniqueVideos(body));
      addExportManifest(folder, [{ '当前命名': zipFileName, '原标题': body.copywritingTitle || productTitle,
        '链接': body.sourceUrl || '', '封面图链接': body.coverImage || (typeof images[0] === 'string' ? images[0] : images[0]?.url || '') }]);
    }
    if (!pending.length) return errorResult('没有可打包的图片或视频素材', 400);
    if (pending.length > EXPORT_ZIP_LIMITS.maxMediaItems) return errorResult('一次最多导出 500 个媒体文件，请分批导出', 413);

    let next = 0;
    const worker = async () => {
      while (next < pending.length) {
        signal.throwIfAborted();
        const task = pending[next++];
        await writer.addMediaFile(task.folder, task.url, task.filename);
      }
    };
    await Promise.all(Array.from({ length: Math.min(downloadConcurrency, pending.length) }, worker));
    return await buildZipResult(zipFileName);
  } catch (error) {
    if (signal.aborted) return errorResult('导出已取消', 499);
    console.error('Export ZIP error:', error);
    return errorResult(formatUserError(error, '导出 ZIP 压缩包失败'), 500);
  } finally { writer.dispose(); }
}
