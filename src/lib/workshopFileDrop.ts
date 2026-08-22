import { compressImageToDataUrl } from '@/lib/image-utils';
import { isImageFile } from '@/lib/mediaUpload';

/** 压缩多张图片为 data URL */
export async function compressImageFilesToDataUrls(
  files: File[],
  maxWidth = 1600,
  quality = 0.85,
): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    if (!isImageFile(file)) continue;
    try {
      const url = await compressImageToDataUrl(file, maxWidth, quality);
      if (url?.startsWith('data:image/')) urls.push(url);
    } catch {
      /* skip */
    }
  }
  return urls;
}
