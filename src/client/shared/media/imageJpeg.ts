async function isJpeg(blob: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function decodeImage(blob: Blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
  }
  const image = new Image();
  const url = URL.createObjectURL(blob);
  const dispose = () => { image.src = ''; URL.revokeObjectURL(url); };
  try {
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Preserve JPEG bytes; flatten other image formats onto white at their original dimensions. */
export async function convertImageToJpeg(blob: Blob, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  const jpeg = await isJpeg(blob);
  signal?.throwIfAborted();
  if (jpeg) return blob.type === 'image/jpeg' ? blob : blob.slice(0, blob.size, 'image/jpeg');

  const image = await decodeImage(blob);
  let canvas: HTMLCanvasElement | undefined;
  try {
    signal?.throwIfAborted();
    if (!image.width || !image.height) throw new Error('图片尺寸无效');
    canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建图片处理画布');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(image.source, 0, 0);
    const result = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(
      output => output ? resolve(output) : reject(new Error('图片转换 JPG 失败，请重试')),
      'image/jpeg', 0.96,
    ));
    signal?.throwIfAborted();
    if (result.type !== 'image/jpeg' || !await isJpeg(result)) throw new Error('图片转换未返回有效的 JPG 文件');
    signal?.throwIfAborted();
    return result;
  } finally {
    image.dispose();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
