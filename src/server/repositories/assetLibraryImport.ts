import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { db } from './access';
import { organizationData } from './assetOrganization';
import {
  PROMPT_GROUP_SUBCATEGORIES,
  PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX,
  PROMPT_GROUP_SUBCATEGORY_LABELS,
  builtinSubcategoryFolderId,
  isPromptGroupSubcategory,
  isPromptGroupSubcategoryFolderId,
  isValidPromptGroupSubcategoryValue,
} from '@shared/domain/assets/promptGroupSubcategory';

type FieldType = 'string' | 'string?' | 'int' | 'int?' | 'boolean';
type AssetType = 'scene' | 'outfit' | 'action' | 'persona' | 'full_prompt';
const semanticPromptCategoryIds = new Set([
  'jewelry', 'digital', 'digital_3c', 'phone', '手机数码', 'apparel', 'bag', 'shoes',
  'beauty', 'eyewear', 'hat_accessory', 'universal', 'all',
]);

/** Backup restoration has its own scalar contract; it must not widen ordinary edits. */
const organizationFields = {
  albumId: 'string?', productCategoryIds: 'string', isUniversal: 'boolean',
} as const;
const commonFields = {
  sourceImages: 'string?', dimensions: 'string?', sourceImageIndex: 'int?', imageType: 'string?',
  provenance: 'string', usageCount: 'int', isFavorite: 'boolean', ...organizationFields,
} as const;
const visualFields = {
  ...commonFields, reversePrompt: 'string?', coverUrl: 'string?', tags: 'string',
} as const;
const backupFields: Record<AssetType, Record<string, FieldType>> = {
  scene: {
    ...visualFields, title: 'string', description: 'string', lighting: 'string', category: 'string',
    spatialType: 'string', suitableCategories: 'string',
  },
  outfit: {
    ...visualFields, title: 'string', top: 'string', bottom: 'string', shoes: 'string?',
    colorPalette: 'string?', category: 'string', suitableCategories: 'string',
  },
  action: {
    ...visualFields, title: 'string', action: 'string', shotType: 'string', spatialType: 'string',
    camera: 'string?', suitableAnatomy: 'string', sceneId: 'string?', shotOrder: 'int',
  },
  persona: {
    ...commonFields, name: 'string', description: 'string', tags: 'string', avatarUrl: 'string?',
    reversePrompt: 'string?',
  },
  full_prompt: {
    ...commonFields, title: 'string', albumName: 'string?', reversePromptZh: 'string',
    reversePromptEn: 'string?', sourceImageIndices: 'string?', groupIndex: 'int?',
    contentSummary: 'string?', architectureSummary: 'string?', replaceableSlots: 'string?',
    shotPromptsJson: 'string?', coverUrl: 'string?', hasHuman: 'boolean', shotFraming: 'string?',
    productFrameRatio: 'int?', sceneSummary: 'string?', outfitSummary: 'string?',
    actionSummary: 'string?', personaSummary: 'string?', tags: 'string', category: 'string',
    productSubcategory: 'string?',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function pickBackupAssetFields(type: string, raw: unknown): Record<string, unknown> {
  if (!Object.hasOwn(backupFields, type)) throw new Error(`不支持的资产类型: ${type}`);
  if (!isRecord(raw)) throw new Error('资产备份条目必须为对象');
  const fields = backupFields[type as AssetType];
  const data: Record<string, unknown> = {};
  for (const [key, fieldType] of Object.entries(fields)) {
    const value = raw[key];
    if (value === undefined) continue;
    const nullable = fieldType.endsWith('?');
    if (value === null && nullable) { data[key] = null; continue; }
    const kind = nullable ? fieldType.slice(0, -1) : fieldType;
    const valid = kind === 'int'
      ? typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      : typeof value === kind;
    if (!valid) throw new Error(`资产备份字段类型不正确: ${type}.${key}`);
    if (type === 'full_prompt' && key === 'productSubcategory' && !isValidPromptGroupSubcategoryValue(value)) {
      throw new Error('资产备份商品二级类目无效');
    }
    data[key] = value;
  }
  return data;
}

export interface ImportMaps {
  categoryMap: Map<string, string>;
  albumMap: Map<string, string>;
  validCategoryIds: Set<string>;
  unresolvedCategoryIds: Set<string>;
  warnings: string[];
  unmappedAlbumRefs: number;
  invalidCategoryMetadata: number;
  invalidAssetCategoryLists: number;
  albumsWithoutSourceKey: number;
  categoryNameConflicts: number;
  categoryIdConflicts: number;
  categoryPositionConflicts: number;
  albumSourceConflicts: number;
}

function mapCategoryId(id: string, maps: ImportMaps): string | null {
  const mapped = maps.categoryMap.get(id);
  if (mapped) return mapped;
  if (maps.validCategoryIds.has(id)) return id;
  maps.unresolvedCategoryIds.add(id);
  return null;
}

function backupStringArray(value: unknown, maps: ImportMaps): string {
  if (value === undefined || value === null) return '[]';
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) return JSON.stringify(parsed);
    } catch { /* malformed historical metadata is reset below */ }
  }
  maps.invalidCategoryMetadata += 1;
  return '[]';
}

function matchesStringArray(raw: string, expected: string): boolean {
  try { return JSON.stringify(JSON.parse(raw)) === expected; }
  catch { return false; }
}

/** Built-in child values are implicit folders under digital_3c. A copied major
 * gets a new ID, so materialize and map those folders before restoring groups. */
async function restoreMappedBuiltinFolders(client: Prisma.TransactionClient, maps: ImportMaps) {
  const parentId = maps.categoryMap.get('digital_3c');
  if (!parentId || parentId === 'digital_3c') return;
  for (const [position, value] of PROMPT_GROUP_SUBCATEGORIES.entries()) {
    const originalId = builtinSubcategoryFolderId(value);
    if (maps.categoryMap.has(originalId)) continue;
    const folder = await client.assetProductCategory.create({ data: {
      id: `${PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX}${randomUUID()}`,
      name: PROMPT_GROUP_SUBCATEGORY_LABELS[value], parentId, position,
      workspaceId: requireWorkspaceId(),
    } });
    maps.categoryMap.set(originalId, folder.id);
    maps.validCategoryIds.add(folder.id);
  }
}

export async function createRestoredAlbum(
  client: Prisma.TransactionClient, maps: ImportMaps,
  input: { name: string; sourceKey: string; productCategoryId: string | null },
) {
  const workspaceId = requireWorkspaceId();
  const current = await client.promptAlbum.findUnique({
    where: { workspaceId_sourceKey: { workspaceId, sourceKey: input.sourceKey } },
  });
  // Restored groups keep their original groupIndex. Reusing an existing album
  // would make (albumId, groupIndex) ambiguous for later re-analysis.
  if (current) maps.albumSourceConflicts += 1;
  return client.promptAlbum.create({
    data: {
      name: input.name,
      sourceKey: current ? `backup-copy:${randomUUID()}` : input.sourceKey,
      productCategoryId: input.productCategoryId,
      workspaceId,
    },
  });
}

export async function importLibraryBackup(body: Record<string, unknown>, client: Prisma.TransactionClient = db): Promise<ImportMaps> {
  if (body.productCategories !== undefined && !Array.isArray(body.productCategories)) throw new Error('备份商品品类格式无效');
  if (body.albums !== undefined && !Array.isArray(body.albums)) throw new Error('备份图集格式无效');
  const categories = (body.productCategories || []) as unknown[];
  const albums = (body.albums || []) as unknown[];
  const maps: ImportMaps = {
    categoryMap: new Map(), albumMap: new Map(), validCategoryIds: new Set(),
    unresolvedCategoryIds: new Set(), warnings: [], unmappedAlbumRefs: 0,
    invalidCategoryMetadata: 0, invalidAssetCategoryLists: 0, albumsWithoutSourceKey: 0,
    categoryNameConflicts: 0, categoryIdConflicts: 0, categoryPositionConflicts: 0,
    albumSourceConflicts: 0,
  };
  const visibleCategories = await client.assetProductCategory.findMany();
  const categoriesById = new Map(visibleCategories.map(row => [row.id, row]));
  for (const row of visibleCategories) maps.validCategoryIds.add(row.id);

  const pending = new Map<string, Record<string, unknown>>();
  for (const raw of categories) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string' || !raw.name.trim()) {
      throw new Error('备份商品品类条目无效');
    }
    if (pending.has(raw.id)) throw new Error('备份商品品类 ID 重复');
    pending.set(raw.id, raw);
  }
  while (pending.size) {
    let progressed = false;
    for (const [oldId, category] of pending) {
      const parentId = typeof category.parentId === 'string' && category.parentId ? category.parentId : null;
      if (parentId && pending.has(parentId)) continue;
      const mappedParentId = parentId ? mapCategoryId(parentId, maps) : null;
      const name = String(category.name).trim();
      if (category.isArchived !== undefined && typeof category.isArchived !== 'boolean') throw new Error('备份文件夹状态无效');
      const metadata = {
        aliases: backupStringArray(category.aliases, maps),
        keywords: backupStringArray(category.keywords, maps),
        anatomy: backupStringArray(category.anatomy, maps),
      };
      const matchesBackup = (row: typeof visibleCategories[number]) =>
        row.name === name && row.parentId === mappedParentId &&
        (category.isArchived === undefined || row.isArchived === category.isArchived) &&
        matchesStringArray(row.aliases, metadata.aliases) &&
        matchesStringArray(row.keywords, metadata.keywords) &&
        matchesStringArray(row.anatomy, metadata.anatomy);
      const byId = categoriesById.get(oldId);
      if (byId && !matchesBackup(byId)) maps.categoryIdConflicts += 1;
      const sameName = await client.assetProductCategory.findMany({ where: { name, parentId: mappedParentId } });
      const existing = byId && matchesBackup(byId) ? byId : sameName.find(matchesBackup);
      if (sameName.length && !existing) maps.categoryNameConflicts += 1;
      const position = typeof category.position === 'number' && Number.isSafeInteger(category.position) && category.position >= 0
        ? category.position : 0;
      if (existing && typeof category.position === 'number' && existing.position !== position) maps.categoryPositionConflicts += 1;
      const row = existing || await client.assetProductCategory.create({ data: {
        ...(isPromptGroupSubcategoryFolderId(oldId)
          ? { id: byId ? `${PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX}${randomUUID()}` : oldId }
          : {}),
        workspaceId: requireWorkspaceId(),
        name, parentId: mappedParentId,
        isArchived: category.isArchived === true,
        position,
        ...metadata,
      } });
      maps.categoryMap.set(oldId, row.id);
      maps.validCategoryIds.add(row.id);
      pending.delete(oldId);
      progressed = true;
    }
    if (!progressed) throw new Error('备份商品品类层级存在循环');
  }
  await restoreMappedBuiltinFolders(client, maps);

  const seenAlbums = new Set<string>();
  for (const raw of albums) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string' || !raw.name.trim()) {
      throw new Error('备份图集条目无效');
    }
    if (seenAlbums.has(raw.id)) throw new Error('备份图集 ID 重复');
    seenAlbums.add(raw.id);
    const productCategoryId = typeof raw.productCategoryId === 'string' && raw.productCategoryId
      ? mapCategoryId(raw.productCategoryId, maps) : null;
    const hasSourceKey = typeof raw.sourceKey === 'string' && !!raw.sourceKey.trim();
    const sourceKey = hasSourceKey ? String(raw.sourceKey).trim() : randomUUID();
    if (!hasSourceKey) maps.albumsWithoutSourceKey += 1;
    const name = raw.name.trim();
    const row = await createRestoredAlbum(client, maps, { name, sourceKey, productCategoryId });
    maps.albumMap.set(raw.id, row.id);
  }
  return maps;
}

export function remapItemData(
  data: Record<string, unknown>, maps: ImportMaps,
  options: { reportInvalidList?: boolean; preserveSemanticCategoryIds?: boolean } = {},
): Record<string, unknown> {
  const next = { ...data };
  if (isPromptGroupSubcategory(next.productSubcategory)) {
    const parentId = maps.categoryMap.get('digital_3c');
    if (parentId && parentId !== 'digital_3c') {
      next.productSubcategory = maps.categoryMap.get(builtinSubcategoryFolderId(next.productSubcategory)) || null;
    }
  } else if (isPromptGroupSubcategoryFolderId(next.productSubcategory)) {
    next.productSubcategory = maps.categoryMap.get(next.productSubcategory)
      || (maps.validCategoryIds.has(next.productSubcategory) ? next.productSubcategory : null);
  }
  if (typeof next.albumId === 'string' && next.albumId) {
    const mapped = maps.albumMap.get(next.albumId);
    if (mapped) next.albumId = mapped;
    else { next.albumId = null; maps.unmappedAlbumRefs += 1; }
  }
  if (typeof next.productCategoryIds === 'string') {
    try {
      const parsed: unknown = JSON.parse(next.productCategoryIds);
      if (!Array.isArray(parsed) || parsed.some(id => typeof id !== 'string')) throw new Error('invalid');
      next.productCategoryIds = JSON.stringify([...new Set(parsed.map(id => {
        const mapped = maps.categoryMap.get(id);
        if (mapped) return mapped;
        if (maps.validCategoryIds.has(id)) return id;
        if (options.preserveSemanticCategoryIds && semanticPromptCategoryIds.has(id)) return id;
        maps.unresolvedCategoryIds.add(id);
        return null;
      }).filter((id): id is string => !!id))]);
    } catch {
      next.productCategoryIds = '[]';
      if (options.reportInvalidList !== false) maps.invalidAssetCategoryLists += 1;
    }
  }
  return next;
}

export async function withOrganization(type: string, data: Record<string, unknown>, client: Prisma.TransactionClient = db) {
  return { ...data, ...(await organizationData(client, type, data)) };
}
