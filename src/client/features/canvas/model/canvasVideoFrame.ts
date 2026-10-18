import { proxyMediaUrl } from '@client/shared/api/apiClient';

/**
 * 客户端视频抽帧器：使用离屏 video 与 canvas 快速提取指定时刻的帧画面
 * 借鉴 tvmao-drama 客户端原生抽帧方案，零后端依赖，秒级生成高质量图片。
 */
export async function extractVideoFrame(
  rawVideoUrl: string,
  timeSeconds = 0.5,
): Promise<{ dataUrl: string; width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.src = proxyMediaUrl(rawVideoUrl);

    let captured = false;

    const timeout = setTimeout(() => {
      if (!captured) {
        cleanup();
        reject(new Error('视频加载超时，无法抽帧'));
      }
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      video.pause();
      video.src = '';
      video.load();
    };

    const onError = () => {
      cleanup();
      reject(new Error('视频解码或加载失败'));
    };

    const onLoadedMetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        onSeeked();
        return;
      }
      const targetTime = Math.max(0, Math.min(video.duration - 0.1, timeSeconds));
      if (Math.abs(video.currentTime - targetTime) < 0.01) {
        onSeeked();
        return;
      }
      video.currentTime = targetTime;
    };

    const onSeeked = () => {
      if (captured) return;
      captured = true;

      try {
        const canvas = document.createElement('canvas');
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('无法创建画布上下文'));
          return;
        }

        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const duration = video.duration || 5;

        cleanup();
        resolve({ dataUrl, width, height, duration });
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error('绘制视频帧失败'));
      }
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);

    video.load();
  });
}
