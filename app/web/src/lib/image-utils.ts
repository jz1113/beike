/**
 * Utility functions for client-side image processing and compression
 */

/**
 * Compresses an image file or Base64 string to a lightweight Data URL (JPEG, ~100-200KB)
 * to avoid browser localStorage QuotaExceededError and ensure fast network transmission.
 */
export async function compressImageToDataUrl(
  fileOrDataUrl: File | string,
  maxDimension = 1024,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    const processImg = (src: string) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // 填充纯白背景，防止透明 PNG/WebP 转为 JPEG 时出现黑色背景或异常 Alpha 模式
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };

    if (typeof fileOrDataUrl === 'string') {
      processImg(fileOrDataUrl);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          processImg(result);
        } else {
          resolve('');
        }
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

/** Strict submission encoder: meet a byte budget or report failure; never silently send the oversized original. */
export async function compressImageForSubmission(
  input: File | string,
  maxDataUrlChars: number,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  if (typeof input === 'string' && /^data:image\//i.test(input) && input.length <= maxDataUrlChars) return input;
  if (maxDataUrlChars < 2048) throw new Error('参考图数量过多，无法保留可用的图片清晰度');
  return new Promise((resolve, reject) => {
    const image = new Image();
    const ownedUrl = typeof input === 'string' ? undefined : URL.createObjectURL(input);
    let settled = false;
    const finish = (value?: string, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
      image.src = '';
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () => finish(undefined, signal?.reason || new Error('已取消图片处理'));
    const timer = setTimeout(() => finish(undefined, new Error('图片读取超时')), 20_000);
    signal?.addEventListener('abort', abort, { once: true });
    image.onload = () => {
      const canvas = document.createElement('canvas');
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) throw new Error('图片尺寸无效');
        for (const dimension of [1600, 1280, 1024, 800, 640, 480, 320, 256]) {
          signal?.throwIfAborted();
          const scale = Math.min(1, dimension / Math.max(width, height));
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('无法创建图片压缩画布');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          for (const quality of [0.86, 0.74, 0.60, 0.45]) {
            const result = canvas.toDataURL('image/jpeg', quality);
            if (result.startsWith('data:image/jpeg;base64,') && result.length <= maxDataUrlChars) {
              finish(result);
              return;
            }
          }
        }
        throw new Error('图片无法压缩至可提交大小');
      } catch (error) {
        finish(undefined, error);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
    image.onerror = () => finish(undefined, new Error('图片已失效或无法解码'));
    image.src = ownedUrl || input as string;
  });
}
