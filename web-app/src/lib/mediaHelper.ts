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

    // 5秒超时保底
    setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve('');
    }, 5000);
  });
}

/**
 * 读取文件为 Data URL
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
