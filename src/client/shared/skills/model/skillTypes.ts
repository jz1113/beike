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
] as const;

export const SKILL_TAG_OPTIONS = SKILL_CATEGORIES.filter((c) => c !== '全部');

export type SkillCategory = typeof SKILL_CATEGORIES[number];

export interface SkillItem {
  id: string;
  title: string;
  description: string;
  models: string;
  category: SkillCategory | string;
  badge?: string;
  coverUrl?: string;
  showcaseUrls?: string[];
  tags?: string[];
  genres?: SkillOutputGenre[];
  prompt?: string;
  author?: string;
  isFavorite?: boolean;
  defaultVideoModel?: string;
  defaultImageModel?: string;
  promptGuide?: string;
  assetGuide?: string;
  isPublic?: boolean;
  createdAt?: number;
}

export interface SkillDraftData {
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
