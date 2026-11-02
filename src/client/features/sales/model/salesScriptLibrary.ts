import type { SalesScriptDomain } from '@shared/domain/sales';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
interface LibraryScript { id: string; title: string; status: string; script: SalesScriptDomain }

export type ScriptCategoryFilter = 'all' | 'draft_only' | 'uncategorized' | `category:${string}`;

export function scriptTaxonomyEntry(script: SalesScriptDomain, kind: ScriptTaxonomyKind, catalog: readonly ScriptTaxonomyItem[]) {
  const id = kind === 'category' ? script.taxonomy.categoryId : script.taxonomy.styleId;
  return catalog.find((item) => item.kind === kind && item.id === id);
}

export function filterScriptCategory<T extends LibraryScript>(
  items: readonly T[], category: ScriptCategoryFilter,
  catalog: readonly ScriptTaxonomyItem[],
): T[] {
  return items.filter((item) => {
    if (category === 'all') return true;
    if (category === 'draft_only') return item.status === 'draft';
    const entry = scriptTaxonomyEntry(item.script, 'category', catalog);
    if (category === 'uncategorized') return !entry;
    return entry?.id === category.slice('category:'.length);
  });
}

export function filterScriptResults<T extends LibraryScript>(items: readonly T[], filters: {
  query: string; style: string;
  shots: 'all' | 'oneTake' | 'cuts';
}, catalog: readonly ScriptTaxonomyItem[]): T[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return items.filter(({ script, title }) => {
    const style = scriptTaxonomyEntry(script, 'style', catalog);
    if (filters.style === 'unstyled' ? Boolean(style) : filters.style !== 'all' && style?.id !== filters.style) return false;
    if (filters.shots === 'oneTake' && !script.visualSpec.oneTake) return false;
    if (filters.shots === 'cuts' && script.visualSpec.oneTake) return false;
    const category = scriptTaxonomyEntry(script, 'category', catalog);
    return !query || `${title} ${script.overview} ${script.taxonomy.subCategory} ${script.visualSpec.styleSummary} ${category?.name || ''} ${style?.name || ''}`.toLocaleLowerCase().includes(query);
  });
}
