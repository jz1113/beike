import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import type { CoverFormat } from './coverFormat';
import { enforceCoverJpegFileSize, MAX_COVER_FILE_BYTES } from './jpegFileSize';

export async function loadImageForCanvas(url: string): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  const blob = await fetchMediaBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error('封面底图无法加载'));
    next.src = objectUrl;
  });
  return { image, revoke: () => URL.revokeObjectURL(objectUrl) };
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('封面 JPG 编码失败'));
    }, 'image/jpeg', quality);
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('封面数据读取失败'));
    reader.onerror = () => reject(new Error('封面数据读取失败'));
    reader.readAsDataURL(blob);
  });
}

export async function exportCoverJpeg(workingCanvas: HTMLCanvasElement, format: CoverFormat): Promise<string> {
  const output = document.createElement('canvas');
  output.width = format.width;
  output.height = format.height;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('浏览器无法导出封面');
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = 'high';
  outputContext.drawImage(workingCanvas, 0, 0, output.width, output.height);

  for (const quality of [0.92, 0.86, 0.78, 0.68]) {
    const blob = await canvasToJpegBlob(output, quality);
    if (blob.size <= MAX_COVER_FILE_BYTES) {
      return blobToDataUrl(await enforceCoverJpegFileSize(blob));
    }
  }
  throw new Error('封面无法压缩到严格小于 5MB，请降低图片质量后重试');
}
