import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { categoryIds, categoryScope } from '@beike/domain/assetOrganization';
import { albumSourceKey } from './database/assetOrganization';
import { requireWorkspaceId } from './workspaceContext';

export const assetModels = { full_prompt: 'fullPromptAsset', persona: 'personaAsset', scene: 'sceneAsset', scene_bundle: 'sceneAsset', outfit: 'outfitAsset', action: 'actionAsset' } as const;
export async function validateProductIds(db: Prisma.TransactionClient, ids: string[]) {
  if ((await db.assetProductCategory.count({ where: { id: { in: ids } } })) !== ids.length) throw new Error('商品品类不存在');
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
