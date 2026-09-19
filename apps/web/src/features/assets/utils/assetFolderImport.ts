import { compressImageToDataUrl } from '@/shared/media/image-utils';
import {
  MAX_IMAGES_PER_SET,
  MIN_IMAGES_PER_SET,
} from '@beike/domain/assetDeconstruct/prompts';
import type { ImageSetQueueItem } from './assetPromptConstants';

export interface FolderImportSkipRecord {
  name: string;
  reason: string;
}

/** 递归从 DragEvent DataTransfer 中读取所有嵌套文件和文件夹 */
export async function getFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items || []);
  if (items.length > 0 && typeof (items[0] as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry }).webkitGetAsEntry === 'function') {
    const files: File[] = [];
    const traverse = async (entry: FileSystemEntry, path = ''): Promise<void> => {
      if (!entry) return;
      if (entry.isFile) {
        return new Promise((resolve) => {
          (entry as FileSystemFileEntry).file(
            (file: File) => {
              Object.defineProperty(file, 'webkitRelativePath', {
                value: path ? `${path}/${file.name}` : file.name,
                writable: false,
              });
              files.push(file);
              resolve();
            },
            () => resolve()
          );
        });
      }
      if (entry.isDirectory) {
        const dirReader = (entry as FileSystemDirectoryEntry).createReader();
        const readEntries = async (): Promise<FileSystemEntry[]> =>
          new Promise((resolve) => {
            dirReader.readEntries(
              (entries) => resolve(entries),
              () => resolve([])
            );
          });
        let entries = await readEntries();
        while (entries.length > 0) {
          for (const child of entries) {
            await traverse(child, path ? `${path}/${entry.name}` : entry.name);
          }
          entries = await readEntries();
        }
      }
    };

    for (const item of items) {
      const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.();
      if (entry) await traverse(entry);
    }
    if (files.length > 0) return files;
  }
  return Array.from(dataTransfer.files || []);
}

function isImageFile(f: File): boolean {
  if (f.type && f.type.startsWith('image/')) return true;
  const name = f.name.toLowerCase();
  return (
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.webp') ||
    name.endsWith('.avif') ||
    name.endsWith('.heic') ||
    name.endsWith('.jfif') ||
    name.endsWith('.gif') ||
    name.endsWith('.bmp') ||
    name.endsWith('.svg')
  );
}

/** 将本地图片/文件夹分组为反推队列项 */
export async function buildQueueItemsFromFiles(fileList: FileList | File[]): Promise<{
  queueItems: ImageSetQueueItem[];
  imageCount: number;
  skipped: FolderImportSkipRecord[];
  truncatedCount: number;
}> {
  const files = Array.from(fileList);
  const imageFiles = files.filter(isImageFile);
  if (imageFiles.length === 0) {
    return { queueItems: [], imageCount: 0, skipped: [], truncatedCount: 0 };
  }

  const folderGroups: Record<string, File[]> = {};
  imageFiles.forEach((file) => {
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const parts = relPath.split('/').filter(Boolean);
    const folderName = parts.length > 1 ? parts[parts.length - 2] : '自选参考图集';
    if (!folderGroups[folderName]) folderGroups[folderName] = [];
    folderGroups[folderName].push(file);
  });

  const queueItems: ImageSetQueueItem[] = [];
  const skipped: FolderImportSkipRecord[] = [];
  let truncatedCount = 0;

  for (const [folderName, grpFiles] of Object.entries(folderGroups)) {
    if (grpFiles.length === 0) continue;
    const sortedFiles = [...grpFiles].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );

    if (sortedFiles.length < MIN_IMAGES_PER_SET) {
      skipped.push({
        name: folderName,
        reason: `图片数不足 ${MIN_IMAGES_PER_SET} 张（当前 ${sortedFiles.length} 张，已跳过）`,
      });
      continue;
    }

    const targetFiles = sortedFiles.slice(0, MAX_IMAGES_PER_SET);
    if (sortedFiles.length > MAX_IMAGES_PER_SET) {
      truncatedCount++;
    }

    const base64List = await Promise.all(
      targetFiles.map((f) => compressImageToDataUrl(f, 1024, 0.82))
    );
    const validImgs = base64List.filter(Boolean);
    if (validImgs.length > 0) {
      queueItems.push({
        id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: folderName,
        images: validImgs,
        status: 'pending',
      });
    }
  }

  return { queueItems, imageCount: imageFiles.length, skipped, truncatedCount };
}
