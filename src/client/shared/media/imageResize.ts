import { assertOutputDimensions } from '@shared/domain/media/outputDimensions';

/** Center-crop to the requested aspect, then resize without stretching the subject. */
export async function resizeImageBlob(blob: Blob, targetWidth: number, targetHeight: number): Promise<Blob> {
  assertOutputDimensions(targetWidth, targetHeight);
  const image = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    if (!image.width || !image.height) throw new Error('图片尺寸无效');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建图片处理画布');
    const targetRatio = targetWidth / targetHeight;
    const cropWidth = Math.min(image.width, image.height * targetRatio);
    const cropHeight = Math.min(image.height, image.width / targetRatio);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, (image.width - cropWidth) / 2, (image.height - cropHeight) / 2,
      cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      result => result ? resolve(result) : reject(new Error('图片尺寸处理失败')),
      'image/jpeg', 0.96,
    ));
  } finally {
    image.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
