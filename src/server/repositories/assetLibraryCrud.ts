import { db } from './access';
import { withOrganization } from './assetLibraryImport';

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
    updated = await db.fullPromptAsset.update({
      where: { id },
      data,
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
    deleteRecords = () => db.fullPromptAsset.deleteMany({ where: { id: { in: idsToDelete } } });
  } else {
    return null;
  }

  return { mediaUrlsToDelete, deleteRecords };
}
