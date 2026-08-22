/**
 * 视频与图片多模态处理辅助工具
 */

export interface ExtractedMedia {
  type: 'image' | 'video';
  url: string; // Base64 data URL
  thumbnailUrl?: string;
  name: string;
  size: number;
}

/**
 * 从视频文件中提取首帧/关键帧缩略图
 */
export async function extractVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadeddata = () => {
      // 截取视频 0.5 秒处或开头
      video.currentTime = Math.min(0.5, video.duration / 2 || 0);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(800, video.videoWidth || 640);
        canvas.height = Math.round((canvas.width / (video.videoWidth || 640)) * (video.videoHeight || 480));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          URL.revokeObjectURL(url);
          resolve(dataUrl);
        } else {
          URL.revokeObjectURL(url);
          resolve('');
        }
      } catch (err) {
        URL.revokeObjectURL(url);
        resolve('');
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('');
    };

    // 12秒超时保底
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve('');
    }, 12000);

    const originalResolve = resolve;
    resolve = (val: string | PromiseLike<string>) => {
      clearTimeout(timer);
      originalResolve(val);
    };
  });
}

/** 判断 URL / dataURL 是否为视频参考素材 */
export function isVideoMediaUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:video/')) return true;
  return /\.(mp4|webm|mov|m4v|avi)(\?|#|$)/i.test(url)
    || /\/video\//i.test(url)
    || /snssdk\.com|bytecdn\.cn|v\.kuaishou/i.test(url);
}

/**
 * 从远程 / 同源代理 / blob / data:video URL 均匀抽取多帧 JPEG（用于视觉模型分析视频）
 */
export async function extractVideoFramesFromSrc(src: string, count = 6): Promise<string[]> {
  if (!src || typeof src !== 'string') return [];
  const targetCount = Math.max(1, Math.min(12, Math.floor(count) || 6));

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    if (/^https?:\/\//i.test(src) || src.startsWith('/')) {
      video.crossOrigin = 'anonymous';
    }

    let settled = false;
    const finish = (frames: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        video.removeAttribute('src');
        video.load();
      } catch { /* ignore */ }
      resolve(frames);
    };

    const timer = setTimeout(() => finish([]), 20000);

    const captureFrame = (): string => {
      try {
        const w = Math.min(768, video.videoWidth || 640);
        const h = Math.round((w / (video.videoWidth || 640)) * (video.videoHeight || 480));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx || !video.videoWidth) return '';
        ctx.drawImage(video, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.82);
      } catch {
        return '';
      }
    };

    const seekTo = (t: number) =>
      new Promise<void>((res) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          res();
        };
        video.addEventListener('seeked', onSeeked);
        try {
          video.currentTime = Math.max(0, Math.min(t, Math.max(0, (video.duration || 0) - 0.05)));
        } catch {
          video.removeEventListener('seeked', onSeeked);
          res();
        }
      });

    video.onerror = () => finish([]);

    video.onloadedmetadata = async () => {
      try {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        const frames: string[] = [];
        if (duration <= 0) {
          await seekTo(0.1);
          const one = captureFrame();
          if (one) frames.push(one);
          finish(frames);
          return;
        }

        for (let i = 0; i < targetCount; i++) {
          const t = ((i + 0.5) / targetCount) * duration;
          await seekTo(t);
          const frame = captureFrame();
          if (frame) frames.push(frame);
        }
        finish(frames);
      } catch {
        finish([]);
      }
    };

    video.src = src;
    try {
      video.load();
    } catch {
      finish([]);
    }
  });
}

/**
 * 智能压缩图片为轻量标准的 JPEG Data URL（默认最长边 1600px，画质 0.85）
 * 将 10MB-20MB 的未压缩图片大幅缩减至 150KB-300KB，避免网络拥塞及超大 JSON 载荷
 */
export async function compressImageFileToDataUrl(file: File, maxDim = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    // 纯动图 (GIF) 不做静态 canvas 压缩，直接读取
    if (file.type === 'image/gif') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          URL.revokeObjectURL(objectUrl);
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
          return;
        }

        // 缩放计算
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
          return;
        }

        // 绘制白色底色（防止透明 PNG 变黑）
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    };
  });
}

/**
 * 读取文件为 Data URL（图片自动进行高性能轻量压缩）
 */
export async function fileToDataUrl(file: File): Promise<string> {
  if (file.type.startsWith('image/')) {
    return compressImageFileToDataUrl(file);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

