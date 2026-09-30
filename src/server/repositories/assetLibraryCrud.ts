import { db } from './access';
import type { Prisma } from '@prisma/client';
import { withOrganization } from './assetLibraryImport';
import { nextFullPromptDisplayNumber } from '@server/infrastructure/database/fullPromptDisplayNumbers';
import { deleteMotherReplacements } from './motherGroupReplacement';
import { inferPromptGroupSubcategory } from '@shared/domain/workshop/workshopPipeline/groupCategoryFit';
import {
  PROMPT_GROUP_SUBCATEGORIES,
  builtinSubcategoryFolderId,
  isPromptGroupSubcategory,
  isPromptGroupSubcategoryFolderId,
} from '@shared/domain/assets/promptGroupSubcategory';
import { AssetCategoryError, setPromptAlbumMajorCategory, validateMajorCategory } from './assetOrganization';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';

async function validateMotherGroupSubcategory(
  tx: Prisma.TransactionClient, value: unknown, categoryId: string | null,
): Promise<string | null> {
  if (value == null) return null;
  if (isPromptGroupSubcategory(value)) {
    if (categoryId !== 'digital_3c') throw new AssetCategoryError('数码细分只能用于手机数码');
    const archived = await tx.assetProductCategory.findUnique({ where: { id: builtinSubcategoryFolderId(value) } });
    if (archived?.isArchived) throw new AssetCategoryError('商品细分文件夹已删除');
    return value;
  }
  if (!isPromptGroupSubcategoryFolderId(value)) throw new AssetCategoryError('商品二级类目无效');
  const folder = await tx.assetProductCategory.findUnique({ where: { id: value } });
  if (!folder || folder.parentId !== categoryId || folder.isArchived || folder.workspaceId !== requireWorkspaceId()) {
    throw new AssetCategoryError('细分文件夹不属于当前商品大类');
  }
  if (categoryId === 'digital_3c') {
    const builtin = PROMPT_GROUP_SUBCATEGORIES.find(kind => builtinSubcategoryFolderId(kind) === value);
    if (builtin) return builtin;
  }
  return value;
}

export async function validateActionSceneReference(assetType: unknown, data: Record<string, unknown>): Promise<string | null> {
  if (assetType !== 'action' || data.sceneId === undefined || data.sceneId === null || data.sceneId === '') return null;
  if (typeof data.sceneId !== 'string') return '场景 ID 必须为字符串';
  // Scoped reads allow own and official scenes, never another user's scene.
  const scene = await db.sceneAsset.findUnique({ where: { id: data.sceneId }, select: { id: true } });
  return scene ? null : '场景不存在或不属于当前工作区';
}

export async function createLibraryAsset(assetType: string, data: Record<string, any>) {
  let created: any;
  if (assetType === 'scene') {
    created = await db.sceneAsset.create({
      data: {
        title: data.title || '新生活场景',
        description: data.description || '',
        lighting: data.lighting || '自然采光与清晰接触阴影',
        category: data.category || 'general',
        suitableCategories:
          typeof data.suitableCategories === 'string'
            ? data.suitableCategories
            : JSON.stringify(data.suitableCategories || []),
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : data.tags || '',
        coverUrl: data.coverUrl || '',
        sourceImages:
          typeof data.sourceImages === 'string'
            ? data.sourceImages
            : JSON.stringify(data.sourceImages || []),
      },
    });
  } else if (assetType === 'outfit') {
    created = await db.outfitAsset.create({
      data: {
        title: data.title || '新显白穿搭',
        top: data.top || '',
        bottom: data.bottom || '',
        shoes: data.shoes || '',
        colorPalette: data.colorPalette || '',
        category: data.category || 'general',
        suitableCategories:
          typeof data.suitableCategories === 'string'
            ? data.suitableCategories
            : JSON.stringify(data.suitableCategories || []),
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : data.tags || '',
        coverUrl: data.coverUrl || '',
      },
    });
  } else if (assetType === 'action') {
    created = await db.actionAsset.create({
      data: {
        title: data.title || '新抓拍动作',
        action: data.action || '',
        shotType: data.shotType || 'half_body',
        camera: data.camera || 'iPhone 50mm 生活镜头',
        suitableAnatomy:
          typeof data.suitableAnatomy === 'string'
            ? data.suitableAnatomy
            : JSON.stringify(data.suitableAnatomy || ['all']),
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : data.tags || '',
        coverUrl: data.coverUrl || '',
        sceneId: data.sceneId || null,
        shotOrder: typeof data.shotOrder === 'number' ? data.shotOrder : 0,
      },
    });
  } else if (assetType === 'persona') {
    const org = await withOrganization('persona', data);
    created = await db.personaAsset.create({
      data: {
        name: data.name || '新人设博主',
        description: data.description || '',
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : data.tags || '',
        avatarUrl: data.avatarUrl || '',
        albumId: org.albumId as string | null,
        productCategoryIds: String(org.productCategoryIds || '[]'),
        isUniversal: org.isUniversal === true,
      },
    });
  } else if (assetType === 'full_prompt') {
    created = await db.$transaction(async tx => {
      const org = await withOrganization('full_prompt', data, tx);
      const albumId = org.albumId as string;
      const album = await tx.promptAlbum.findUniqueOrThrow({ where: { id: albumId } });
      const explicitCategory = data.productCategoryIds !== undefined;
      const inferredSubcategory = data.productSubcategory === undefined
        ? inferPromptGroupSubcategory({ title: data.title, shotPromptsJson: data.shotPromptsJson })
        : data.productSubcategory;
      let categoryId = explicitCategory
        ? await validateMajorCategory(tx, data.productCategoryIds)
        : album.productCategoryId;
      if (!explicitCategory && !categoryId && isPromptGroupSubcategory(inferredSubcategory)) {
        categoryId = await validateMajorCategory(tx, '["digital_3c"]');
      }
      const archivedInferred = data.productSubcategory === undefined && isPromptGroupSubcategory(inferredSubcategory)
        ? (await tx.assetProductCategory.findUnique({ where: { id: builtinSubcategoryFolderId(inferredSubcategory) } }))?.isArchived
        : false;
      const productSubcategory = await validateMotherGroupSubcategory(
        tx, archivedInferred ? null : (categoryId === 'digital_3c' || data.productSubcategory !== undefined ? inferredSubcategory : null), categoryId,
      );
      if (album.productCategoryId !== categoryId) {
        await setPromptAlbumMajorCategory(tx, albumId, categoryId);
      }
      const displayNumber = await nextFullPromptDisplayNumber(tx);
      return tx.fullPromptAsset.create({ data: {
        displayNumber,
        title: data.title || '新完整反推提示词',
        albumName: String(org.albumName || data.albumName || ''),
        reversePromptZh: data.reversePromptZh || '',
        reversePromptEn: data.reversePromptEn || '',
        dimensions:
          typeof data.dimensions === 'string'
            ? data.dimensions
            : JSON.stringify(data.dimensions || {}),
        imageType: data.imageType || 'photography',
        sourceImageIndex: data.sourceImageIndex || 1,
        coverUrl: data.coverUrl || '',
        sourceImages:
          typeof data.sourceImages === 'string'
            ? data.sourceImages
            : JSON.stringify(data.sourceImages || []),
        hasHuman: data.hasHuman !== false,
        shotFraming: data.shotFraming || 'medium_full_body',
        sceneSummary: data.sceneSummary || '',
        outfitSummary: data.outfitSummary || '',
        actionSummary: data.actionSummary || '',
        personaSummary: data.personaSummary || '',
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : data.tags || '',
        category: data.category || 'general',
        productSubcategory,
        provenance: data.provenance || 'manual',
        albumId,
        productCategoryIds: JSON.stringify(categoryId ? [categoryId] : []),
        isUniversal: false,
      } });
    });
  } else {
    return null;
  }

  return created;
}

export async function updateLibraryAsset(assetType: string, id: string, data: Record<string, any>) {
  let updated: any;
  if (assetType === 'scene') {
    updated = await db.sceneAsset.update({
      where: { id },
      data,
    });
  } else if (assetType === 'outfit') {
    updated = await db.outfitAsset.update({
      where: { id },
      data,
    });
  } else if (assetType === 'action') {
    updated = await db.actionAsset.update({
      where: { id },
      data,
    });
  } else if (assetType === 'persona') {
    updated = await db.personaAsset.update({
      where: { id },
      data,
    });
  } else if (assetType === 'full_prompt') {
    const safeData = { ...data };
    delete safeData.displayNumber;
    updated = await db.$transaction(async tx => {
      const current = await tx.fullPromptAsset.findUnique({ where: { id } });
      if (!current) throw new AssetCategoryError('图组不存在');
      if (current.workspaceId !== requireWorkspaceId()) throw new AssetCategoryError('官方图组不可修改');
      if ('albumId' in safeData && safeData.albumId !== current.albumId) {
        throw new AssetCategoryError('请通过图集管理调整图组归属');
      }
      if ('productCategoryIds' in safeData) {
        const categoryId = await validateMajorCategory(tx, safeData.productCategoryIds);
        if ('productSubcategory' in safeData) safeData.productSubcategory = await validateMotherGroupSubcategory(tx, safeData.productSubcategory, categoryId);
        if (current.albumId) await setPromptAlbumMajorCategory(tx, current.albumId, categoryId);
        safeData.productCategoryIds = JSON.stringify(categoryId ? [categoryId] : []);
        if (categoryId !== JSON.parse(current.productCategoryIds || '[]')[0] && !('productSubcategory' in safeData)) safeData.productSubcategory = null;
      } else if (safeData.productSubcategory != null) {
        const currentCategories = JSON.parse(current.productCategoryIds || '[]') as unknown;
        const categoryIds = Array.isArray(currentCategories) ? currentCategories : [];
        let categoryId = typeof categoryIds[0] === 'string' ? categoryIds[0] : null;
        if (!categoryId) {
          if (isPromptGroupSubcategory(safeData.productSubcategory)) categoryId = 'digital_3c';
          else if (isPromptGroupSubcategoryFolderId(safeData.productSubcategory)) {
            categoryId = (await tx.assetProductCategory.findUnique({ where: { id: safeData.productSubcategory } }))?.parentId || null;
          }
          if (!categoryId) throw new AssetCategoryError('请先选择商品大类');
          categoryId = await validateMajorCategory(tx, JSON.stringify([categoryId]));
          if (current.albumId) await setPromptAlbumMajorCategory(tx, current.albumId, categoryId);
          safeData.productCategoryIds = JSON.stringify([categoryId]);
        }
        safeData.productSubcategory = await validateMotherGroupSubcategory(tx, safeData.productSubcategory, categoryId);
      }
      return tx.fullPromptAsset.update({ where: { id }, data: safeData });
    });
  } else {
    return null;
  }

  return updated;
}

export async function prepareAssetDeletion(assetType: string, idsToDelete: string[]) {
  const mediaUrlsToDelete: string[] = [];
  let deleteRecords: () => Promise<{ count: number }>; 
  if (assetType === 'scene') {
    const records = await db.sceneAsset.findMany({
      where: { id: { in: idsToDelete } },
      select: { coverUrl: true, sourceImages: true },
    });
    for (const r of records) {
      if (r.coverUrl) mediaUrlsToDelete.push(r.coverUrl);
      if (r.sourceImages) {
        try {
          const arr = JSON.parse(r.sourceImages);
          if (Array.isArray(arr)) mediaUrlsToDelete.push(...arr.filter(Boolean));
        } catch {
          /* ignore json parse */
        }
      }
    }
    deleteRecords = () => db.sceneAsset.deleteMany({ where: { id: { in: idsToDelete } } });
  } else if (assetType === 'outfit') {
    const records = await db.outfitAsset.findMany({
      where: { id: { in: idsToDelete } },
      select: { coverUrl: true },
    });
    for (const r of records) {
      if (r.coverUrl) mediaUrlsToDelete.push(r.coverUrl);
    }
    deleteRecords = () => db.outfitAsset.deleteMany({ where: { id: { in: idsToDelete } } });
  } else if (assetType === 'action') {
    const records = await db.actionAsset.findMany({
      where: { id: { in: idsToDelete } },
      select: { coverUrl: true },
    });
    for (const r of records) {
      if (r.coverUrl) mediaUrlsToDelete.push(r.coverUrl);
    }
    deleteRecords = () => db.actionAsset.deleteMany({ where: { id: { in: idsToDelete } } });
  } else if (assetType === 'persona') {
    const records = await db.personaAsset.findMany({
      where: { id: { in: idsToDelete } },
      select: { avatarUrl: true },
    });
    for (const r of records) {
      if (r.avatarUrl) mediaUrlsToDelete.push(r.avatarUrl);
    }
    deleteRecords = () => db.personaAsset.deleteMany({ where: { id: { in: idsToDelete } } });
  } else if (assetType === 'full_prompt') {
    const workspaceId = requireWorkspaceId();
    deleteRecords = () => db.$transaction(async tx => {
      const where = { id: { in: idsToDelete }, workspaceId };
      if (await tx.fullPromptAsset.count({ where }) !== new Set(idsToDelete).size) {
        throw new Error('所选母组不存在或不可删除');
      }
      await deleteMotherReplacements(tx, idsToDelete);
      return tx.fullPromptAsset.deleteMany({ where });
    });
  } else {
    return null;
  }

  return { mediaUrlsToDelete, deleteRecords };
}
