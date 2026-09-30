import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { categoryIds, categoryScope } from '@shared/domain/assets/assetOrganization';
import { albumSourceKey } from '../infrastructure/database/assetOrganization';
import { requireWorkspaceId } from '../infrastructure/workspace/workspaceContext';
import { db } from './access';

export const assetModels = { full_prompt: 'fullPromptAsset', persona: 'personaAsset', scene: 'sceneAsset', scene_bundle: 'sceneAsset', outfit: 'outfitAsset', action: 'actionAsset' } as const;
export class AssetCategoryError extends Error {
  readonly status = 400;
}
export async function validateProductIds(db: Prisma.TransactionClient, ids: string[]) {
  if ((await db.assetProductCategory.count({ where: { id: { in: ids } } })) !== ids.length) throw new Error('商品品类不存在');
}

/** A mother group belongs to one major product category, shared by every group in its album. */
export async function validateMajorCategory(db: Prisma.TransactionClient, raw: unknown): Promise<string | null> {
  if (typeof raw !== 'string') throw new AssetCategoryError('商品大类必须为 JSON 数组');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new AssetCategoryError('商品大类必须为 JSON 数组'); }
  if (!Array.isArray(parsed) || parsed.length > 1 || parsed.some(id => typeof id !== 'string' || !id.trim())) {
    throw new AssetCategoryError('图组只能选择一个商品大类');
  }
  if (!parsed.length) return null;
  const category = await db.assetProductCategory.findUnique({ where: { id: parsed[0] } });
  if (!category) throw new AssetCategoryError('商品大类不存在');
  if (category.parentId || category.isArchived) throw new AssetCategoryError('请选择可用的商品大类');
  return category.id;
}

export async function setPromptAlbumMajorCategory(db: Prisma.TransactionClient, albumId: string, categoryId: string | null) {
  const album = await db.promptAlbum.findUnique({ where: { id: albumId } });
  if (!album) throw new AssetCategoryError('图集不存在');
  if (album.workspaceId !== requireWorkspaceId()) throw new AssetCategoryError('官方图集不可修改');
  await db.promptAlbum.update({ where: { id: albumId }, data: { productCategoryId: categoryId } });
  await db.fullPromptAsset.updateMany({
    where: { albumId },
    data: {
      productCategoryIds: JSON.stringify(categoryId ? [categoryId] : []),
      productSubcategory: album.productCategoryId === categoryId ? undefined : null,
      isUniversal: false,
    },
  });
}
export async function ensurePromptAlbum(db: Prisma.TransactionClient, data: { albumId?: unknown; albumName?: unknown; sourceImages?: unknown; productCategoryIds?: unknown }, fallback = randomUUID()) {
  if (data.albumId) return db.promptAlbum.findUniqueOrThrow({ where: { id: String(data.albumId) } });
  const ids = categoryIds(data.productCategoryIds);
  if (ids.length > 1) throw new Error('完整提示词只能归属一个商品品类');
  await validateProductIds(db, ids);
  const name = typeof data.albumName === 'string' && data.albumName.trim() ? data.albumName.trim() : '未命名图集';
  const sourceKey = albumSourceKey(name, data.sourceImages, fallback);
  const workspaceId = requireWorkspaceId();
  return db.promptAlbum.upsert({ where: { workspaceId_sourceKey: { workspaceId, sourceKey } }, update: {}, create: { name, sourceKey, productCategoryId: ids[0] || null, workspaceId } });
}
export async function organizationData(db: Prisma.TransactionClient, type: string, data: Record<string, unknown>) {
  if (data.productCategoryIds !== undefined) {
    if (typeof data.productCategoryIds !== 'string') throw new Error('商品品类必须为 JSON 数组');
    const parsed = JSON.parse(data.productCategoryIds);
    if (!Array.isArray(parsed) || parsed.some(id => typeof id !== 'string')) throw new Error('商品品类必须为 JSON 数组');
  }
  if (data.isUniversal !== undefined && typeof data.isUniversal !== 'boolean') throw new Error('通用标记必须为布尔值');
  if (type === 'full_prompt') {
    const album = await ensurePromptAlbum(db, data);
    return { albumId: album.id, albumName: album.name, productCategoryIds: JSON.stringify(album.productCategoryId ? [album.productCategoryId] : []), isUniversal: false };
  }
  const ids = categoryIds(data.productCategoryIds);
  await validateProductIds(db, ids);
  if (data.albumId && !await db.promptAlbum.findUnique({ where: { id: String(data.albumId) } })) throw new Error('图集不存在');
  return { albumId: data.albumId ? String(data.albumId) : null, productCategoryIds: JSON.stringify(ids), isUniversal: data.isUniversal === true };
}
export async function organizationWhere(db: Prisma.TransactionClient, params: URLSearchParams) {
  const selected = params.get('productCategoryId');
  const albumId = params.get('albumId');
  const clauses: Record<string, unknown>[] = albumId ? [{ albumId }] : [];
  if (selected && selected !== 'all') {
    if (selected === 'unclassified') clauses.push({ productCategoryIds: '[]', isUniversal: false });
    else {
      const categories = await db.assetProductCategory.findMany();
      const scope = categoryScope(categories, selected);
      const alternatives: Record<string, unknown>[] = scope.map(id => ({ productCategoryIds: { contains: JSON.stringify(id) } }));
      if (params.get('includeUniversal') !== 'false') alternatives.push({ isUniversal: true });
      clauses.push({ OR: alternatives });
    }
  }
  return clauses;
}

export function organizationWhereForSearch(params: URLSearchParams) {
  return organizationWhere(db, params);
}
