import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';

const ITEMS_KEY = 'beike.homePublished';
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
    const parsed = new URL(url, 'http://local.invalid');
    const wrapped = parsed.searchParams.get('url');
    if (wrapped && parsed.pathname.includes('proxy-image')) return mediaIdentity(wrapped);
    for (const key of ['x-oss-process', 'thumb', 'width', 'height', 'w', 'exp', 'sig', 'as']) parsed.searchParams.delete(key);
    const path = `${parsed.pathname}${parsed.search}`;
    return parsed.origin === 'http://local.invalid' ? path : `${parsed.origin}${path}`;
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
    const raw = localStorage.getItem(ITEMS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isPublishedItem) : [];
  } catch {
    return [];
  }
}

function isPublishedItem(value: unknown): value is PublishedHomeItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as PublishedHomeItem;
  return typeof item.id === 'string' && typeof item.image === 'string' && (item.publishedKind === 'media' || item.publishedKind === 'canvas');
}

function writeItems(items: PublishedHomeItem[]) {
  try { localStorage.setItem(ITEMS_KEY, JSON.stringify(items.slice(0, 80))); } catch { /* ignore quota */ }
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

export function publishCanvasResult(input: { projectId: string; title: string; synopsis: string; nodes: HomeCanvasNode[]; coverUrl: string; video: boolean }) {
  const next: PublishedHomeItem = {
    id: `published-canvas-${input.projectId}`,
    category: input.video ? 'video' : 'photo',
    tag: '我的画布',
    title: input.title.trim() || '未命名画布',
    prompt: input.synopsis,
    synopsis: input.synopsis,
    image: input.coverUrl,
    video: input.video ? input.coverUrl : undefined,
    mediaType: input.video ? 'video' : 'image',
    publishedKind: 'canvas',
    canvasNodes: input.nodes,
  };
  const items = readPublishedHomeItems().filter(item => item.id !== next.id);
  writeItems([next, ...items]);
}
