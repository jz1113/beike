import type { SkillLibraryEntry } from '@shared/domain/skills/library';
import { skillEntryKey } from '@shared/domain/skills/library';
import { getMergedCategories } from '@shared/domain/prompts/vision';
import type { SkillItem, SkillOutputGenre } from './skillTypes';

export function librarySkillItem(entry: SkillLibraryEntry): SkillItem {
  const content = entry.content;
  if (entry.kind === 'workshop') {
    const skill = entry.content;
    const category = getMergedCategories().find(item => item.id === skill.category)?.name || skill.category;
    return { id: skillEntryKey(entry), title: skill.name, runtime: entry.kind,
      description: skill.desc || '商品保真、参考样本换品与成图复核方法',
      models: '', category, badge: skill.isOfficial ? '官方 · 工坊' : '工坊',
      isOfficial: skill.isOfficial, coverUrl: skill.coverUrl || undefined,
      prompt: skill.promptSnippet, isFavorite: skill.isFavorite, libraryVersion: skill.libraryVersion };
  }
  const skill = entry.content;
  return { id: skillEntryKey(entry), title: skill.displayName || skill.name, runtime: entry.kind,
    description: skill.description, models: '', category: skill.meta?.tags?.[0] || '通用', badge: '助手',
    coverUrl: skill.meta?.coverUrl, prompt: skill.markdownDoc || skill.prompt,
    genres: (skill.meta?.genres || []).filter((genre): genre is SkillOutputGenre => ['图片', '视频', '音频', '文本'].includes(genre)),
    isFavorite: content.isFavorite === true, libraryVersion: skill.libraryVersion };
}
