import { resolveSkillKind as skillPresentation } from '@shared/domain/assistant/skills/skillPurpose';
export { skillPresentation };
import type { SkillLibraryEntry } from '@shared/domain/skills/library';
import { skillEntryKey } from '@shared/domain/skills/library';
import { getMergedCategories } from '@shared/domain/prompts/vision';
import type { SkillItem, SkillOutputGenre } from './skillTypes';

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
    description: skill.description,
    models: [skill.meta?.defaultVideoModel, skill.meta?.defaultImageModel].filter(Boolean).join(' · '),
    category,
    badge: skillPresentation(skill) === 'creation' ? 'AI生成' : skill.isBuiltin ? '官方 · Agent' : 'Agent',
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
    isOfficial: Boolean(skill.isBuiltin),
    coverUrl: skill.meta?.coverUrl,
    prompt: skill.markdownDoc || skill.prompt,
    genres: (skill.meta?.genres || []).filter((genre): genre is SkillOutputGenre => ['图片', '视频', '音频', '文本'].includes(genre)),
    isFavorite: content.isFavorite === true,
    libraryVersion: skill.libraryVersion,
  };
}
