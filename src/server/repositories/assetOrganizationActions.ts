import { db } from './access';
import { randomUUID } from 'node:crypto';
import {
  PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX,
  PROMPT_GROUP_SUBCATEGORY_LABELS,
  builtinSubcategoryFolderId,
  isPromptGroupSubcategory,
  isPromptGroupSubcategoryFolderId,
} from '@shared/domain/assets/promptGroupSubcategory';
import { requireWorkspaceId } from '../infrastructure/workspace/workspaceContext';
import { assetModels, organizationData, setPromptAlbumMajorCategory, validateMajorCategory } from './assetOrganization';
import { archivePromptFolders, movePromptGroups } from './promptFolderActions';
import { savePromptFolderRules, importPromptFolderRules } from './promptFolderRules';

export async function listAssetOrganization() {
  const [categories, albums] = await Promise.all([
    db.assetProductCategory.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    db.promptAlbum.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  const workspaceId = requireWorkspaceId();
  return { categories: categories.map(row => ({
    ...row, isReadOnly: row.workspaceId !== workspaceId || Boolean(row.parentId && !categories.some(parent => parent.id === row.parentId && parent.workspaceId === workspaceId && !parent.isArchived)),
  })), albums };
}

export async function applyAssetOrganizationMutation(body: Record<string, any>) {
    return db.$transaction(async tx => {
      if (body.action === 'save-prompt-folder-rules') {
        return savePromptFolderRules(tx, body);
      } else if (body.action === 'import-prompt-folder-rules') {
        return importPromptFolderRules(tx, body);
      } else if (body.action === 'save-product-category') {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 40) throw new Error('品类名称需为 1–40 个字');
        const existing = body.id ? await tx.assetProductCategory.findUniqueOrThrow({ where: { id: body.id } }) : null;
        if (existing?.isArchived) throw new Error('文件夹已删除，请刷新后重试');
        const parentId = existing ? existing.parentId : body.parentId || null;
        if (parentId) {
          const parent = await tx.assetProductCategory.findUniqueOrThrow({ where: { id: parentId } });
          if (parent.parentId) throw new Error('商品品类最多两级');
          if (parent.isArchived) throw new Error('父文件夹已删除，不可编辑');
        }
        const sameName = await tx.assetProductCategory.findMany({ where: { name, parentId, ...(existing ? { id: { not: existing.id } } : {}) } });
        const duplicate = sameName.find(category => !category.isArchived) || sameName[0];
        if (duplicate && !duplicate.isArchived) throw new Error('同级品类名称已存在');
        if (existing) await tx.assetProductCategory.update({ where: { id: existing.id }, data: { name, isArchived: false } });
        else if (duplicate) await tx.assetProductCategory.update({ where: { id: duplicate.id }, data: { isArchived: false } });
        else await tx.assetProductCategory.create({ data: { name, parentId, workspaceId: requireWorkspaceId(), position: await tx.assetProductCategory.count({ where: { parentId } }) } });
      } else if (body.action === 'save-prompt-subcategory') {
        const parentId = typeof body.parentId === 'string' ? body.parentId : '';
        const value = typeof body.value === 'string' ? body.value : null;
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 40) throw new Error('文件夹名称需为 1–40 个字');
        const parent = await tx.assetProductCategory.findUnique({ where: { id: parentId } });
        if (!parent || parent.parentId || parent.isArchived || ![requireWorkspaceId(), 'legacy'].includes(parent.workspaceId)) throw new Error('商品大类不存在或不可编辑');
        if (value && !isPromptGroupSubcategory(value) && !isPromptGroupSubcategoryFolderId(value)) throw new Error('细分文件夹无效');
        if (isPromptGroupSubcategory(value) && parentId !== 'digital_3c') throw new Error('数码细分只能用于手机数码');
        const builtin = !value && parentId === 'digital_3c'
          ? (Object.keys(PROMPT_GROUP_SUBCATEGORY_LABELS) as Array<keyof typeof PROMPT_GROUP_SUBCATEGORY_LABELS>)
            .find(kind => PROMPT_GROUP_SUBCATEGORY_LABELS[kind] === name)
          : null;
        const archivedSibling = !value ? await tx.assetProductCategory.findFirst({ where: { parentId, name, isArchived: true } }) : null;
        const id = isPromptGroupSubcategory(value) ? builtinSubcategoryFolderId(value)
          : value || archivedSibling?.id || (builtin ? builtinSubcategoryFolderId(builtin) : `${PROMPT_GROUP_SUBCATEGORY_FOLDER_PREFIX}${randomUUID()}`);
        const existing = await tx.assetProductCategory.findUnique({ where: { id } });
        if (value && existing?.isArchived) throw new Error('文件夹已删除，请刷新后重试');
        if (value && isPromptGroupSubcategoryFolderId(value) && (!existing || existing.parentId !== parentId)) throw new Error('细分文件夹不存在');
        if (existing && existing.parentId !== parentId) throw new Error('细分文件夹不属于当前大类');
        const siblings = await tx.assetProductCategory.findMany({ where: { parentId } });
        const siblingNames = siblings.filter(category => category.id !== id && !category.isArchived && isPromptGroupSubcategoryFolderId(category.id)).map(category => category.name);
        if (parentId === 'digital_3c') {
          for (const kind of Object.keys(PROMPT_GROUP_SUBCATEGORY_LABELS) as Array<keyof typeof PROMPT_GROUP_SUBCATEGORY_LABELS>) {
            const folderId = builtinSubcategoryFolderId(kind);
            if (folderId !== id && !siblings.some(category => category.id === folderId)) siblingNames.push(PROMPT_GROUP_SUBCATEGORY_LABELS[kind]);
          }
        }
        if (siblingNames.includes(name)) throw new Error('同级文件夹名称已存在');
        if (existing) await tx.assetProductCategory.update({ where: { id }, data: { name, isArchived: false } });
        else await tx.assetProductCategory.create({ data: {
          id, workspaceId: requireWorkspaceId(), name, parentId,
          position: await tx.assetProductCategory.count({ where: { parentId } }),
        } });
      } else if (body.action === 'archive-prompt-folders') {
        return archivePromptFolders(tx, body);
      } else if (body.action === 'move-prompt-groups') {
        return movePromptGroups(tx, body);
      } else if (body.action === 'reorder-product-categories') {
        const ids = body.ids;
        if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('排序数据无效');
        const siblings = await tx.assetProductCategory.findMany({ where: { parentId: body.parentId || null } });
        if (siblings.length !== ids.length || siblings.some(c => !ids.includes(c.id))) throw new Error('排序必须包含全部同级品类');
        for (const [position, id] of ids.entries()) await tx.assetProductCategory.update({ where: { id }, data: { position } });
      } else if (body.action === 'classify-albums') {
        const ids = body.albumIds;
        if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) throw new Error('请选择图集');
        const productCategoryId = await validateMajorCategory(tx, JSON.stringify(body.productCategoryId ? [body.productCategoryId] : []));
        if (await tx.promptAlbum.count({ where: { id: { in: ids } } }) !== new Set(ids).size) throw new Error('图集不存在');
        for (const id of ids) await setPromptAlbumMajorCategory(tx, id, productCategoryId);
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
}
