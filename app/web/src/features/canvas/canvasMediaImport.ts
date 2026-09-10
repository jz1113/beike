import { apiFetch } from '@/lib/apiClient';
import type { CanvasNode } from './types';
export async function persistCanvasMedia(file: File, viewCenterX: number, viewCenterY: number): Promise<Omit<CanvasNode, 'id' | 'createdAt'>> {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
  const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);
  if (!isVideo && !isAudio && !file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)) throw new Error('请选择图片、视频或音频文件');
  const form = new FormData();
  form.append('file', file);
  form.append('category', isVideo ? 'generated/videos' : 'assets');
  const res = await apiFetch('/api/assets/storage/upload', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok || !data.success || !data.url || /^(data:|blob:)/.test(data.url)) throw new Error(data.error || '媒体保存失败');
  return {
    missingMedia: false,
    type: isAudio ? 'audio' as const : isVideo ? 'video' as const : 'image' as const,
    title: file.name.replace(/\.[^/.]+$/, '') || '本地素材',
    ...(isAudio ? { audioUrl: data.url } : isVideo ? { videoUrl: data.url } : { imageUrl: data.url }),
    x: Math.round(viewCenterX - 150), y: Math.round(viewCenterY - 200),
    width: 300, height: isVideo ? 480 : 400,
  };
}
