export interface AssetProductCategory {
  id: string; name: string; parentId: string | null; position: number; isArchived?: boolean;
  keywords?: string; anatomy?: string; aliases?: string;
  isReadOnly?: boolean;
}
export interface PromptAlbum { id: string; name: string; productCategoryId: string | null; sourceKey?: string }
export interface OrganizedAsset {
  id: string; albumId?: string | null; productCategoryIds?: string; isUniversal?: boolean;
  albumName?: string | null; title?: string | null; sourceImageIndex?: number | null;
}
export function categoryIds(raw: unknown): string[] {
  try { const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && !!id))] : [];
  } catch { return []; }
}
export function categoryScope(categories: AssetProductCategory[], selected: string): string[] {
  return [selected, ...categories.filter(c => c.parentId === selected).map(c => c.id)];
}
export function matchesProductCategory(item: OrganizedAsset, selected: string, scope: string[], includeUniversal = true): boolean {
  if (selected === 'all') return true;
  const ids = categoryIds(item.productCategoryIds);
  if (selected === 'unclassified') return !ids.length && !item.isUniversal;
  return (includeUniversal && !!item.isUniversal) || ids.some(id => scope.includes(id));
}
export function groupPromptAlbums<T extends OrganizedAsset>(items: T[], albums: PromptAlbum[]) {
  const definitions = new Map(albums.map(a => [a.id, a]));
  const groups = new Map<string, { id: string; name: string; productCategoryId: string | null; items: T[] }>();
  for (const item of items) {
    const id = item.albumId || `single:${item.id}`;
    if (!groups.has(id)) { const album = definitions.get(id);
      groups.set(id, { id, name: album?.name || item.albumName || item.title || '未命名图集', productCategoryId: album?.productCategoryId || categoryIds(item.productCategoryIds)[0] || null, items: [] }); }
    groups.get(id)!.items.push(item);
  }
  return [...groups.values()].map(group => ({ ...group, items: [...group.items].sort((a,b) => (a.sourceImageIndex ?? Infinity) - (b.sourceImageIndex ?? Infinity) || a.id.localeCompare(b.id)) }));
}
