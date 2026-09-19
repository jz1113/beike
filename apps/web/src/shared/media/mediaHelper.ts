/**
 * 视频与图片多模态处理辅助工具
 */

import { compressImageToDataUrl } from '@/shared/media/image-utils';
import { resolveRefMediaKind } from './refMediaRegistry';

export interface ExtractedMedia {
  type: 'image' | 'video';
  url: string; // Base64 data URL
  thumbnailUrl?: string;
  name: string;
  size: number;
}

const BLANK_FRAME_LUMINANCE_THRESHOLD = 12;

function isFrameMostlyBlank(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return true;
    const sampleW = Math.min(32, canvas.width);
    const sampleH = Math.min(32, canvas.height);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    let sum = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    return sum / pixels < BLANK_FRAME_LUMINANCE_THRESHOLD;
  } catch {
    return true;
  }
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const rvfc = (video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    }).requestVideoFrameCallback;
    if (typeof rvfc === 'function') {
      rvfc.call(video, () => resolve());
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function captureVideoFrame(video: HTMLVideoElement): string {
  try {
    if (!video.videoWidth || !video.videoHeight) return '';
    const w = Math.min(800, video.videoWidth);
    const h = Math.round((w / video.videoWidth) * video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(video, 0, 0, w, h);
    if (isFrameMostlyBlank(canvas)) return '';
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return '';
  }
}

function buildSeekTimes(duration: number): number[] {
  const fixed = [0.001, 0.05, 0.15, 0.5, 1.0];
  if (!Number.isFinite(duration) || duration <= 0) return fixed;
  const relative = [duration * 0.1, duration * 0.25, duration * 0.5];
  const max = Math.max(0, duration - 0.05);
  const merged = [...fixed, ...relative]
    .map((t) => Math.max(0, Math.min(t, max)))
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .sort((a, b) => a - b);
  return merged;
}

async function seekAndCapture(video: HTMLVideoElement, time: number): Promise<string> {
  await seekVideo(video, time);
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise<void>((resolve) => {
      const onData = () => {
        video.removeEventListener('loadeddata', onData);
        video.removeEventListener('canplay', onData);
        resolve();
      };
      video.addEventListener('loadeddata', onData);
      video.addEventListener('canplay', onData);
      setTimeout(resolve, 80);
    });
  }
  await waitForVideoFrame(video);
  return captureVideoFrame(video);
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    try {
      const max = Math.max(0, (video.duration || 0) - 0.05);
      video.currentTime = Math.max(0, Math.min(time, max));
    } catch {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    }
  });
}

async function extractThumbnailFromVideoElement(
  video: HTMLVideoElement,
  onDone: () => void,
): Promise<string> {
  try {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const times = buildSeekTimes(duration);
    for (const t of times) {
      const frame = await seekAndCapture(video, t);
      if (frame) return frame;
    }
    return '';
  } finally {
    onDone();
  }
}

/**
 * 从视频文件中提取首帧/关键帧缩略图
 */
export async function extractVideoThumbnail(file: File): Promise<string> {
  return extractVideoThumbnailFromFile(file);
}

/** 从本地 File 提取视频缩略图（供预览组件复用） */
export async function extractVideoThumbnailFromFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const cleanup = () => {
      URL.revokeObjectURL(url);
      try {
        video.removeAttribute('src');
        video.load();
      } catch { /* ignore */ }
    };

    const timer = setTimeout(() => {
      cleanup();
      finish('');
    }, 15000);

    video.onerror = () => {
      cleanup();
      finish('');
    };

    video.onloadedmetadata = async () => {
      const frame = await extractThumbnailFromVideoElement(video, cleanup);
      finish(frame);
    };

    video.src = url;
    try {
      video.load();
    } catch {
      cleanup();
      finish('');
    }
  });
}

/** 判断 URL / dataURL / blob 是否为视频参考素材 */
export function isVideoMediaUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:video/')) return true;
  if (url.startsWith('blob:')) {
    return resolveRefMediaKind(url) === 'video';
  }
  if (resolveRefMediaKind(url) === 'video') return true;
  return /\.(mp4|webm|mov|m4v|avi)(\?|#|$)/i.test(url)
    || /\/video\//i.test(url)
    || /snssdk\.com|bytecdn\.cn|kwaicdn|kwimgs|v\.kuaishou|yximgs/i.test(url);
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

    video.onerror = () => finish([]);

    video.onloadedmetadata = async () => {
      try {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        const frames: string[] = [];
        if (duration <= 0) {
          const one = await seekAndCapture(video, 0.1);
          if (one) frames.push(one);
          finish(frames);
          return;
        }

        for (let i = 0; i < targetCount; i++) {
          const t = ((i + 0.5) / targetCount) * duration;
          const frame = await seekAndCapture(video, t);
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
 * 读取文件为 Data URL（图片自动进行高性能轻量压缩）
 */
export async function fileToDataUrl(file: File): Promise<string> {
  if (file.type.startsWith('image/')) {
    if (file.type === 'image/gif') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    return compressImageToDataUrl(file, 1600, 0.85);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function extractVideoMetadataFromFile(file: File): Promise<{
  thumbnailUrl: string;
  width: number;
  height: number;
  duration: number;
}> {
  const thumbnailUrl = await extractVideoThumbnailFromFile(file);
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      try { video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
    };
    video.onloadedmetadata = () => {
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      cleanup();
      resolve({ thumbnailUrl, width, height, duration });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('无法读取视频元数据'));
    };
    video.src = url;
  });
}

export async function extractImageDimensionsFromFile(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || 0;
      const height = image.naturalHeight || 0;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片尺寸'));
    };
    image.src = url;
  });
}
