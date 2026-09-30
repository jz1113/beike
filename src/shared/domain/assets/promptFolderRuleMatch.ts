import type { AssetProductCategory } from './assetOrganization';

export function serializedRuleWords(raw?: string): string[] {
  try {
    const value: unknown = JSON.parse(raw || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((word): word is string => typeof word === 'string' && !!word.trim()).map(word => word.trim()))] : [];
  } catch { return []; }
}

export interface PromptFolderRuleMatch {
  folder: AssetProductCategory;
  major: AssetProductCategory;
  anatomy: string[];
}

/** Match only active, actual tree rules. Never materialize the old default taxonomy. */
export function matchPromptFolderRules(categories: AssetProductCategory[], title: string, props?: Record<string, unknown> | null): PromptFolderRuleMatch | null {
  const text = `${title} ${JSON.stringify(props || {})}`.toLocaleLowerCase();
  const active = categories.filter(row => !row.isArchived);
  const roots = new Map(active.filter(row => !row.parentId).map(row => [row.id, row]));
  const matches = active.flatMap(folder => {
    const major = folder.parentId ? roots.get(folder.parentId) : folder;
    if (!major) return [];
    const words = [...serializedRuleWords(folder.keywords), ...serializedRuleWords(folder.aliases)];
    const score = Math.max(0, ...words.filter(word => text.includes(word.toLocaleLowerCase())).map(word => word.length));
    return score ? [{ folder, major, score, anatomy: serializedRuleWords(folder.anatomy).length ? serializedRuleWords(folder.anatomy) : serializedRuleWords(major.anatomy) }] : [];
  }).sort((a, b) => b.score - a.score || Number(!!b.folder.parentId) - Number(!!a.folder.parentId) || a.folder.position - b.folder.position || a.folder.id.localeCompare(b.folder.id));
  const best = matches[0];
  if (!best || matches.some(row => row.score === best.score && !!row.folder.parentId === !!best.folder.parentId && row.major.id !== best.major.id)) return null;
  return { folder: best.folder, major: best.major, anatomy: best.anatomy };
}
