import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import type { CoverFormat } from './coverFormat';
import { enforceCoverJpegFileSize, MAX_COVER_FILE_BYTES } from './posterDraft';

export async function loadImageForCanvas(url: string): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  const blob = await fetchMediaBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => next.naturalWidth > 0 && next.naturalHeight > 0
        ? resolve(next) : reject(new Error('封面底图尺寸无效'));
      next.onerror = () => reject(new Error('封面底图无法加载'));
      next.src = objectUrl;
    });
    return { image, revoke: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('封面 JPG 编码失败'));
    }, 'image/jpeg', quality);
  });
}

export async function rasterizeCoverImage(image: HTMLImageElement, format: CoverFormat): Promise<Blob> {
  const expectedRatio = format.width / format.height;
  if (!image.naturalWidth || !image.naturalHeight || Math.abs(image.naturalWidth / image.naturalHeight - expectedRatio) > 0.02) {
    throw new Error('生图结果不是 ' + format.aspectRatio + '，已停止导出以避免拉伸或裁掉标题');
  }
  const canvas = document.createElement('canvas');
  try {
    canvas.width = format.width;
    canvas.height = format.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法导出封面');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await exportCoverJpeg(canvas, format);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function exportCoverJpeg(workingCanvas: HTMLCanvasElement, format: CoverFormat): Promise<Blob> {
  if (workingCanvas.width < 1 || workingCanvas.height < 1) throw new Error('封面画布尺寸无效');
  const output = document.createElement('canvas');
  output.width = format.width;
  output.height = format.height;
  try {
    const outputContext = output.getContext('2d');
    if (!outputContext) throw new Error('浏览器无法导出封面');
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.fillStyle = '#ffffff';
    outputContext.fillRect(0, 0, output.width, output.height);
    outputContext.drawImage(workingCanvas, 0, 0, output.width, output.height);

    for (const quality of [0.98, 0.92, 0.86, 0.78, 0.68]) {
      const blob = await canvasToJpegBlob(output, quality);
      if (blob.size <= MAX_COVER_FILE_BYTES) return await enforceCoverJpegFileSize(blob);
    }
    throw new Error('封面无法压缩到严格小于 5MB，请降低图片质量后重试');
  } finally {
    output.width = 0;
    output.height = 0;
  }
}
