import { resolveSkillKind as skillPresentation } from '@shared/domain/assistant/skills/types';
export { skillPresentation };
import type { SkillLibraryEntry, SkillRuntime } from '@shared/domain/skills/library';
import { skillEntryKey } from '@shared/domain/skills/library';
import { getMergedCategories } from '@shared/domain/prompts/vision';
import { BUILTIN_SKILL_PREVIEWS, SKILL_CATEGORIES, type SkillItem, type SkillMainTab, type SkillOutputGenre, type SkillPresentation } from './skillTypes';
import { skillDisplayDescription } from '@shared/domain/assistant/skills/skillDisplay';

/** Categories come from the current type/runtime, never from search or ownership filters. */
export function skillCategories(items: SkillItem[]): string[] {
  const available = new Set(items.map(item => item.category).filter(value => value && value !== '全部'));
  const ordered = SKILL_CATEGORIES.filter(value => available.delete(value));
  return ['全部', ...ordered, ...available];
}

export interface SkillFilters {
  presentation: SkillPresentation;
  runtime: SkillRuntime | 'all';
  scope: SkillMainTab;
  category: string;
  query: string;
}

export function filterSkills(items: SkillItem[], filters: SkillFilters, favorites: Set<string>): SkillItem[] {
  const terms = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (item.presentation !== filters.presentation || (filters.runtime !== 'all' && item.runtime !== filters.runtime)) return false;
    if (filters.scope === 'my' && (item.isOfficial || item.isBuiltin)) return false;
    if (filters.scope === 'favorite' && !favorites.has(item.id)) return false;
    if (filters.category !== '全部' && item.category !== filters.category && !item.tags?.includes(filters.category)) return false;
    const searchable = [item.title, item.description, item.category, item.author, item.models, ...(item.tags || []), ...(item.genres || [])].join(' ').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}

function workshopSamples(raw: string | string[] | null | undefined): string[] {
  try {
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())) : [];
  } catch { return []; }
}

export function librarySkillItem(entry: SkillLibraryEntry): SkillItem {
  const content = entry.content;
  if (entry.kind === 'workshop') {
    const skill = entry.content;
    const category = getMergedCategories().find(item => item.id === skill.category)?.name || skill.category;
    return {
      id: skillEntryKey(entry),
      title: skill.name,
      runtime: entry.kind,
      presentation: 'creation',
      description: skill.desc || '商品保真、参考样本换品与成图复核方法',
      models: '',
      category,
      genres: ['图片'],
      showcaseUrls: workshopSamples(skill.sampleImages),
      badge: skill.isOfficial ? '官方 · 电商图文' : '电商图文',
      isOfficial: skill.isOfficial,
      coverUrl: skill.coverUrl || undefined,
      prompt: skill.promptSnippet,
      isFavorite: skill.isFavorite,
      libraryVersion: skill.libraryVersion,
    };
  }
  const skill = entry.content;
  const category = skill.category || skill.meta?.tags?.[0] || '通用';
  return {
    id: skillEntryKey(entry),
    title: skill.displayName || skill.name,
    runtime: entry.kind,
    presentation: skillPresentation(skill),
    description: skillDisplayDescription(skill),
    models: [skill.meta?.defaultVideoModel, skill.meta?.defaultImageModel].filter(Boolean).join(' · '),
    category,
    badge: skill.source?.kind === 'local' ? '贝壳内置' : skill.source?.kind === 'platform' ? '平台来源原版' : skillPresentation(skill) === 'creation' ? 'AI生成' : skill.isBuiltin && skill.source?.kind==='official' ? '官方原版' : skill.isBuiltin && skill.source?.kind==='community' ? '社区原版' : 'Agent',
    showcaseUrls: skill.meta?.showcaseUrls,
    tags: skill.meta?.tags,
    author: skill.author,
    usageCount: skill.usageCount,
    favoriteCount: skill.favoriteCount,
    files: skill.files,
    promptGuide: skill.meta?.promptGuide,
    assetGuide: skill.meta?.assetGuide,
    defaultVideoModel: skill.meta?.defaultVideoModel,
    defaultImageModel: skill.meta?.defaultImageModel,
    isOfficial: Boolean(skill.isBuiltin && skill.source?.kind==='official'),
    isBuiltin: Boolean(skill.isBuiltin),
    source: skill.source,
    example: skill.isBuiltin ? BUILTIN_SKILL_PREVIEWS[skill.id]?.example : undefined,
    coverPosterUrl: skill.isBuiltin ? BUILTIN_SKILL_PREVIEWS[skill.id]?.poster : undefined,
    coverFit: skill.isBuiltin ? BUILTIN_SKILL_PREVIEWS[skill.id]?.fit : undefined,
    coverUrl: skill.meta?.coverUrl || (skill.isBuiltin ? BUILTIN_SKILL_PREVIEWS[skill.id]?.cover : undefined),
    prompt: skill.markdownDoc || skill.prompt,
    genres: (skill.meta?.genres || []).filter((genre): genre is SkillOutputGenre => ['图片', '视频', '音频', '文本'].includes(genre)),
    isFavorite: content.isFavorite === true,
    libraryVersion: skill.libraryVersion,
  };
}
