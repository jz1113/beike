import type { SkillItem, SkillMainTab, SkillPresentation } from './skillTypes';
import type { SkillRuntime } from '@shared/domain/skills/library';

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
    if (filters.scope === 'my' && item.isOfficial) return false;
    if (filters.scope === 'favorite' && !favorites.has(item.id)) return false;
    if (filters.category !== '全部' && item.category !== filters.category && !item.tags?.includes(filters.category)) return false;
    const searchable = [item.title, item.description, item.category, item.author, item.models, ...(item.tags || []), ...(item.genres || [])].join(' ').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}
