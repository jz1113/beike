import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { extractImageDimensionsFromFile, extractVideoMetadataFromFile } from '@client/shared/media/mediaHelper';
import type { CanvasNode } from './types';

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

function cardSize(isVideo: boolean, width: number, height: number) {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  if (isVideo) {
    const cardWidth = ratio >= 1 ? 360 : 280;
    return { width: cardWidth, height: Math.round(cardWidth / ratio) };
  }
  return { width: 300, height: Math.round(300 / ratio) };
}

export async function persistCanvasMedia(file: File, viewCenterX: number, viewCenterY: number): Promise<Omit<CanvasNode, 'id' | 'createdAt'>> {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
  const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);
  if (!isVideo && !isAudio && !file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)) throw new Error('请选择图片、视频或音频文件');
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new Error('单个视频素材请控制在 500 MB 以内，超大素材请先裁切或压缩');
  }

  let resultWidth: number | undefined;
  let resultHeight: number | undefined;
  let thumbnailUrl: string | undefined;
  if (isVideo) {
    const meta = await extractVideoMetadataFromFile(file);
    resultWidth = meta.width;
    resultHeight = meta.height;
    thumbnailUrl = meta.thumbnailUrl;
  } else if (!isAudio) {
    const meta = await extractImageDimensionsFromFile(file);
    resultWidth = meta.width;
    resultHeight = meta.height;
  }

  const form = new FormData();
  form.append('file', file);
  form.append('category', isVideo ? 'generated/videos' : 'assets');
  form.append('customConfig', JSON.stringify(readClientStorageConfig()));
  const res = await apiFetch('/api/assets/storage/upload', { method: 'POST', headers: storageConfigHeaders(), body: form });
  const data = await res.json();
  if (!res.ok || !data.success || !data.url || /^(data:|blob:)/.test(data.url)) throw new Error(data.error || '媒体保存失败');
  const display = resultWidth && resultHeight
    ? cardSize(isVideo, resultWidth, resultHeight)
    : { width: 300, height: isVideo ? 480 : 400 };
  return {
    missingMedia: false,
    type: isAudio ? 'audio' as const : isVideo ? 'video' as const : 'image' as const,
    title: file.name.replace(/\.[^/.]+$/, '') || '本地素材',
    ...(isAudio ? { audioUrl: data.url } : isVideo ? { videoUrl: data.url, imageUrl: thumbnailUrl } : { imageUrl: data.url }),
    x: Math.round(viewCenterX - display.width / 2),
    y: Math.round(viewCenterY - display.height / 2),
    width: display.width,
    height: display.height,
    resultWidth,
    resultHeight,
  };
}
