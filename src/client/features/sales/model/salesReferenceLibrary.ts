import type { SalesMaterialCard } from './salesMaterialCatalog';
import type { ScriptTaxonomyItem } from '@shared/contracts/salesScriptTaxonomy';
import type { SalesScriptDomain } from '@shared/domain/sales';
import { matchesActionCategoryFilter } from './salesMaterialCatalog';
import { filterScriptCategory, filterScriptResults, type ScriptCategoryFilter } from './salesScriptLibrary';
import { compareSalesAssetNames } from './salesAssetNames';

export interface ReferenceLibraryFilters { category: ScriptCategoryFilter; style: string; query: string }
interface ReferenceLibraryScript { id: string; title: string; status: string; script: SalesScriptDomain; videoUrl?: string; depthVideoUrl?: string }

/** Only explicit URL associations collapse cards; titles never establish a relationship. */
export function standaloneSalesActions(actions: readonly SalesMaterialCard[], scripts: readonly { videoUrl?: string; depthVideoUrl?: string }[]) {
  const linked = new Set(scripts.flatMap((item) => [item.videoUrl, item.depthVideoUrl || '']).filter(Boolean));
  return actions.filter((item) => item.kind === 'action' && (!item.video || !linked.has(item.video)));
}

export function filterStandaloneSalesActions(actions: readonly SalesMaterialCard[], options: ReferenceLibraryFilters, categories: readonly { id: string; name: string }[]) {
  const categoryIds = new Set(categories.map((item) => item.id));
  return actions.filter((item) => {
    if (options.category === 'draft_only' || !['all', 'unstyled'].includes(options.style)) return false;
    const filter = options.category === 'uncategorized' ? 'unclassified' : options.category;
    if (!matchesActionCategoryFilter(item, filter, categoryIds)) return false;
    const names = categories.filter((category) => item.categoryId === category.id || item.productCategoryIds?.includes(category.id)).map((item) => item.name);
    return `${item.title} ${item.description} ${item.tags.join(' ')} ${names.join(' ')}`.toLocaleLowerCase().includes(options.query.trim().toLocaleLowerCase());
  });
}

/** Facet counts keep the other filters, and count each linked bundle only once. */
export function salesReferenceLibraryView<T extends ReferenceLibraryScript>(items: readonly T[], actionCards: readonly SalesMaterialCard[], taxonomy: readonly ScriptTaxonomyItem[], filters: ReferenceLibraryFilters) {
  const standalone = standaloneSalesActions(actionCards, items);
  const categories = taxonomy.filter((item) => item.kind === 'category');
  const styles = taxonomy.filter((item) => item.kind === 'style');
  const select = (value: ReferenceLibraryFilters) => {
    const scripts = filterScriptResults(
      filterScriptCategory(items, value.category, taxonomy), { query: value.query, style: value.style, shots: 'all' }, taxonomy,
    );
    const actions = filterStandaloneSalesActions(standalone, value, categories);
    return { scripts, actions, count: scripts.length + actions.length };
  };
  const count = (patch: Partial<ReferenceLibraryFilters>) => select({ ...filters, ...patch }).count;
  const selected = select(filters);
  const entries = [
    ...selected.scripts.map((item) => ({ kind: 'script' as const, item })),
    ...selected.actions.map((item) => ({ kind: 'action' as const, item })),
  ].sort((left, right) => compareSalesAssetNames(left.item.title, right.item.title));
  return {
    ...selected, entries, total: items.length + standalone.length,
    categories: [
      { value: 'all', label: '全部分类', count: count({ category: 'all' }) },
      { value: 'unclassified', label: '未分类', count: count({ category: 'uncategorized' }) },
      ...categories.map((item) => ({ value: `category:${item.id}`, label: item.name, count: count({ category: `category:${item.id}` }) })),
    ],
    styles: [
      { value: 'all', label: '全部风格', count: count({ style: 'all' }) },
      ...styles.map((item) => ({ value: item.id, label: item.name, count: count({ style: item.id }) })),
    ],
  };
}
