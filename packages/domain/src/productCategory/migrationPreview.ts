import { DEFAULT_SUBCATEGORIES_MAP, type ActionCategoryId, type SubCategoryDef } from './defs';

export interface LocalCategoryReport {
  parentId: ActionCategoryId;
  categories: SubCategoryDef[];
}

export interface ServerCategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  aliases?: string[];
  keywords?: string[];
  anatomy?: string[];
}

export interface CategoryMigrationPreviewItem {
  id: string;
  parentId: ActionCategoryId;
  label: string;
  keywords: string[];
  anatomy?: string;
  source: 'server' | 'default' | 'local';
  duplicateOf?: string;
}

export interface CategoryMigrationPreview {
  parents: ActionCategoryId[];
  items: CategoryMigrationPreviewItem[];
  createdCount: number;
  mergedCount: number;
}

export function buildCategoryMigrationPreview(
  local: LocalCategoryReport[],
  server: ServerCategoryNode[] = [],
  defaults: Record<ActionCategoryId, SubCategoryDef[]> = DEFAULT_SUBCATEGORIES_MAP,
): CategoryMigrationPreview {
  const parents = Object.keys(defaults) as ActionCategoryId[];
  const items: CategoryMigrationPreviewItem[] = [];
  const seen = new Map<string, CategoryMigrationPreviewItem>();

  for (const parentId of parents) {
    const serverChildren = server.filter((node) => node.parentId === parentId || (!node.parentId && node.id === parentId));
    for (const node of serverChildren) {
      if (!node.parentId) continue;
      const item = toItem(node, parentId, 'server');
      seen.set(keyFor(parentId, item.label), item);
      items.push(item);
    }
    for (const def of defaults[parentId] || []) {
      upsert(items, seen, def, parentId, 'default');
    }
  }

  for (const report of local) {
    for (const def of report.categories || []) {
      upsert(items, seen, def, report.parentId, 'local');
    }
  }

  return {
    parents,
    items,
    createdCount: items.filter((item) => item.source === 'local').length,
    mergedCount: items.filter((item) => item.duplicateOf).length,
  };
}

function upsert(
  items: CategoryMigrationPreviewItem[],
  seen: Map<string, CategoryMigrationPreviewItem>,
  def: SubCategoryDef,
  parentId: ActionCategoryId,
  source: CategoryMigrationPreviewItem['source'],
) {
  const label = def.label || def.shortLabel || def.id;
  const existing = seen.get(keyFor(parentId, label)) || findByKeyword(seen, parentId, def.keywords);
  if (existing) {
    existing.keywords = unique([...(existing.keywords || []), ...(def.keywords || [])]);
    if (source === 'local' && existing.source !== 'local') existing.duplicateOf = existing.id;
    return;
  }
  const item: CategoryMigrationPreviewItem = {
    id: def.id,
    parentId,
    label,
    keywords: def.keywords || [],
    anatomy: def.anatomy,
    source,
  };
  seen.set(keyFor(parentId, label), item);
  items.push(item);
}

function toItem(node: ServerCategoryNode, parentId: ActionCategoryId, source: CategoryMigrationPreviewItem['source']): CategoryMigrationPreviewItem {
  return {
    id: node.id,
    parentId,
    label: node.name,
    keywords: node.keywords || [],
    anatomy: node.anatomy?.[0],
    source,
  };
}

function findByKeyword(seen: Map<string, CategoryMigrationPreviewItem>, parentId: ActionCategoryId, keywords: string[] = []) {
  const normalized = keywords.map((word) => word.trim().toLowerCase()).filter(Boolean);
  for (const item of seen.values()) {
    if (item.parentId !== parentId) continue;
    if (item.keywords.some((word) => normalized.includes(word.toLowerCase()))) return item;
  }
  return undefined;
}

function keyFor(parentId: string, label: string) {
  return `${parentId}:${label.trim().toLowerCase()}`;
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
