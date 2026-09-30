import { validateAssetEdit } from '@shared/domain/assets/assetEdit';
import { isValidPromptGroupSubcategoryValue } from '@shared/domain/assets/promptGroupSubcategory';
import { readJsonBody } from '../../../../core/validate';
import { jsonResponse } from '../../../../core/http';
import { queueMediaReview } from '../../../../services/library/mediaReviewQueue';
import { mutateOrganization } from './organization';
import { validateActionSceneReference, createLibraryAsset, updateLibraryAsset, prepareAssetDeletion } from '@server/repositories/assetLibraryCrud';
import { bulkImportAssets } from '@server/repositories/assetLibraryBulkImport';
import { AssetCategoryError } from '@server/repositories/assetOrganization';

// 创建单项或批量导入原子资产
export async function executeLibraryPost(req: Request) {
  const body = await readJsonBody(req);

  if (typeof body.action === 'string' && [
    'save-product-category',
    'save-prompt-subcategory',
    'save-prompt-folder-rules',
    'import-prompt-folder-rules',
    'archive-prompt-folders',
    'move-prompt-groups',
    'reorder-product-categories',
    'classify-albums',
    'classify-assets',
  ].includes(body.action)) {
    return mutateOrganization(body);
  }

  if (body.action === 'bulk-import' && Array.isArray(body.items)) {
    const items = body.items as Array<{ assetType: string; data: Record<string, unknown>; sourceId?: string }>;
    const { created, warnings } = await bulkImportAssets(body, items);
    return jsonResponse({ success: true, count: created.length, items: created, warnings });
  }

  const { assetType, data } = body;

  if (!assetType || !data) {
    return jsonResponse({ error: '缺少 assetType 或 data' }, 400);
  }

  const sceneError = await validateActionSceneReference(assetType, data);
  if (sceneError) return jsonResponse({ success: false, error: sceneError }, 400);
  if (assetType === 'full_prompt' && data.productSubcategory !== undefined
    && data.productSubcategory !== null && !isValidPromptGroupSubcategoryValue(data.productSubcategory)) {
    return jsonResponse({ success: false, error: '商品二级类目无效' }, 400);
  }

  let created;
  try { created = await createLibraryAsset(assetType, data); }
  catch (error) {
    if (error instanceof AssetCategoryError) return jsonResponse({ success: false, error: error.message }, error.status);
    throw error;
  }
  if (!created) return jsonResponse({ error: `不支持的资产类型: ${assetType}` }, 400);

  if (created?.id && ['scene', 'outfit', 'action', 'persona', 'full_prompt'].includes(assetType)) {
    const { ensureRegistryForAsset } = await import('../../../../services/promptAsset/registry');
    await ensureRegistryForAsset(assetType, created.id, created.provenance).catch(() => null);
  }
  return jsonResponse({ success: true, item: created });
}

// 修改原子资产（编辑、修改收藏状态、增加调用计数）
export async function executeLibraryPut(req: Request) {
  const body = await readJsonBody(req);
  const { assetType, id, data } = body;

  if (!assetType || !id || !data) {
    return jsonResponse({ error: '缺少 assetType、id 或 data' }, 400);
  }

  const validationError = validateAssetEdit(assetType, data);
  if (validationError) return jsonResponse({ success: false, error: validationError }, 400);

  const sceneError = await validateActionSceneReference(assetType, data);
  if (sceneError) return jsonResponse({ success: false, error: sceneError }, 400);

  let updated;
  try { updated = await updateLibraryAsset(assetType, id, data); }
  catch (error) {
    if (error instanceof AssetCategoryError) return jsonResponse({ success: false, error: error.message }, error.status);
    throw error;
  }
  if (!updated) return jsonResponse({ error: `不支持的资产类型: ${assetType}` }, 400);

  return jsonResponse({ success: true, item: updated });
}

// 删除指定 ID 资产及关联媒体
export async function executeLibraryDeleteByIds(assetType: string, idsToDelete: string[]) {
  const deletion = await prepareAssetDeletion(assetType, idsToDelete);
  if (!deletion) return jsonResponse({ error: `不支持的资产类型: ${assetType}` }, 400);

  if (deletion.mediaUrlsToDelete.length > 0) {
    await queueMediaReview(deletion.mediaUrlsToDelete, { assetType, ids: idsToDelete });
  }

  const deleted = await deletion.deleteRecords();
  return jsonResponse({ success: true, count: deleted.count, ids: idsToDelete });
}
