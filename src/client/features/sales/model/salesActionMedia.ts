import type { SalesActionCandidate } from '@shared/domain/sales';
import { DEPTH_IMAGE_LIMITS, DEPTH_VIDEO_LIMITS } from '@shared/domain/media/depthVideo';

export const ACTION_MEDIA_LABELS = { image: '图片', video: '视频', 'depth-image': '深度图片', 'depth-video': '深度视频' } as const;
export const DEPTH_ACTION_LABELS = { 'depth-image': '深度图片', 'depth-video': '深度视频' } as const;
export type ActionMediaType = keyof typeof ACTION_MEDIA_LABELS;
export type DepthActionKind = keyof typeof DEPTH_ACTION_LABELS;
export const SEEDANCE_VIDEO_DURATION_LIMITS = { minSec: 2, maxSec: 30 } as const;

export const isActionVideo = (type: ActionMediaType) => type === 'video' || type === 'depth-video';
export function actionMedia(asset: SalesActionCandidate) {
  const type = asset.mediaType || 'image';
  return { type, url: asset.mediaUrl || asset.coverUrl, video: isActionVideo(type) };
}
export function depthFileError(file: File, video: boolean): string {
  if (video ? !/\.(mp4|webm|mov|m4v)$/i.test(file.name) : !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) return video ? '请选择 MP4、WebM、MOV 或 M4V 视频' : '请选择 JPG、PNG、WebP 或 GIF 图片';
  if (!file.size) return '文件为空，请重新选择';
  if (file.size > (video ? DEPTH_VIDEO_LIMITS.maxDataUrlBytes : DEPTH_IMAGE_LIMITS.maxBytes)) return video ? '视频请控制在 35MB 以内' : '图片请控制在 20MB 以内';
  return '';
}
export function seedanceVideoDurationError(durationSec?: number): string {
  if (durationSec === undefined || !Number.isFinite(durationSec) || durationSec <= 0) return '';
  if (durationSec < SEEDANCE_VIDEO_DURATION_LIMITS.minSec - 0.05 || durationSec > SEEDANCE_VIDEO_DURATION_LIMITS.maxSec + 0.4) {
    return `待校验视频要求时长 2 ~ 30 秒（当前 ${durationSec.toFixed(1)} 秒）`;
  }
  return '';
}
