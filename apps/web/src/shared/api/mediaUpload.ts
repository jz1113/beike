import { compressImageToDataUrl } from '@/shared/media/image-utils';

export type RefMediaKind = 'image' | 'video';

/** 将 File 读取为 data URL */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') resolve(event.target.result);
      else reject(new Error('无法读取文件'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('无法读取文件'));
    reader.readAsDataURL(file);
  });
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|avi|mkv)$/i;

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return IMAGE_EXT_RE.test(file.name);
}

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return VIDEO_EXT_RE.test(file.name);
}

export function isImageOrVideoFile(file: File): boolean {
  return isImageFile(file) || isVideoFile(file);
}

export function getFileBaseName(file: File): string {
  return file.name.replace(/\.[^/.]+$/, '').trim() || file.name;
}

/** 修正 FileReader 产生的 application/octet-stream 等非 image/* data URL */
export function normalizeImageDataUrl(file: File, dataUrl: string): string {
  if (!isImageFile(file) || dataUrl.startsWith('data:image/')) return dataUrl;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl;
  const base64 = dataUrl.slice(comma + 1);
  let mime = 'image/jpeg';
  if (file.type.startsWith('image/')) {
    mime = file.type;
  } else if (/\.png$/i.test(file.name)) {
    mime = 'image/png';
  } else if (/\.webp$/i.test(file.name)) {
    mime = 'image/webp';
  } else if (/\.gif$/i.test(file.name)) {
    mime = 'image/gif';
  }
  return `data:${mime};base64,${base64}`;
}

export async function readImageFileAsDataUrl(file: File): Promise<string> {
  if (!isImageFile(file)) {
    const raw = await readFileAsDataUrl(file);
    return normalizeImageDataUrl(file, raw);
  }
  if (file.type === 'image/gif') {
    const raw = await readFileAsDataUrl(file);
    return normalizeImageDataUrl(file, raw);
  }
  const jpeg = await compressImageToDataUrl(file, 1600, 0.85);
  if (jpeg) return jpeg;
  const raw = await readFileAsDataUrl(file);
  return normalizeImageDataUrl(file, raw);
}

/** 视频预览 URL：固定 blob，截帧留给展示层（避免缓存黑帧 JPEG） */
export async function readVideoPreviewUrl(file: File): Promise<string> {
  return URL.createObjectURL(file);
}

/** 本地素材预览 URL：视频用缩略图/blob，图片用修正后的 data URL */
export async function readMediaPreviewUrl(file: File): Promise<string> {
  if (isVideoFile(file)) return readVideoPreviewUrl(file);
  return readImageFileAsDataUrl(file);
}

export interface ProcessDroppedMediaResult {
  processed: number;
  skipped: number;
  failed: number;
}

/** 批量处理拖入的图片/视频文件 */
export async function processDroppedMediaFiles(
  files: File[],
  onEach: (url: string, origName: string, file: File) => void,
  opts?: { onAllSkipped?: () => void; onError?: (message: string) => void },
): Promise<ProcessDroppedMediaResult> {
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    if (!isImageOrVideoFile(file)) {
      skipped += 1;
      continue;
    }
    try {
      const url = await readMediaPreviewUrl(file);
      onEach(url, getFileBaseName(file), file);
      processed += 1;
    } catch (err) {
      failed += 1;
      opts?.onError?.(err instanceof Error ? err.message : '无法读取文件');
    }
  }

  if (processed === 0 && files.length > 0) {
    if (failed > 0 && skipped === 0) {
      opts?.onError?.('无法读取拖入的文件');
    } else {
      opts?.onAllSkipped?.();
    }
  }

  return { processed, skipped, failed };
}
