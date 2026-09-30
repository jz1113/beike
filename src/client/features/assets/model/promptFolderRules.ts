import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { DEFAULT_SUBCATEGORIES_MAP, SUBCATEGORY_STORAGE_KEY_PREFIX, type ActionCategoryId } from '@shared/domain/products/productCategory/defs';

export interface FolderRuleValues { keywords: string[]; anatomy: string[] }
export interface FolderRuleImport { name: string; keywords: string[]; anatomy?: string[] }
export interface FolderRuleOrganization { categories: AssetProductCategory[]; albums: PromptAlbum[] }
export interface FolderRulePreview { items: FolderRuleImport[]; errors: string[]; sourceCount: number }
const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function uniqueRuleWords(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(value => value.trim()).filter(value => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseRuleWords(raw: unknown): string[] {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? uniqueRuleWords(value.filter((word): word is string => typeof word === 'string')) : [];
  } catch { return []; }
}

export function tokenizeRuleWords(text: string): string[] {
  return uniqueRuleWords(text.split(/[,，;；、\r\n]+/));
}

export function folderRuleValues(category: AssetProductCategory): FolderRuleValues {
  return { keywords: parseRuleWords(category.keywords), anatomy: parseRuleWords(category.anatomy) };
}

export function folderRulesReadOnly(category: AssetProductCategory): boolean {
  return 'isReadOnly' in category && category.isReadOnly === true;
}

export function folderRuleSignature(category: AssetProductCategory): string {
  return JSON.stringify([category.id, category.name, category.parentId, !!category.isArchived, folderRuleValues(category)]);
}

export function validateFolderRules(values: FolderRuleValues): string[] {
  const errors: string[] = [];
  if (values.keywords.length > 200) errors.push('匹配关键词最多 200 项');
  if (values.anatomy.length > 32) errors.push('适用部位最多 32 项');
  if ([...values.keywords, ...values.anatomy].some(word => word.length > 80)) errors.push('每个关键词或部位最多 80 字');
  return errors;
}

export function folderRuleRoot(category: AssetProductCategory, categories: AssetProductCategory[]): AssetProductCategory | undefined {
  const visited = new Set<string>();
  let current: AssetProductCategory | undefined = category;
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    current = categories.find(item => item.id === current?.parentId);
  }
  return current && !current.parentId && !current.isArchived ? current : undefined;
}

export function isLegacyRuleRoot(id: string): id is ActionCategoryId {
  return Object.prototype.hasOwnProperty.call(DEFAULT_SUBCATEGORIES_MAP, id);
}

/** Defaults apply only inside the matching legacy parent and to an exact existing definition. */
export function recommendedFolderRules(category: AssetProductCategory, categories: AssetProductCategory[]): FolderRuleValues {
  const root = folderRuleRoot(category, categories);
  const defaults = root && isLegacyRuleRoot(root.id) ? DEFAULT_SUBCATEGORIES_MAP[root.id] : [];
  if (category.id === root?.id && defaults.length) {
    return { keywords: uniqueRuleWords([category.name, ...defaults.flatMap(item => item.keywords)]), anatomy: uniqueRuleWords(defaults.map(item => item.anatomy || '').filter(Boolean)) };
  }
  const names = [category.name, ...parseRuleWords(category.aliases)].map(normalize);
  const exact = defaults.find(item => item.id === category.id || [item.label, item.shortLabel].some(label => names.includes(normalize(label))));
  return exact
    ? { keywords: [...exact.keywords], anatomy: exact.anatomy ? [exact.anatomy] : [] }
    : { keywords: uniqueRuleWords([category.name]), anatomy: [] };
}

function deduplicateImports(items: FolderRuleImport[], errors: string[], sourceCount: number): FolderRulePreview {
  const byName = new Map<string, FolderRuleImport>();
  for (const item of items) {
    const key = normalize(item.name);
    const previous = byName.get(key);
    byName.set(key, previous ? { name: previous.name, keywords: uniqueRuleWords([...previous.keywords, ...item.keywords]), ...(previous.anatomy || item.anatomy ? { anatomy: uniqueRuleWords([...(previous.anatomy || []), ...(item.anatomy || [])]) } : {}) } : item);
  }
  const result = [...byName.values()];
  if (result.length > 100) errors.push('每批最多导入 100 个二级文件夹');
  for (const item of result) {
    if (!item.name || item.name.length > 40) errors.push(`「${item.name.slice(0, 40) || '未命名'}」名称需要 1–40 字`);
    errors.push(...validateFolderRules({ keywords: item.keywords, anatomy: item.anatomy || [] }).map(error => `「${item.name}」${error}`));
  }
  return { items: result, errors: [...new Set(errors)], sourceCount };
}

export function previewFolderRuleImport(text: string): FolderRulePreview {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const errors: string[] = [];
  const items: FolderRuleImport[] = [];
  lines.forEach((line, index) => {
    const delimiter = line.search(/[:：]/);
    if (delimiter < 1) { errors.push(`第 ${index + 1} 行需要「子类名:词1,词2」`); return; }
    const keywords = tokenizeRuleWords(line.slice(delimiter + 1));
    if (!keywords.length) { errors.push(`第 ${index + 1} 行至少填写一个关键词`); return; }
    items.push({ name: line.slice(0, delimiter).trim(), keywords });
  });
  return deduplicateImports(items, errors, lines.length);
}

/** Read the original backup only; never fall back to another parent or hydrated dictionaries. */
export function previewLegacyFolderRules(parentId: string, storage: Pick<Storage, 'getItem'>): FolderRulePreview & { key?: string } {
  if (!isLegacyRuleRoot(parentId)) return { items: [], errors: [], sourceCount: 0 };
  const key = `${SUBCATEGORY_STORAGE_KEY_PREFIX}${parentId}`;
  try {
    const raw = storage.getItem(key);
    if (!raw) return { items: [], errors: [], sourceCount: 0, key };
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('缓存格式不是列表');
    const errors: string[] = [];
    const items: FolderRuleImport[] = [];
    value.forEach((entry: unknown, index) => {
      if (!entry || typeof entry !== 'object') { errors.push(`缓存第 ${index + 1} 项格式错误`); return; }
      const item = entry as Record<string, unknown>;
      if (item.parentId != null && item.parentId !== parentId) { errors.push(`缓存第 ${index + 1} 项属于其他大类，未迁入`); return; }
      const name = typeof item.label === 'string' ? item.label.trim() : typeof item.name === 'string' ? item.name.trim() : '';
      const anatomy = typeof item.anatomy === 'string' ? tokenizeRuleWords(item.anatomy) : parseRuleWords(item.anatomy);
      items.push({ name, keywords: parseRuleWords(item.keywords), ...(anatomy.length ? { anatomy } : {}) });
    });
    return { ...deduplicateImports(items, errors, value.length), key };
  } catch (cause) {
    return { items: [], errors: [cause instanceof Error ? `旧缓存无法读取：${cause.message}` : '旧缓存无法读取'], sourceCount: 0, key };
  }
}

export function readFolderRuleOrganization(value: unknown): FolderRuleOrganization | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result = value as Record<string, unknown>;
  if (!result.success || !Array.isArray(result.categories) || !Array.isArray(result.albums)) return undefined;
  if (!result.categories.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && (item.parentId === null || typeof item.parentId === 'string'))) return undefined;
  return { categories: result.categories as AssetProductCategory[], albums: result.albums as PromptAlbum[] };
}
