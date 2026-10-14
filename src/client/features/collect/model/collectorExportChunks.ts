import { EXPORT_ZIP_LIMITS } from '@shared/domain/media/exportZipLimits';

interface ExportProduct { images: unknown[]; videos?: string[]; video?: string }

/** Conservative ten-image-unit volumes bound memory, using the shared video/image byte caps. */
export function splitCollectorExportProducts<T extends ExportProduct>(products: T[]): T[][] {
  const volumes: T[][] = [];
  const videoWeight = Math.ceil(EXPORT_ZIP_LIMITS.videoBytes / EXPORT_ZIP_LIMITS.imageBytes);
  let current: T[] = [];
  let weight = 0;
  for (const product of products) {
    const images = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    const videos = [...new Set([...(product.videos || []), product.video].filter((url): url is string => Boolean(url)))];
    let imageIndex = 0, videoIndex = 0;
    while (imageIndex < images.length || videoIndex < videos.length) {
      const video = videos[videoIndex];
      const pieceImages = images.slice(imageIndex, imageIndex + (video ? Math.max(0, 10 - videoWeight) : 10));
      const pieceWeight = pieceImages.length + (video ? videoWeight : 0);
      if (current.length && (weight + pieceWeight > 10 || current.length >= 50)) {
        volumes.push(current); current = []; weight = 0;
      }
      current.push({ ...product, images: pieceImages, videos: video ? [video] : [], video: undefined });
      weight += pieceWeight;
      imageIndex += pieceImages.length;
      if (video) videoIndex++;
    }
  }
  if (current.length) volumes.push(current);
  return volumes;
}
