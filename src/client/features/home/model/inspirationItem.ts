import type { HomeSlice } from '@client/store/types';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { resolveVideoResolution } from '@shared/domain/media/video';
import type { HomeCanvasNode } from '@client/shared/home-publish/homePublish';

export interface InspirationItem {
  id: string | number;
  category: string;
  tag: string;
  title: string;
  prompt: string;
  /** Prompt with reference slots mapped to the attached image order. */
  referencePrompt?: string;
  image: string;
  thumbnail?: string;
  video?: string;
  poster?: string;
  mediaType?: 'image' | 'video';
  referenceImages?: string[];
  referenceLabels?: string[];
  videoRefMode?: string;
  videoDuration?: number;
  actualVideoDuration?: number;
  author?: {
    name: string;
    avatar?: string;
    badge?: string;
  };
  date?: string;
  aspectRatio?: string;
  model?: string;
  quality?: string;
}

export interface InspirationUseOptions {
  referenceImages?: string[];
  videoRefMode?: string;
  videoDuration?: number;
  videoModel?: string;
  videoAspectId?: string;
  videoResolution?: '480P' | '540P' | '720P' | '768P' | '1080P' | '2K' | '4K';
}

/** 首屏优先加载的灵感条目数量 */
// Keep the first viewport warm without decoding a dozen large assets at once.
export const INSPIRATION_EAGER_COUNT = 6;

/** 将 "3:4" 转为 CSS aspect-ratio 值 */
export function inspirationAspectRatio(item: Pick<InspirationItem, 'aspectRatio'>): string {
  const raw = item.aspectRatio?.trim();
  if (!raw) return '3 / 4';
  const parts = raw.split(':').map((p) => Number(p.trim()));
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n) && n > 0)) {
    return `${parts[0]} / ${parts[1]}`;
  }
  return '3 / 4';
}

export function inspirationVideoUseOptions(item: InspirationItem): InspirationUseOptions {
  return {
    referenceImages: item.referenceImages,
    videoRefMode: item.videoRefMode || 'omni',
    videoDuration: item.videoDuration,
    videoModel: item.model,
    videoAspectId: item.aspectRatio,
    videoResolution: resolveVideoResolution(item.quality),
  };
}

/** Apply one complete reference selection without retaining frames from a previous draft. */
export function inspirationComposerState(prompt: string, refMedia?: string, options?: InspirationUseOptions): Partial<HomeSlice> {
  const video = Boolean(options || (refMedia && isVideoMediaUrl(refMedia)));
  const references = options?.referenceImages?.length ? [...options.referenceImages] : refMedia ? [refMedia] : [];
  const mode = options?.videoRefMode || 'omni';
  const state: Partial<HomeSlice> = {
    quickPrompt: prompt,
    quickGenMode: video ? 'video' : 'image',
    quickRefImage: references[0] || null,
    quickRefImages: references,
    quickVideoFirstFrame: null,
    quickVideoLastFrame: null,
    quickVideoMultiFrames: [],
  };
  if (video) {
    state.quickVideoRefMode = mode;
    if (mode === 'first_last_frame') {
      state.quickVideoFirstFrame = references[0] || null;
      state.quickVideoLastFrame = references[1] || null;
      state.quickRefImage = null;
      state.quickRefImages = [];
    } else if (mode === 'multi_frame') {
      state.quickVideoMultiFrames = references;
      state.quickRefImage = null;
      state.quickRefImages = [];
    }
    if (options?.videoDuration) state.quickVideoDuration = options.videoDuration;
    if (options?.videoModel) state.quickVideoModel = options.videoModel;
    if (options?.videoAspectId) state.quickVideoAspectId = options.videoAspectId;
    if (options?.videoResolution) state.quickVideoResolution = options.videoResolution;
  }
  return state;
}

export const INSPIRATION_CATEGORIES = [
  { id: 'all', label: '精选', categories: [] },
  { id: 'video', label: '影视创作', categories: ['video'] },
  { id: 'animation', label: '插画·3D', categories: ['illustration', '3d'] },
  { id: 'ecommerce', label: '广告电商', categories: ['ecommerce'] },
  { id: 'design', label: '平面设计', categories: ['poster'] },
  { id: 'photo', label: '摄影写真', categories: ['photo'] },
  { id: 'social', label: '社交创作', categories: ['social'] },
  { id: 'workbook', label: '工作簿', categories: ['workbook'] },
] as const;
export type InspirationCategory = typeof INSPIRATION_CATEGORIES[number]['id'];
interface SearchableInspiration { title: string; prompt: string; category: string; tag: string; author?: { name: string } }
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();

export function matchesInspirationSearch(item: SearchableInspiration, category: InspirationCategory, query: string) {
  const selected = INSPIRATION_CATEGORIES.find(entry => entry.id === category)!;
  if (category !== 'all' && !(selected.categories as readonly string[]).includes(item.category)) return false;
  const categoryLabels = INSPIRATION_CATEGORIES.filter(entry => (entry.categories as readonly string[]).includes(item.category)).map(entry => entry.label);
  const haystack = normalize([item.title, item.prompt, item.tag, item.category, item.author?.name ?? '', ...categoryLabels].join(' '));
  return normalize(query).trim().split(/\s+/).filter(Boolean).every(term => haystack.includes(term));
}

/** Partition the feed into complete rows with a shared height and original media ratios. */
export function justifiedRows(ratios: number[], width: number, gap = 4): number[][] {
  if (!ratios.length || !Number.isFinite(width) || width <= 0) return [];
  const target = Math.min(300, Math.max(150, width / 4));
  const costs = Array(ratios.length + 1).fill(Infinity), next = Array(ratios.length).fill(0); costs[ratios.length] = 0;
  for (let start = ratios.length - 1; start >= 0; start--) {
    let sum = 0;
    for (let end = start; end < Math.min(ratios.length, start + 9); end++) {
      sum += ratios[end]; const height = (width - gap * (end - start)) / sum;
      if (height <= 0) break;
      const cost = (height - target) ** 2 + costs[end + 1];
      if (cost < costs[start]) { costs[start] = cost; next[start] = end + 1; }
    }
  }
  const rows: number[][] = [];
  for (let start = 0; start < ratios.length;) { const end = next[start] || start + 1; rows.push(Array.from({ length: end - start }, (_, i) => start + i)); start = end; }
  return rows;
}

/** Paginate complete rows from one layout, so loading more never regroups existing cards. */
export function visibleJustifiedRows(ratios: number[], width: number, visibleCount: number, gap = 4): number[][] {
  return justifiedRows(ratios, width, gap).filter(row => row[0] < visibleCount);
}

export function fitShowcaseCanvas(nodes: HomeCanvasNode[], width: number, height: number) {
  if (!nodes.length) return { zoom: 1, pan: { x: width / 2, y: height / 2 } };
  const minX = Math.min(...nodes.map(node => node.x));
  const minY = Math.min(...nodes.map(node => node.y));
  const spanX = Math.max(...nodes.map(node => node.x + node.width)) - minX;
  const spanY = Math.max(...nodes.map(node => node.y + node.height)) - minY;
  const zoom = Math.min(Math.max(1, width - 64) / spanX, Math.max(1, height - 64) / spanY, 1);
  return { zoom, pan: { x: (width - spanX * zoom) / 2 - minX * zoom, y: (height - spanY * zoom) / 2 - minY * zoom } };
}
