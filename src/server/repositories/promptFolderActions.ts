import type { Prisma } from '@prisma/client';
import { categoryIds } from '@shared/domain/assets/assetOrganization';
import {
  PROMPT_GROUP_SUBCATEGORIES,
  PROMPT_GROUP_SUBCATEGORY_LABELS,
  builtinSubcategoryFolderId,
  isPromptGroupSubcategory,
  isPromptGroupSubcategoryFolderId,
} from '@shared/domain/assets/promptGroupSubcategory';
import { requireWorkspaceId } from '../infrastructure/workspace/workspaceContext';
import { setPromptAlbumMajorCategory, validateMajorCategory } from './assetOrganization';

type Transaction = Prisma.TransactionClient;

function selectedIds(raw: unknown, label: string, limit = 100): string[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > limit || raw.some(id => typeof id !== 'string' || !id.trim())) {
    throw new Error(`请选择 1–${limit} 个${label}`);
  }
  return [...new Set(raw)];
}

async function releaseCategoryReferences(tx: Transaction, ids: string[], workspaceId: string) {
  const removed = new Set(ids);
  const withoutRemoved = (value: string) => JSON.stringify(categoryIds(value).filter(id => !removed.has(id)));
  const where = { workspaceId };
  const [groups, personas, scenes, outfits, actions] = await Promise.all([
    tx.fullPromptAsset.findMany({ where, select: { id: true, productCategoryIds: true } }),
    tx.personaAsset.findMany({ where, select: { id: true, productCategoryIds: true } }),
    tx.sceneAsset.findMany({ where, select: { id: true, productCategoryIds: true } }),
    tx.outfitAsset.findMany({ where, select: { id: true, productCategoryIds: true } }),
    tx.actionAsset.findMany({ where, select: { id: true, productCategoryIds: true } }),
  ]);
  for (const row of groups) {
    if (!categoryIds(row.productCategoryIds).some(id => removed.has(id))) continue;
    await tx.fullPromptAsset.update({ where: { id: row.id }, data: {
      productCategoryIds: withoutRemoved(row.productCategoryIds), productSubcategory: null,
    } });
  }
  for (const row of personas) {
    if (categoryIds(row.productCategoryIds).some(id => removed.has(id))) {
      await tx.personaAsset.update({ where: { id: row.id }, data: { productCategoryIds: withoutRemoved(row.productCategoryIds) } });
    }
  }
  for (const row of scenes) {
    if (categoryIds(row.productCategoryIds).some(id => removed.has(id))) {
      await tx.sceneAsset.update({ where: { id: row.id }, data: { productCategoryIds: withoutRemoved(row.productCategoryIds) } });
    }
  }
  for (const row of outfits) {
    if (categoryIds(row.productCategoryIds).some(id => removed.has(id))) {
      await tx.outfitAsset.update({ where: { id: row.id }, data: { productCategoryIds: withoutRemoved(row.productCategoryIds) } });
    }
  }
  for (const row of actions) {
    if (categoryIds(row.productCategoryIds).some(id => removed.has(id))) {
      await tx.actionAsset.update({ where: { id: row.id }, data: { productCategoryIds: withoutRemoved(row.productCategoryIds) } });
    }
  }
  return groups.filter(row => categoryIds(row.productCategoryIds).some(id => removed.has(id))).length;
}

/** Removing a folder removes its classification, never the assets inside it. */
export async function archivePromptFolders(tx: Transaction, body: Record<string, unknown>) {
  const ids = selectedIds(body.ids, '文件夹');
  const parentId = typeof body.parentId === 'string' ? body.parentId : null;
  if (ids.includes('unclassified') || ids.includes('universal')) throw new Error('系统分类不可删除');
  const workspaceId = requireWorkspaceId();
  if (parentId) {
    const parent = await tx.assetProductCategory.findUnique({ where: { id: parentId } });
    if (!parent || parent.parentId || parent.isArchived || parent.workspaceId !== workspaceId) throw new Error('商品大类不存在或不可编辑');
    let releasedCount = 0;
    for (const value of ids) {
      if (!isPromptGroupSubcategory(value) && !isPromptGroupSubcategoryFolderId(value)) throw new Error('细分文件夹无效');
      const builtin = isPromptGroupSubcategory(value) ? value
        : PROMPT_GROUP_SUBCATEGORIES.find(kind => builtinSubcategoryFolderId(kind) === value);
      const id = builtin ? builtinSubcategoryFolderId(builtin) : value;
      const existing = await tx.assetProductCategory.findUnique({ where: { id } });
      if (existing && (existing.parentId !== parentId || existing.workspaceId !== workspaceId)) throw new Error('文件夹不属于当前工作区');
      if (!existing && !builtin) throw new Error('文件夹不存在');
      if (builtin && parentId !== 'digital_3c') throw new Error('数码细分只能用于手机数码');
      if (existing) await tx.assetProductCategory.update({ where: { id }, data: { isArchived: true } });
      else await tx.assetProductCategory.create({ data: {
        id, parentId, workspaceId, name: PROMPT_GROUP_SUBCATEGORY_LABELS[builtin!],
        isArchived: true, position: await tx.assetProductCategory.count({ where: { parentId } }),
      } });
      const values = builtin ? [builtin, id] : [value];
      const candidates = await tx.fullPromptAsset.findMany({
        where: { workspaceId, productSubcategory: { in: values } },
        select: { id: true, albumId: true, productCategoryIds: true },
      });
      const albumIds = [...new Set(candidates.map(group => group.albumId).filter((albumId): albumId is string => !!albumId))];
      const albums = await tx.promptAlbum.findMany({ where: { id: { in: albumIds } }, select: { id: true, productCategoryId: true } });
      const albumCategories = new Map(albums.map(album => [album.id, album.productCategoryId]));
      const affectedIds = candidates.filter(group => categoryIds(group.productCategoryIds).includes(parentId)
        || (!group.productCategoryIds.trim() && group.albumId && albumCategories.get(group.albumId) === parentId)).map(group => group.id);
      const updated = await tx.fullPromptAsset.updateMany({ where: { id: { in: affectedIds } }, data: { productSubcategory: null } });
      releasedCount += updated.count;
    }
    return { archivedCount: ids.length, releasedCount };
  }

  const folders = await tx.assetProductCategory.findMany({ where: { id: { in: ids }, parentId: null } });
  if (folders.length !== ids.length || folders.some(folder => folder.workspaceId !== workspaceId)) throw new Error('商品大类不存在或不可删除');
  const children = await tx.assetProductCategory.findMany({ where: { parentId: { in: ids } }, select: { id: true } });
  const removedIds = [...ids, ...children.map(child => child.id)];
  const albums = await tx.promptAlbum.findMany({ where: { workspaceId, productCategoryId: { in: ids } }, select: { id: true } });
  for (const album of albums) await setPromptAlbumMajorCategory(tx, album.id, null);
  const releasedCount = await releaseCategoryReferences(tx, removedIds, workspaceId);
  await tx.assetProductCategory.updateMany({ where: { id: { in: ids } }, data: { isArchived: true } });
  return { archivedCount: ids.length, releasedCount };
}

/** Album siblings share the major category; only selected groups receive the target subcategory. */
export async function movePromptGroups(tx: Transaction, body: Record<string, unknown>) {
  const ids = selectedIds(body.ids, '母组', 200);
  const categoryId = typeof body.productCategoryId === 'string' && body.productCategoryId ? body.productCategoryId : null;
  const subcategory = typeof body.productSubcategory === 'string' && body.productSubcategory ? body.productSubcategory : null;
  await validateMajorCategory(tx, JSON.stringify(categoryId ? [categoryId] : []));
  if (subcategory) {
    if (!categoryId) throw new Error('请先选择商品大类');
    if (isPromptGroupSubcategory(subcategory)) {
      if (categoryId !== 'digital_3c') throw new Error('数码细分只能用于手机数码');
      const builtin = await tx.assetProductCategory.findUnique({ where: { id: builtinSubcategoryFolderId(subcategory) } });
      if (builtin?.isArchived) throw new Error('目标文件夹已删除');
    } else if (isPromptGroupSubcategoryFolderId(subcategory)) {
      const folder = await tx.assetProductCategory.findUnique({ where: { id: subcategory } });
      if (!folder || folder.parentId !== categoryId || folder.isArchived || folder.workspaceId !== requireWorkspaceId()) throw new Error('目标文件夹不存在');
    } else throw new Error('商品细分无效');
  }
  const selected = await tx.fullPromptAsset.findMany({ where: { id: { in: ids } }, select: { id: true, albumId: true, workspaceId: true } });
  if (selected.length !== ids.length) throw new Error('母组不存在或不可移动');
  if (selected.some(row => row.workspaceId !== requireWorkspaceId())) throw new Error('官方母组不可移动');
  const albumIds = [...new Set(selected.map(row => row.albumId).filter((id): id is string => !!id))];
  const affected = await tx.fullPromptAsset.findMany({
    where: { OR: [{ id: { in: ids } }, { albumId: { in: albumIds } }] }, select: { id: true },
  });
  for (const albumId of albumIds) await setPromptAlbumMajorCategory(tx, albumId, categoryId);
  await tx.fullPromptAsset.updateMany({ where: { id: { in: ids } }, data: {
    productCategoryIds: JSON.stringify(categoryId ? [categoryId] : []), productSubcategory: subcategory, isUniversal: false,
  } });
  return { movedCount: ids.length, affectedCount: affected.length };
}
