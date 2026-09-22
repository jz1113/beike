import JSZip from 'jszip';
import * as XLSX from 'xlsx';

export const TXT_FILE_OPTS: JSZip.JSZipFileOptions = { compression: 'DEFLATE' };
export const MEDIA_FILE_OPTS: JSZip.JSZipFileOptions = { compression: 'STORE' };

/** 严格过滤操作系统文件系统禁止命名的特殊符号 (\ / : * ? " < > | 以及换行符等) */
export function sanitizeFileSystemName(name: string, fallback = 'EXPORT'): string {
  if (!name) return fallback;
  let sanitized = (name || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\r\n\t\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');
  if (!sanitized) sanitized = fallback;
  return sanitized.slice(0, 70);
}

/** 按照【商品id-标题】生成合法的目录名与压缩包名 */
export function buildProductFolderName(skuId?: string, title?: string): string {
  const cleanId = sanitizeFileSystemName(skuId || 'PROD', 'PROD');
  const cleanTitle = sanitizeFileSystemName(title || '', '');
  if (cleanTitle) {
    if (cleanTitle.startsWith(cleanId)) return cleanTitle;
    return `${cleanId}-${cleanTitle}`;
  }
  return cleanId;
}

export function mediaExtension(url: string, mediaType: 'image' | 'video'): string {
  const dataMime = url.match(/^data:([a-z0-9.+-]+)\/([a-z0-9.+-]+);/i);
  if (dataMime) {
    const ext = dataMime[2].toLowerCase();
    if (['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif', 'bmp', 'mp4', 'quicktime', 'webm'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext === 'quicktime' ? 'mov' : ext;
    }
  }
  try {
    const ext = new URL(url.startsWith('//') ? `https:${url}` : url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'mp4', 'mov', 'm4v', 'webm', 'avi', 'flv'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  } catch {
    // URL 非标准时保留默认扩展名，下载错误会写入同名 .error.txt。
  }
  return mediaType === 'video' ? 'mp4' : 'jpg';
}

export type ExportManifestRow = {
  '当前命名': string;
  '原标题': string;
  '链接': string;
  '封面图链接': string;
};

export function addExportManifest(zipFolder: JSZip, rows: ExportManifestRow[]) {
  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: ['当前命名', '原标题', '链接', '封面图链接'],
  });
  sheet['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 72 }, { wch: 72 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '采集清单');
  zipFolder.file('采集清单.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), MEDIA_FILE_OPTS);
}
