import extraction from '@client/assets/skill-examples/prompt-extraction.jpg';
import storyboard from '@client/assets/skill-examples/cinematic-storyboard.mp4';
import storyboardReference from '@client/assets/skill-examples/cinematic-storyboard.jpg';
import threeView from '@client/assets/skill-examples/character-three-view.jpg';
import sales from '@client/assets/skill-examples/ugc-product-sales.mp4';
import salesPoster from '@client/assets/skill-examples/ugc-product-sales.jpg';
import productReference from '@client/assets/creative-tools/product-angles.jpg';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';

export interface SkillExampleInput {
  prompt: string;
  referenceImages: string[];
}

/** Bundled examples remain usable after local generation history or signed URLs expire. */
export const BUILTIN_SKILL_PREVIEWS: Record<string, {
  cover: string; poster?: string; fit?: 'contain'; example: SkillExampleInput;
}> = {
  'beike-prompt-extraction': {
    cover: extraction,
    example: { referenceImages: [productReference], prompt: '分析附图，提取主体外观、构图、光线、材质，分别列出可见事实与推测。请给一条横向16:9的完整图片提示词，保留耳机蓝白配色。' },
  },
  'beike-cinematic-storyboard': {
    cover: storyboard, poster: storyboardReference,
    example: { referenceImages: [storyboardReference], prompt: '参考图中的人物与雨后车站，一位成年摄影师拾起旧照片，抬头看向空站台。10秒、16:9，只需一个连续镜头。先给分镜表，再给一条可独立生成的完整视频提示词。' },
  },
  'beike-character-three-view': {
    cover: threeView, fit: 'contain',
    example: { referenceImages: [threeView], prompt: '保留参考图中的同一成年男性：黑色短发、白色圆领T恤、深蓝直筒牛仔裤、白色运动鞋。制作写实风格、白色背景、横向3:2的正面、左侧面、背面全身三视图，头顶和脚部完整。给一条可直接生成的完整图片提示词。' },
  },
  'beike-ugc-product-sales': {
    cover: sales, poster: salesPoster,
    example: { referenceImages: [productReference], prompt: '商品为附图的米白与深蓝色头戴式耳机，仅展示外观和佩戴动作，不编造性能参数。面向成年年轻通勤人群，10秒9:16。先给简短口播及镜头安排，再给一条完整视频提示词。' },
  },
};

export type SkillPresentation = 'agent' | 'creation';

export type SkillMainTab = 'all' | 'my' | 'favorite';

export const SKILL_GENRES = ['视频', '图片', '音频', '文本'] as const;
export type SkillOutputGenre = typeof SKILL_GENRES[number];

export const SKILL_CATEGORIES = [
  '全部',
  '专业影视',
  '营销广告',
  '短剧漫剧',
  '独家画风',
  '独家超创',
  'Skill大赛',
  '创意发散',
  '特效玩法',
  '社媒热点',
  '音乐MV',
  '一镜到底',
  '爆款复刻',
] as const;

export const SKILL_TAG_OPTIONS: readonly string[] = SKILL_CATEGORIES.filter((category) => category !== '全部');

export type SkillCategory = typeof SKILL_CATEGORIES[number];

export interface SkillItem {
  id: string;
  runtime?: 'assistant' | 'workshop';
  presentation?: SkillPresentation;
  libraryVersion?: string;
  isOfficial?: boolean;
  isBuiltin?: boolean;
  source?: AssistantSkill['source'];
  title: string;
  description: string;
  models: string;
  category: SkillCategory | string;
  badge?: string;
  coverUrl?: string;
  coverPosterUrl?: string;
  example?: SkillExampleInput;
  coverFit?: 'cover' | 'contain';
  showcaseUrls?: string[];
  tags?: string[];
  genres?: SkillOutputGenre[];
  prompt?: string;
  author?: string;
  usageCount?: number;
  favoriteCount?: number;
  files?: Array<{ path: string; content: string }>;
  isFavorite?: boolean;
  defaultVideoModel?: string;
  defaultImageModel?: string;
  promptGuide?: string;
  assetGuide?: string;
  isPublic?: boolean;
  createdAt?: number;
}

export interface SkillDraftData {
  kind?: SkillPresentation;
  title: string;
  description: string;
  genres: SkillOutputGenre[];
  tags: string[];
  defaultVideoModel: string;
  defaultImageModel: string;
  coverUrl: string;
  showcaseUrls: string[];
  promptGuide: string;
  assetGuide: string;
  isPublic: boolean;
}

export const SKILLS_FAVORITES_STORAGE_KEY = 'beike.skills.favorites';

export function loadSkillFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(SKILLS_FAVORITES_STORAGE_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function saveSkillFavorites(favorites: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SKILLS_FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favorites)));
  } catch {
    /* 忽略存储异常 */
  }
}
