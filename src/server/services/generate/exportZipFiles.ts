import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { WORKSHOP_EXPORT_HEADERS, type WorkshopExportRow } from '@shared/domain/workshop/workshopExport';

export const TXT_FILE_OPTS: JSZip.JSZipFileOptions = { compression: 'DEFLATE' };
export const MEDIA_FILE_OPTS: JSZip.JSZipFileOptions = { compression: 'STORE' };

export function truncateFileSystemName(name: string, maxLength: number): string {
  let result = '';
  for (const char of name) {
    const code = char.charCodeAt(0);
    const safeChar = char.length === 1 && code >= 0xd800 && code <= 0xdfff ? '_' : char;
    if (result.length + safeChar.length > maxLength) break;
    result += safeChar;
  }
  return result;
}

export { sanitizeFileSystemName, buildProductFolderName } from './exportZipNames';

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

export function addWorkshopExportManifest(zipFolder: JSZip, rows: WorkshopExportRow[]) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...WORKSHOP_EXPORT_HEADERS] });
  sheet['!cols'] = [
    { wch: 35 }, { wch: 22 }, { wch: 24 },
    { wch: 64 }, { wch: 64 }, { wch: 64 }, { wch: 64 },
    { wch: 42 }, { wch: 80 }, { wch: 28 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '生成成果清单');
  zipFolder.file('生成成果清单.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), MEDIA_FILE_OPTS);
}
