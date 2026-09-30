import type { Prisma } from '@prisma/client';
import { albumSourceKey } from '@server/infrastructure/database/assetOrganization';
import { PROMPT_ASSET_STATUSES, PROMPT_ASSET_TYPES, type PromptAssetStatus, type PromptAssetType } from '@shared/domain/prompts/promptAsset';
import { db } from './access';
import { createRestoredAlbum, importLibraryBackup, pickBackupAssetFields, remapItemData, withOrganization, type ImportMaps } from './assetLibraryImport';
import { nextFullPromptDisplayNumber } from '@server/infrastructure/database/fullPromptDisplayNumbers';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { inferPromptGroupSubcategory } from '@shared/domain/workshop/workshopPipeline/groupCategoryFit';
import { parseGroupShotSkeleton } from '@shared/domain/workshop/workshopPipeline/storyboardSlots';

interface BackupItem {
  assetType: string;
  data: Record<string, unknown>;
  sourceId?: string;
}

interface BackupRegistry {
  id: string;
  assetType: PromptAssetType;
  sourceAssetId: string;
  status: PromptAssetStatus;
  version: number;
  provenance: string;
  sourceRef: string | null;
  qualityScore: number | null;
  confidence: number | null;
  publishedAt: Date | null;
  disabledReason: string | null;
}

interface BackupImageReplacement {
  motherAssetId: string;
  sourceSnapshotJson: string;
  generatedImagesJson: string;
  createdAt: string;
}

function parseImageReplacements(raw: unknown): BackupImageReplacement[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('备份母组换图记录格式无效');
  const seen = new Set<string>();
  return raw.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份母组换图记录无效');
    const row = value as Record<string, unknown>;
    if (typeof row.motherAssetId !== 'string' || !row.motherAssetId || seen.has(row.motherAssetId)
      || typeof row.sourceSnapshotJson !== 'string' || typeof row.generatedImagesJson !== 'string'
      || typeof row.createdAt !== 'string' || Number.isNaN(Date.parse(row.createdAt))) {
      throw new Error('备份母组换图记录无效');
    }
    try {
      const snapshot: unknown = JSON.parse(row.sourceSnapshotJson);
      const images: unknown = JSON.parse(row.generatedImagesJson);
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
        || !Array.isArray(images) || images.length !== 4
        || images.some(url => typeof url !== 'string' || !url.trim())) throw new Error('invalid');
    } catch { throw new Error('备份母组换图内容无效'); }
    seen.add(row.motherAssetId);
    return { motherAssetId: row.motherAssetId, sourceSnapshotJson: row.sourceSnapshotJson,
      generatedImagesJson: row.generatedImagesJson, createdAt: row.createdAt };
  });
}

function assetKey(assetType: string, sourceAssetId: string): string {
  return JSON.stringify([assetType, sourceAssetId]);
}

function optionalString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  throw new Error(`注册表字段类型不正确: ${field}`);
}

function optionalFiniteNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`注册表字段类型不正确: ${field}`);
}

function parseRegistries(raw: unknown): BackupRegistry[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) throw new Error('备份资产审核状态格式无效');
  const ids = new Set<string>();
  const assets = new Set<string>();
  return raw.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份资产审核状态条目无效');
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id ||
        typeof row.assetType !== 'string' || !PROMPT_ASSET_TYPES.includes(row.assetType as PromptAssetType) ||
        typeof row.sourceAssetId !== 'string' || !row.sourceAssetId ||
        typeof row.status !== 'string' || !PROMPT_ASSET_STATUSES.includes(row.status as PromptAssetStatus) ||
        typeof row.provenance !== 'string' ||
        typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 1 || row.version > 2_147_483_647) {
      throw new Error('备份资产审核状态条目无效');
    }
    const key = assetKey(row.assetType, row.sourceAssetId);
    if (ids.has(row.id) || assets.has(key)) throw new Error('备份资产审核状态条目重复');
    ids.add(row.id);
    assets.add(key);
    const publishedAt = optionalString(row.publishedAt, 'publishedAt');
    if (publishedAt && Number.isNaN(Date.parse(publishedAt))) throw new Error('注册表发布时间无效');
    return {
      id: row.id, assetType: row.assetType as PromptAssetType, sourceAssetId: row.sourceAssetId,
      status: row.status as PromptAssetStatus, version: row.version, provenance: row.provenance,
      sourceRef: optionalString(row.sourceRef, 'sourceRef'),
      qualityScore: optionalFiniteNumber(row.qualityScore, 'qualityScore'),
      confidence: optionalFiniteNumber(row.confidence, 'confidence'),
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      disabledReason: optionalString(row.disabledReason, 'disabledReason'),
    };
  });
}

async function restoreRegistries(registries: BackupRegistry[], assetIds: Map<string, string>, tx: Prisma.TransactionClient) {
  const registryIds = new Map<string, string>();
  const pendingRefs: Array<{ id: string; sourceRef: string }> = [];
  let missingAssets = 0;
  for (const row of registries) {
    const sourceAssetId = assetIds.get(assetKey(row.assetType, row.sourceAssetId));
    if (!sourceAssetId) { missingAssets += 1; continue; }
    const created = await tx.promptAssetRegistry.create({ data: {
      assetType: row.assetType, sourceAssetId, status: row.status, version: row.version,
      provenance: row.provenance, sourceRef: null, qualityScore: row.qualityScore,
      confidence: row.confidence, publishedAt: row.publishedAt, disabledReason: row.disabledReason,
    } });
    registryIds.set(row.id, created.id);
    if (row.sourceRef) pendingRefs.push({ id: created.id, sourceRef: row.sourceRef });
  }
  let missingSourceRefs = 0;
  for (const row of pendingRefs) {
    const sourceRef = registryIds.get(row.sourceRef);
    if (sourceRef) await tx.promptAssetRegistry.update({ where: { id: row.id }, data: { sourceRef } });
    else missingSourceRefs += 1;
  }
  return { missingAssets, missingSourceRefs, restoredCount: registryIds.size };
}

function sourceImageCount(raw: unknown): number {
  if (typeof raw !== 'string') return 0;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string' && !!value.trim()).length : 0;
  } catch { return 0; }
}

function databaseCategoryIds(raw: string, maps: ImportMaps): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string').map(id =>
      maps.categoryMap.get(id) || (maps.validCategoryIds.has(id) ? id : null),
    ).filter((id): id is string => !!id))];
  } catch { return []; }
}

/** An old album ID is evidence of membership even when its image list is missing. */
async function restoreLegacyAlbums(items: BackupItem[], maps: ImportMaps, tx: Prisma.TransactionClient) {
  const groups = new Map<string, { name: string; images: string | null; imageCount: number; categoryIds: string }>();
  for (const item of items) {
    const oldId = item.data.albumId;
    if (typeof oldId !== 'string' || !oldId || maps.albumMap.has(oldId)) continue;
    const group = groups.get(oldId) || { name: '未命名图集', images: null, imageCount: 0, categoryIds: '[]' };
    if (item.assetType === 'full_prompt') {
      const name = typeof item.data.albumName === 'string' && item.data.albumName.trim()
        ? item.data.albumName.trim() : item.data.title;
      if (typeof name === 'string' && name.trim()) group.name = name.trim();
    }
    const count = sourceImageCount(item.data.sourceImages);
    if (count > group.imageCount) {
      group.images = item.data.sourceImages as string;
      group.imageCount = count;
    }
    if (group.categoryIds === '[]' && typeof item.data.productCategoryIds === 'string') {
      group.categoryIds = item.data.productCategoryIds;
    }
    groups.set(oldId, group);
  }
  let multipleCategoryAlbums = 0;
  for (const [oldId, group] of groups) {
    const ids = databaseCategoryIds(group.categoryIds, maps);
    if (ids.length > 1) multipleCategoryAlbums += 1;
    const sourceKey = albumSourceKey(group.name, group.images, `backup:${oldId}`);
    const album = await createRestoredAlbum(tx, maps, {
      name: group.name, sourceKey, productCategoryId: ids[0] || null,
    });
    maps.albumMap.set(oldId, album.id);
  }
  if (multipleCategoryAlbums) maps.warnings.push(`${multipleCategoryAlbums} 个旧图集包含多个商品品类，已保留首个品类`);
}

export async function bulkImportAssets(body: Record<string, unknown>, items: BackupItem[]) {
  const registries = parseRegistries(body.promptAssetRegistries);
  const imageReplacements = parseImageReplacements(body.fullPromptImageReplacements);
  const prepared = items.map(item => {
    if (!item || typeof item !== 'object' || typeof item.assetType !== 'string') throw new Error('资产备份条目无效');
    return {
      assetType: item.assetType,
      data: pickBackupAssetFields(item.assetType, item.data),
      sourceId: typeof item.sourceId === 'string' ? item.sourceId : undefined,
    };
  });
  const created: unknown[] = [];
  const sceneIds = new Map<string, string>();
  const createdAssetIds = new Map<string, string>();
  const seenSourceIds = new Set<string>();
  for (const item of prepared) {
    if (!item.sourceId) continue;
    const key = assetKey(item.assetType, item.sourceId);
    if (seenSourceIds.has(key)) throw new Error('备份资产 ID 重复');
    seenSourceIds.add(key);
  }
  const warnings = await db.$transaction(async tx => {
    const maps = await importLibraryBackup(body, tx);
    await restoreLegacyAlbums(prepared, maps, tx);
    let missingScenes = 0;
    const recordCreated = (item: BackupItem, asset: { id: string }) => {
      created.push(asset);
      if (item.sourceId) createdAssetIds.set(assetKey(item.assetType, item.sourceId), asset.id);
    };
    for (const item of [...prepared].sort((a, b) => Number(b.assetType === 'scene') - Number(a.assetType === 'scene'))) {
      const { assetType } = item;
      const remapped = remapItemData(item.data, maps, { preserveSemanticCategoryIds: assetType === 'full_prompt' });
      const organizationInput = assetType === 'full_prompt' && !remapped.albumId
        ? { ...remapped, productCategoryIds: JSON.stringify(databaseCategoryIds(String(item.data.productCategoryIds || '[]'), maps).slice(0, 1)) }
        : remapped;
      const data: Record<string, unknown> = await withOrganization(assetType, organizationInput, tx);
      if (assetType === 'full_prompt' && typeof remapped.productCategoryIds === 'string') {
        data.productCategoryIds = remapped.productCategoryIds;
      }
      if (assetType === 'full_prompt' && item.data.productSubcategory === undefined
        && parseGroupShotSkeleton(data.shotPromptsJson).length === 4) {
        data.productSubcategory = inferPromptGroupSubcategory(data);
      }
      if (assetType === 'action') {
        const oldSceneId = data.sceneId;
        if (typeof oldSceneId === 'string' && oldSceneId) {
          data.sceneId = sceneIds.get(oldSceneId) || null;
          if (!data.sceneId) missingScenes += 1;
        }
      }
      if (assetType === 'scene') {
        const scene = await tx.sceneAsset.create({ data: data as unknown as Prisma.SceneAssetUncheckedCreateInput });
        if (item.sourceId) sceneIds.set(item.sourceId, scene.id);
        recordCreated(item, scene);
      } else if (assetType === 'outfit') {
        recordCreated(item, await tx.outfitAsset.create({ data: data as unknown as Prisma.OutfitAssetUncheckedCreateInput }));
      } else if (assetType === 'action') {
        recordCreated(item, await tx.actionAsset.create({ data: data as unknown as Prisma.ActionAssetUncheckedCreateInput }));
      } else if (assetType === 'persona') {
        recordCreated(item, await tx.personaAsset.create({ data: data as unknown as Prisma.PersonaAssetUncheckedCreateInput }));
      } else if (assetType === 'full_prompt') {
        // A restored copy receives a fresh identity and number; a backup's old
        // displayNumber must never collide with assets already in this database.
        data.displayNumber = await nextFullPromptDisplayNumber(tx);
        recordCreated(item, await tx.fullPromptAsset.create({ data: data as unknown as Prisma.FullPromptAssetUncheckedCreateInput }));
      }
    }
    if (registries?.length) {
      const registryResult = await restoreRegistries(registries, createdAssetIds, tx);
      if (registryResult.missingAssets) maps.warnings.push(`${registryResult.missingAssets} 条审核记录未找到对应导入资产，已跳过`);
      if (registryResult.missingSourceRefs) maps.warnings.push(`${registryResult.missingSourceRefs} 条审核记录的来源母本未包含在备份中，已清空来源关联`);
      if (createdAssetIds.size > registryResult.restoredCount) {
        maps.warnings.push(`${createdAssetIds.size - registryResult.restoredCount} 条资产缺少审核记录，后续将按现有规则补建`);
      }
    } else if (created.length) {
      maps.warnings.push('备份不含资产审核记录，原审核状态无法恢复，导入后将按现有规则重新建立');
    }
    let missingMothers = 0;
    for (const replacement of imageReplacements) {
      const motherAssetId = createdAssetIds.get(assetKey('full_prompt', replacement.motherAssetId));
      if (!motherAssetId) { missingMothers += 1; continue; }
      // Imported assets receive new IDs. Their one-time replacement state must
      // follow that new ID, while the old review ID is intentionally not reused.
      await tx.$executeRawUnsafe(
        'INSERT INTO "FullPromptImageReplacement" ("motherAssetId", "workspaceId", "reviewId", "sourceSnapshotJson", "generatedImagesJson", "createdAt") VALUES (?, ?, ?, ?, ?, ?)',
        motherAssetId, requireWorkspaceId(), `restored_${motherAssetId}`,
        replacement.sourceSnapshotJson, replacement.generatedImagesJson, replacement.createdAt,
      );
    }
    if (missingMothers) maps.warnings.push(`${missingMothers} 条母组换图记录未找到对应导入资产，已跳过`);
    if (maps.unresolvedCategoryIds.size) {
      maps.warnings.push(`${maps.unresolvedCategoryIds.size} 个旧商品品类 ID 无法映射，相关分类已清空`);
    }
    if (maps.invalidCategoryMetadata) maps.warnings.push(`${maps.invalidCategoryMetadata} 项商品品类适配规则格式无效，已恢复为空列表`);
    if (maps.invalidAssetCategoryLists) maps.warnings.push(`${maps.invalidAssetCategoryLists} 条资产的商品品类列表格式无效，已清空分类`);
    if (maps.albumsWithoutSourceKey) maps.warnings.push(`${maps.albumsWithoutSourceKey} 个图集缺少来源标识，已创建独立图集`);
    if (maps.categoryNameConflicts) maps.warnings.push(`${maps.categoryNameConflicts} 个品类与现有同名品类的适配规则或归档状态不同，已独立导入`);
    if (maps.categoryIdConflicts) maps.warnings.push(`${maps.categoryIdConflicts} 个品类的原 ID 对应不同定义，已按备份内容重新映射`);
    if (maps.categoryPositionConflicts) maps.warnings.push(`${maps.categoryPositionConflicts} 个已存在品类的排序与备份不同，保留目标库排序`);
    if (maps.albumSourceConflicts) maps.warnings.push(`${maps.albumSourceConflicts} 个图集的来源标识已存在，已独立导入`);
    if (maps.unmappedAlbumRefs) maps.warnings.push(`${maps.unmappedAlbumRefs} 条图集关联无法恢复，已清空关联`);
    if (missingScenes) maps.warnings.push(`${missingScenes} 条动作的原场景未包含在备份中，已清空场景关联`);
    return [...new Set(maps.warnings)];
  }, { timeout: 60_000 });
  return { created, warnings };
}
