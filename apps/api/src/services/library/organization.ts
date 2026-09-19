import { prisma } from '../../repositories/db';
import { assetModels, organizationData, validateProductIds } from '@beike/server-kit/assetOrganization';
import { jsonResponse } from '../../core/http';

export async function readOrganization() {
  const [categories, albums] = await Promise.all([
    prisma.assetProductCategory.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    prisma.promptAlbum.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  return jsonResponse({ success: true, categories, albums });
}
export async function mutateOrganization(body: Record<string, any>) {
  try {
    await prisma.$transaction(async tx => {
      if (body.action === 'save-product-category') {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 40) throw new Error('品类名称需为 1–40 个字');
        const existing = body.id ? await tx.assetProductCategory.findUniqueOrThrow({ where: { id: body.id } }) : null;
        const parentId = existing ? existing.parentId : body.parentId || null;
        if (parentId) {
          const parent = await tx.assetProductCategory.findUniqueOrThrow({ where: { id: parentId } });
          if (parent.parentId) throw new Error('商品品类最多两级');
        }
        const duplicate = await tx.assetProductCategory.findFirst({ where: { name, parentId, ...(existing ? { id: { not: existing.id } } : {}) } });
        if (duplicate) throw new Error('同级品类名称已存在');
        if (existing) await tx.assetProductCategory.update({ where: { id: existing.id }, data: { name } });
        else await tx.assetProductCategory.create({ data: { name, parentId, position: await tx.assetProductCategory.count({ where: { parentId } }) } });
      } else if (body.action === 'reorder-product-categories') {
        const ids = body.ids;
        if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('排序数据无效');
        const siblings = await tx.assetProductCategory.findMany({ where: { parentId: body.parentId || null } });
        if (siblings.length !== ids.length || siblings.some(c => !ids.includes(c.id))) throw new Error('排序必须包含全部同级品类');
        for (const [position, id] of ids.entries()) await tx.assetProductCategory.update({ where: { id }, data: { position } });
      } else if (body.action === 'classify-albums') {
        const ids = body.albumIds;
        if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) throw new Error('请选择图集');
        const productCategoryId = body.productCategoryId || null;
        await validateProductIds(tx, productCategoryId ? [productCategoryId] : []);
        if (await tx.promptAlbum.count({ where: { id: { in: ids } } }) !== new Set(ids).size) throw new Error('图集不存在');
        await tx.promptAlbum.updateMany({ where: { id: { in: ids } }, data: { productCategoryId } });
        await tx.fullPromptAsset.updateMany({ where: { albumId: { in: ids } }, data: { productCategoryIds: JSON.stringify(productCategoryId ? [productCategoryId] : []), isUniversal: false } });
      } else if (body.action === 'classify-assets') {
        const model = assetModels[body.assetType as keyof typeof assetModels];
        if (!model || model === 'fullPromptAsset') throw new Error('完整提示词请按图集调整归属');
        const ids = body.ids;
        if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) throw new Error('请选择素材');
        const data = await organizationData(tx, body.assetType, { productCategoryIds: JSON.stringify(body.productCategoryIds || []), isUniversal: body.isUniversal });
        const delegate = tx[model] as typeof tx.sceneAsset;
        if (await delegate.count({ where: { id: { in: ids } } }) !== new Set(ids).size) throw new Error('素材不存在');
        await delegate.updateMany({ where: { id: { in: ids } }, data: { productCategoryIds: data.productCategoryIds, isUniversal: data.isUniversal } });
      } else throw new Error('不支持的品类操作');
    });
    return readOrganization();
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : '分类操作失败' }, 400);
  }
}
