import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { uploadSalesCustomAsset } from './salesProduction';
import type { FaceRegion, ProductFaceEdit } from '../model/salesProductFaces';

export async function loadProductFaceImage(url: string, signal: AbortSignal) {
  const response = await fetch(proxyMediaUrl(url), { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error('商品图读取失败，请检查原图后重试。');
  const source = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    signal.throwIfAborted();
    return image;
  } finally { URL.revokeObjectURL(source); }
}

// Resample only the selected pixels into coarse mosaic blocks. This also works
// in browsers without CanvasRenderingContext2D.filter.
export function drawProductFaces(canvas: HTMLCanvasElement, image: HTMLImageElement, regions: FaceRegion[]) {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  const tile = document.createElement('canvas');
  const sampler = tile.getContext('2d');
  if (!ctx || !sampler) throw new Error('浏览器无法处理图片，请更换浏览器重试。');
  ctx.drawImage(image, 0, 0);
  for (const region of regions) {
    const x = Math.floor(region.x * canvas.width), y = Math.floor(region.y * canvas.height);
    const width = Math.ceil((region.x + region.width) * canvas.width) - x;
    const height = Math.ceil((region.y + region.height) * canvas.height) - y;
    const block = Math.max(2, Math.ceil(Math.max(width, height) / 5));
    tile.width = Math.max(1, Math.ceil(width / block));
    tile.height = Math.max(1, Math.ceil(height / block));
    sampler.drawImage(image, x, y, width, height, 0, 0, tile.width, tile.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile, x, y, width, height);
  }
}

export async function saveProductFaceImage(source: string, image: HTMLImageElement, regions: FaceRegion[], signal: AbortSignal): Promise<ProductFaceEdit> {
  if (!regions.length) return { url: source, regions };
  const canvas = document.createElement('canvas');
  drawProductFaces(canvas, image, regions);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('商品图打码副本导出失败')), 'image/png'));
  signal.throwIfAborted();
  const url = await uploadSalesCustomAsset(new File([blob], 'product-face-mask.png', { type: 'image/png' }), 'assets', signal);
  return { url, regions };
}

export async function autoMaskProductImage(source: string, signal: AbortSignal) {
  const image = await loadProductFaceImage(source, signal);
  const { detectProductFaces } = await import('./salesFaceDetector');
  signal.throwIfAborted();
  const regions = await detectProductFaces(image);
  signal.throwIfAborted();
  return saveProductFaceImage(source, image, regions, signal);
}
