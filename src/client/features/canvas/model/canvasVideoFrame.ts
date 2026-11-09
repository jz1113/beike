import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { CanvasTimelineClip } from './types';

const minimumTimelineClip = 1;

export function timelineRanges(clips: CanvasTimelineClip[]) {
  let position = 0;
  return clips.flatMap(clip => {
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) return [];
    const limit = (value: number | undefined, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(clip.duration, value)) : fallback;
    const start = limit(clip.trimStart, 0);
    const end = limit(clip.trimEnd, clip.duration);
    if (end <= start) return [];
    const offset = position;
    position += end - start;
    return [{ clip, start, end, offset, finish: position }];
  });
}

export function snapTimelineTime(time: number, points: number[], pixelsPerSecond: number, enabled: boolean) {
  if (!enabled) return time;
  let distance = 8 / pixelsPerSecond;
  let result = time;
  for (const point of points) {
    const delta = Math.abs(point - time);
    if (delta <= distance) { distance = delta; result = point; }
  }
  return result;
}

export function editTimelineClip(clips: CanvasTimelineClip[], time: number, operation: 'split' | 'in' | 'out', newId?: string) {
  const range = timelineRanges(clips).find(item => time > item.offset && time < item.finish);
  if (!range) return clips;
  const cut = Math.round((range.start + time - range.offset) * 1000) / 1000;
  const left = cut - range.start;
  const right = range.end - cut;
  if ((operation !== 'in' && left < minimumTimelineClip) || (operation !== 'out' && right < minimumTimelineClip)) return clips;
  return clips.flatMap(clip => {
    if (clip.id !== range.clip.id) return [clip];
    if (operation === 'in') return [{ ...clip, trimStart: cut }];
    if (operation === 'out') return [{ ...clip, trimEnd: cut }];
    return newId ? [{ ...clip, trimEnd: cut }, { ...clip, id: newId, trimStart: cut }] : [clip];
  });
}

/** 用离屏 video 与 canvas 提取指定时刻的帧，不经过后端。 */
export async function extractVideoFrame(
  rawVideoUrl: string,
  timeSeconds = 0.5,
  maxSize = Infinity,
): Promise<{ dataUrl: string; width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.src = proxyMediaUrl(rawVideoUrl, { asVideo: true });

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
      video.removeEventListener('loadeddata', onLoadedData);
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
      const targetTime = Math.max(0.001, Math.min(video.duration - 0.1, timeSeconds));
      if (video.currentTime === targetTime) {
        if(video.readyState>=2)onSeeked();
        return;
      }
      video.currentTime = targetTime;
    };

    const onSeeked = () => {
      if (captured) return;
      captured = true;

      try {
        const canvas = document.createElement('canvas');
        const originalWidth = video.videoWidth || 1280;
        const originalHeight = video.videoHeight || 720;
        const scale = Math.min(1, maxSize / Math.max(originalWidth, originalHeight));
        const width = Math.max(1, Math.round(originalWidth * scale));
        const height = Math.max(1, Math.round(originalHeight * scale));
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

    const onLoadedData=()=>{if(video.currentTime===0.001&&video.readyState>=2)onSeeked();};

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('error', onError);

    video.load();
  });
}
