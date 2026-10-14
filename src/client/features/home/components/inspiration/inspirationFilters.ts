import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';

export type InspirationMediaFilter = 'image' | 'video';

export const INSPIRATION_MEDIA_FILTERS: { id: InspirationMediaFilter; label: string }[] = [
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
];

export function isInspirationVideo(item: { mediaType?: 'image' | 'video'; video?: string; image: string }) {
  return item.mediaType === 'video' || !!item.video || isVideoMediaUrl(item.image);
}
