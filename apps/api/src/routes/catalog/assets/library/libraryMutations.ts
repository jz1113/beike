import { validateAssetEdit, pickAssetEditFields } from '@beike/domain/assetEdit';
import { readJsonBody } from '../../../../core/validate';
import { jsonResponse } from '../../../../core/http';
import { db } from '../../../../repositories/access';
import { queueMediaReview } from '../../../../services/mediaReviewQueue';
import { mutateOrganization } from '../../../../services/library/organization';
import { importLibraryBackup, remapItemData, withOrganization } from './libraryImport';

async function validateActionSceneReference(assetType: unknown, data: Record<string, unknown>): Promise<string | null> {
  if (assetType !== 'action' || data.sceneId === undefined || data.sceneId === null || data.sceneId === '') return null;
  if (typeof data.sceneId !== 'string') return '场景 ID 必须为字符串';
  // Scoped reads allow own and official scenes, never another user's scene.
  const scene = await db.sceneAsset.findUnique({ where: { id: data.sceneId }, select: { id: true } });
  return scene ? null : '场景不存在或不属于当前工作区';
}

// 创建单项或批量导入原子资产
export async function executeLibraryPost(req: Request) {
  const body = await readJsonBody(req);

  if (typeof body.action === 'string' && [
    'save-product-category',
    'reorder-product-categories',
    'classify-albums',
    'classify-assets',
  ].includes(body.action)) {
    return mutateOrganization(body);
  }

  if (body.action === 'bulk-import' && Array.isArray(body.items)) {
    const items = body.items as Array<{ assetType: string; data: Record<string, unknown>; sourceId?: string }>;
    const created: unknown[] = [];
    const sceneIds = new Map<string, string>();
    const maps = await importLibraryBackup(body, created);
    await db.$transaction(async (tx) => {
      for (const item of [...items].sort((a, b) => Number(b.assetType === 'scene') - Number(a.assetType === 'scene'))) {
        const { assetType } = item;
        const data = await withOrganization(assetType, remapItemData(pickAssetEditFields(assetType, item.data || {}), maps));
        const error = validateAssetEdit(assetType, pickAssetEditFields(assetType, data));
        if (error) throw new Error(error);
        if (assetType === 'action') {
          const actionData = data as { sceneId?: string | null };
          if (actionData.sceneId) actionData.sceneId = sceneIds.get(String(actionData.sceneId)) || null;
        }
        if (!assetType || !data) continue;
        if (assetType === 'scene') {
          const scene = await tx.sceneAsset.create({ data: data as any });
          if (item.sourceId) sceneIds.set(item.sourceId, scene.id);
          created.push(scene);
        } else if (assetType === 'outfit') {
          created.push(await tx.outfitAsset.create({ data: data as any }));
        } else if (assetType === 'action') {
          created.push(await tx.actionAsset.create({ data: data as any }));
        } else if (assetType === 'persona') {
          created.push(await tx.personaAsset.create({ data: data as any }));
        } else if (assetType === 'full_prompt') {
          created.push(await tx.fullPromptAsset.create({ data: data as any }));
        }
      }
    }, { timeout: 60_000 });
    return jsonResponse({ success: true, count: created.length, items: created });
  }

  const { assetType, data } = body;

  if (!assetType || !data) {
    return jsonResponse({ error: '缺少 assetType 或 data' }, 400);
  }

  const sceneError = await validateActionSceneReference(assetType, data);
  if (sceneError) return jsonResponse({ success: false, error: sceneError }, 400);

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
    const org = await withOrganization('full_prompt', data);
    created = await db.fullPromptAsset.create({
      data: {
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
        provenance: data.provenance || 'manual',
        albumId: org.albumId as string,
        productCategoryIds: String(org.productCategoryIds || '[]'),
        isUniversal: false,
      },
    });
  } else {
    return jsonResponse({ error: `不支持的资产类型: ${assetType}` }, 400);
  }

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
    updated = await db.fullPromptAsset.update({
      where: { id },
      data,
    });
  } else {
    return jsonResponse({ error: `不支持的资产类型: ${assetType}` }, 400);
  }

  return jsonResponse({ success: true, item: updated });
}

// 删除指定 ID 资产及关联媒体
export async function executeLibraryDeleteByIds(assetType: string, idsToDelete: string[]) {
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
    deleteRecords = () => db.fullPromptAsset.deleteMany({ where: { id: { in: idsToDelete } } });
  } else {
    return jsonResponse({ error: `不支持的资产类型: ${assetType}` }, 400);
  }

  if (mediaUrlsToDelete.length > 0) {
    await queueMediaReview(mediaUrlsToDelete, { assetType, ids: idsToDelete });
  }

  const deleted = await deleteRecords();
  return jsonResponse({ success: true, count: deleted.count, ids: idsToDelete });
}
