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
      const url = await readFileAsDataUrl(file);
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
