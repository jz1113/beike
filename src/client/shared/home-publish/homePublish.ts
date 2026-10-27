import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';

export const HOME_PUBLISHED_STORAGE_KEY = 'beike.homePublished';
export const HOME_PUBLISHED_EVENT = 'beike:home-published';

export interface HomeCanvasNode {
  id: string;
  type: string;
  title?: string;
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  referenceNodeIds?: string[];
}

export interface PublishedHomeItem {
  id: string;
  category: string;
  tag: string;
  title: string;
  prompt: string;
  image: string;
  video?: string;
  poster?: string;
  mediaType?: 'image' | 'video';
  publishedKind: 'media' | 'canvas';
  synopsis?: string;
  canvasNodes?: HomeCanvasNode[];
}

function mediaIdentity(url: string): string {
  try {
    const origin = typeof window === 'undefined' ? 'http://local.invalid' : window.location.origin;
    const parsed = new URL(url, origin);
    const wrapped = parsed.searchParams.get('url');
    if (wrapped && parsed.pathname.includes('proxy-image')) return mediaIdentity(wrapped);
    for (const key of ['x-oss-process', 'thumb', 'width', 'height', 'w', 'exp', 'sig', 'as']) parsed.searchParams.delete(key);
    const path = `${parsed.pathname}${parsed.search}`;
    return parsed.origin === origin ? path : `${parsed.origin}${path}`;
  } catch {
    return url;
  }
}

export function isMediaPublishedOnHome(url: string) {
  const key = mediaIdentity(url);
  return readPublishedHomeItems().some(item => mediaIdentity(item.image) === key || (item.video ? mediaIdentity(item.video) === key : false));
}

export function unpublishMediaFromHome(url: string) {
  const key = mediaIdentity(url);
  writeItems(readPublishedHomeItems().filter(item => mediaIdentity(item.image) !== key && (!item.video || mediaIdentity(item.video) !== key)));
}

export function readPublishedHomeItems(): PublishedHomeItem[] {
  try {
    const raw = localStorage.getItem(HOME_PUBLISHED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap(value => {
      const item = normalizePublishedItem(value);
      if (!item || seen.has(item.id)) return [];
      seen.add(item.id);
      return [item];
    });
  } catch {
    return [];
  }
}

function normalizePublishedItem(value: unknown): PublishedHomeItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id.trim() || typeof item.image !== 'string' || !item.image.trim()
    || (item.publishedKind !== 'media' && item.publishedKind !== 'canvas')) return null;
  const video = typeof item.video === 'string' ? item.video : undefined;
  const mediaType = item.mediaType === 'video' || video || isVideoMediaUrl(item.image) ? 'video' : 'image';
  return {
    id: item.id, image: item.image, publishedKind: item.publishedKind, mediaType, video,
    title: typeof item.title === 'string' && item.title.trim() ? item.title : mediaType === 'video' ? '生成视频' : '生成图片',
    prompt: typeof item.prompt === 'string' ? item.prompt : '',
    category: typeof item.category === 'string' ? item.category : mediaType === 'video' ? 'video' : 'photo',
    tag: typeof item.tag === 'string' ? item.tag : '我的生成',
    poster: typeof item.poster === 'string' ? item.poster : undefined,
    synopsis: typeof item.synopsis === 'string' ? item.synopsis : undefined,
    canvasNodes: Array.isArray(item.canvasNodes) ? item.canvasNodes.filter(isCanvasNode) : undefined,
  };
}

function isCanvasNode(value: unknown): value is HomeCanvasNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as HomeCanvasNode;
  return typeof node.id === 'string' && typeof node.type === 'string'
    && [node.x, node.y, node.width, node.height].every(Number.isFinite) && node.width > 0 && node.height > 0
    && [node.title, node.content, node.imageUrl, node.videoUrl].every(field => field === undefined || typeof field === 'string')
    && (node.referenceNodeIds === undefined || (Array.isArray(node.referenceNodeIds) && node.referenceNodeIds.every(id => typeof id === 'string')));
}

function writeItems(items: PublishedHomeItem[]) {
  try {
    localStorage.setItem(HOME_PUBLISHED_STORAGE_KEY, JSON.stringify(items.slice(0, 80)));
  } catch {
    throw new Error('首页展示保存失败，请检查浏览器存储空间或权限');
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(HOME_PUBLISHED_EVENT));
}

export function publishMediaResult(input: { id: string; prompt: string; url: string; mediaType?: string | null; title?: string }) {
  const video = input.mediaType === 'video' || input.mediaType === 'depth-video' || isVideoMediaUrl(input.url);
  const title = input.title?.trim().slice(0, 28) || input.prompt.trim().slice(0, 28) || (video ? '生成视频' : '生成图片');
  const next: PublishedHomeItem = {
    id: `published-${input.id}`,
    category: video ? 'video' : 'photo',
    tag: '我的生成',
    title,
    prompt: input.prompt,
    image: input.url,
    video: video ? input.url : undefined,
    mediaType: video ? 'video' : 'image',
    publishedKind: 'media',
  };
  const items = readPublishedHomeItems().filter(item => item.id !== next.id);
  writeItems([next, ...items]);
}
