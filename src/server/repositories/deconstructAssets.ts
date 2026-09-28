import { mergeAudienceDimensions } from '@shared/domain/assets/appearanceAudience';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { db } from './access';
import {
  createCompactThumbnailDataUrl,
  createCompactSourceImagesJson,
} from '@server/infrastructure/media/imageConverter';
import {
  sanitizeScenePrompt,
  isActionTitle,
  dedupeOutfitCandidates,
} from '@shared/domain/assets/assetDeconstruct/validate';
import type { PerImageResult } from '@shared/domain/assets/assetDeconstruct/prompts';
import { persistFullPromptRecords } from './deconstructFullPrompts';
import { hasReusableOutfitText, isObservedDetail } from '@shared/domain/assets/assetDeconstruct/visualEvidence';

export interface SavedRecords {
  scenes: any[];
  outfits: any[];
  actions: any[];
  fullPrompts: any[];
  persona?: any;
}

export function extractAssetMeta(item: any) {
  const dimensions = item?.dimensions;
  return {
    reversePrompt: item?.reverse_prompt || item?.reversePrompt || null,
    dimensions: dimensions
      ? typeof dimensions === 'string'
        ? dimensions
        : JSON.stringify(dimensions)
      : null,
    sourceImageIndex:
      typeof item?.source_image_index === 'number'
        ? item.source_image_index
        : typeof item?.sourceImageIndex === 'number'
          ? item.sourceImageIndex
          : null,
    imageType: item?.image_type || item?.imageType || null,
  };
}

export function getSceneClusterIndices(sc: Record<string, unknown>): number[] {
  if (Array.isArray(sc.source_image_indices)) {
    return (sc.source_image_indices as number[]).filter((n) => typeof n === 'number').sort((a, b) => a - b);
  }
  const idx =
    typeof sc.source_image_index === 'number'
      ? sc.source_image_index
      : typeof sc.sourceImageIndex === 'number'
        ? sc.sourceImageIndex
        : null;
  return idx !== null ? [idx] : [];
}

export async function persistDeconstructedAssets(params: {
  parsedResult: Record<string, unknown>;
  perImageResults: PerImageResult[];
  imageUrls: string[];
  albumName: string;
  isSingleImage: boolean;
  category: string;
  productCategoryId?: string | null;
  sourceKey?: string;
  reviewId?: string;
  fullPromptOnly?: boolean;
  provenance?: string;
}): Promise<SavedRecords> {
  const { parsedResult, perImageResults, imageUrls, albumName, isSingleImage, category, productCategoryId, sourceKey } = params;

  const savedRecords: SavedRecords = {
    scenes: [],
    outfits: [],
    actions: [],
    fullPrompts: [],
  };
  // 纯商品/静物图组没有可复用的人物或穿搭。绝不能把模型返回的
  // “无人物 / 无穿搭”占位文本写入对应资产库。
  const hasHumanEvidence = perImageResults.some((image) => image.has_human === true);

  const [compactCoverUrl, compactSampleImagesJson] = await Promise.all([
    createCompactThumbnailDataUrl(imageUrls[0] || '', 320),
    createCompactSourceImagesJson(imageUrls, 320),
  ]);
  const defaultCoverUrl = compactCoverUrl || '';
  const sampleImagesJson = compactSampleImagesJson || '[]';

  const thumbnailCache = new Map<string, string>();
  const thumbForUrl = async (url: string) => {
    if (!url) return defaultCoverUrl;
    const cached = thumbnailCache.get(url);
    if (cached) return cached;
    const compact = (await createCompactThumbnailDataUrl(url, 320)) || defaultCoverUrl;
    thumbnailCache.set(url, compact);
    return compact;
  };

  const persisted = await persistFullPromptRecords({
    parsedResult, perImageResults, imageUrls, albumName, category, productCategoryId, sourceKey,
    sampleImagesJson, thumbForUrl, defaultCoverUrl, provenance: params.provenance,
  });
  savedRecords.fullPrompts = persisted.fullPrompts;
  if (sourceKey) {
    await db.$executeRaw`UPDATE "PromptImportSource" SET "state" = 'approved', "albumName" = ${albumName}, "albumId" = ${persisted.album.id}, "updatedAt" = ${new Date().toISOString()} WHERE "workspaceId" = ${requireWorkspaceId()} AND "sourceKey" = ${sourceKey}`;
  }
  if (params.fullPromptOnly) return savedRecords;

  const rawScenes: any[] = Array.isArray(parsedResult.scenes)
    ? parsedResult.scenes
    : parsedResult.scene
    ? [parsedResult.scene]
    : [];

  const scenesToProcess = isSingleImage && rawScenes.length > 1 ? [rawScenes[0]] : rawScenes.slice(0, imageUrls.length);

  for (const sc of scenesToProcess) {
    if (!sc) continue;
    const title = (sc.title || '自定义生活场景').trim();
    if (isActionTitle(title)) {
      console.warn(`[AssetDeconstruct] 拦截伪动作场景: "${title}"，拒绝写入 SceneAsset`);
      continue;
    }
    const meta = extractAssetMeta(sc);
    let spatialType = sc.spatial_type || sc.spatialType || 'indoor_room';

    const fullDesc = `${title} ${sc.description || ''}`.toLowerCase();
    if (fullDesc.includes('车') || fullDesc.includes('副驾') || category === 'commuting_car') {
      spatialType = 'car_interior';
    } else if (fullDesc.includes('茶') || fullDesc.includes('古风') || fullDesc.includes('日式') || fullDesc.includes('町屋') || category === 'chinese_style') {
      spatialType = 'tea_space';
    } else if (fullDesc.includes('街') || fullDesc.includes('林荫') || fullDesc.includes('路')) {
      spatialType = 'street';
    } else if (fullDesc.includes('海') || fullDesc.includes('树') || fullDesc.includes('草坪') || fullDesc.includes('庭院') || fullDesc.includes('竹') || category === 'vacation_nature') {
      spatialType = 'outdoor_nature';
    } else if (fullDesc.includes('办公') || fullDesc.includes('工位') || category === 'minimal_office') {
      spatialType = 'desk_office';
    }

    const clusterIndices = getSceneClusterIndices(sc);
    const primaryIndex = meta.sourceImageIndex ?? clusterIndices[0] ?? null;
    const cleanSceneDesc = sanitizeScenePrompt(sc.description || meta.reversePrompt || '');
    const cleanSceneReverse = meta.reversePrompt ? sanitizeScenePrompt(meta.reversePrompt) : undefined;

    const existingScene = primaryIndex !== null
      ? await db.sceneAsset.findFirst({
          where: { title, sourceImageIndex: primaryIndex },
        })
      : await db.sceneAsset.findFirst({
          where: { title },
        });

    const rawSceneCover = primaryIndex !== null && imageUrls[primaryIndex - 1]
      ? imageUrls[primaryIndex - 1]
      : (defaultCoverUrl || '');
    const sceneCoverUrl = await thumbForUrl(rawSceneCover);

    if (existingScene) {
      const updated = await db.sceneAsset.update({
        where: { id: existingScene.id },
        data: {
          usageCount: existingScene.usageCount + 1,
          coverUrl: sceneCoverUrl || existingScene.coverUrl,
          sourceImages: sampleImagesJson,
          ...(cleanSceneReverse ? { reversePrompt: cleanSceneReverse } : {}),
          ...(meta.dimensions ? { dimensions: meta.dimensions } : {}),
          updatedAt: new Date(),
        },
      });
      savedRecords.scenes.push(updated);
    } else {
      const created = await db.sceneAsset.create({
        data: {
          title,
          description: cleanSceneDesc,
          lighting: sc.lighting || '自然采光与清晰物理接触阴影',
          category,
          spatialType,
          suitableCategories: JSON.stringify(sc.suitable_categories || []),
          tags: [
            ...(Array.isArray(sc.tags) ? sc.tags : sc.tags ? [sc.tags] : []),
            ...(clusterIndices.length > 0 ? [`cluster:${clusterIndices.join(',')}`] : []),
          ].join(', '),
          coverUrl: sceneCoverUrl,
          sourceImages: sampleImagesJson,
          ...meta,
          ...(cleanSceneReverse ? { reversePrompt: cleanSceneReverse } : {}),
          sourceImageIndex: primaryIndex,
          provenance: 'deconstructed',
        },
      });
      savedRecords.scenes.push(created);
    }
  }

  const rawOutfits: any[] = !hasHumanEvidence
    ? []
    : Array.isArray(parsedResult.outfits) && parsedResult.outfits.length > 0
      ? parsedResult.outfits
      : parsedResult.outfit
        ? [parsedResult.outfit]
        : perImageResults.map((img) => img.outfit).filter(Boolean);

  const dedupedOutfits = dedupeOutfitCandidates(rawOutfits);
  const outfitsToProcess = isSingleImage && dedupedOutfits.length > 1 ? [dedupedOutfits[0]] : dedupedOutfits;

  for (const candidate of outfitsToProcess) {
    if (!candidate) continue;
    const ot = candidate as Record<string, any>;
    const title = String(ot.title || '自定义显白穿搭').trim();
    const top = String(ot.top || '').trim();
    const bottom = String(ot.bottom || '').trim();
    const shoes = String(ot.shoes || '').trim();
    const colorPalette = String(ot.color_palette || ot.colorPalette || '').trim();
    const meta = extractAssetMeta(ot);
    if (!hasReusableOutfitText({ title, top, bottom })) continue;
    const clusterIndices: number[] = Array.isArray(ot.source_image_indices) ? ot.source_image_indices : [];
    const sourceIndex = meta.sourceImageIndex ?? clusterIndices[0] ?? ot.source_image_index;
    // An atomic outfit must point at the image that visibly contains the clothing.
    if (typeof sourceIndex !== 'number' || !imageUrls[sourceIndex - 1]) continue;
    const rawOutfitCover = sourceIndex !== null && sourceIndex !== undefined && imageUrls[sourceIndex - 1]
      ? imageUrls[sourceIndex - 1]
      : (defaultCoverUrl || '');
    const outfitCoverUrl = await thumbForUrl(rawOutfitCover);
    const outfitTags = [
      ...(Array.isArray(ot.tags) ? ot.tags : ot.tags ? [ot.tags] : []),
      ...(clusterIndices.length > 1 ? [`cluster:${clusterIndices.join(',')}`] : []),
    ].filter(Boolean).join(', ');

    const existingOutfit = await db.outfitAsset.findFirst({
      where: {
        OR: [
          { title },
          { AND: [{ top: top || title }, { bottom: bottom || '' }] },
        ],
      },
    });

    if (existingOutfit) {
      const updated = await db.outfitAsset.update({
        where: { id: existingOutfit.id },
        data: {
          usageCount: existingOutfit.usageCount + 1,
          coverUrl: outfitCoverUrl || existingOutfit.coverUrl,
          sourceImages: sampleImagesJson,
          top: top || existingOutfit.top,
          bottom: bottom || existingOutfit.bottom,
          shoes: shoes || existingOutfit.shoes,
          colorPalette: colorPalette || existingOutfit.colorPalette,
          tags: outfitTags || existingOutfit.tags,
          ...(meta.reversePrompt ? { reversePrompt: meta.reversePrompt } : {}),
          dimensions: mergeAudienceDimensions(existingOutfit.dimensions, meta.dimensions),
          updatedAt: new Date(),
        },
      });
      savedRecords.outfits.push(updated);
    } else {
      const created = await db.outfitAsset.create({
        data: {
          title,
          top: top || '',
          bottom: bottom || '',
          shoes,
          colorPalette,
          category,
          suitableCategories: JSON.stringify(ot.suitable_categories || ot.suitableCategories || []),
          tags: outfitTags,
          coverUrl: outfitCoverUrl,
          sourceImages: sampleImagesJson,
          ...meta,
          provenance: 'deconstructed',
        },
      });
      savedRecords.outfits.push(created);
    }
  }

  if (hasHumanEvidence && parsedResult.persona) {
    const ps = parsedResult.persona as Record<string, unknown>;
    if (!isObservedDetail(ps.face) || !isObservedDetail(ps.hair)) return savedRecords;
    const name = ((ps.name as string) || '气质博主').trim();
    const meta = extractAssetMeta(ps);
    // Never use image #1 as a persona avatar when the evidence image is missing.
    if (meta.sourceImageIndex === null || meta.sourceImageIndex === undefined || !imageUrls[meta.sourceImageIndex - 1]) return savedRecords;
    const rawPersonaAvatar = imageUrls[meta.sourceImageIndex - 1];
    const personaAvatarUrl = await thumbForUrl(rawPersonaAvatar);

    const hair = (ps.hair as string) || '';
    const face = (ps.face as string) || '';
    const skin = (ps.skin as string) || '';
    const vibe = (ps.vibe as string) || '';
    const structuredSegments = [
      hair ? `【发型发色】${hair}` : '',
      face ? `【五官脸型】${face}` : '',
      skin ? `【原生肤质】${skin}` : '',
      vibe ? `【神态气质】${vibe}` : '',
    ].filter(Boolean);

    const finalDesc = structuredSegments.length > 0
      ? structuredSegments.join('；')
      : (ps.description as string) || meta.reversePrompt || '';

    const personaTags = Array.isArray(ps.tags)
      ? (ps.tags as string[])
      : typeof ps.tags === 'string'
      ? (ps.tags as string).split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    if (hair) personaTags.push(hair.slice(0, 10));
    if (vibe) personaTags.push(vibe.slice(0, 8));

    const existingPersona = await db.personaAsset.findFirst({
      where: {
        OR: [{ name }, { description: finalDesc }],
      },
    });

    if (existingPersona) {
      savedRecords.persona = await db.personaAsset.update({
        where: { id: existingPersona.id },
        data: {
          usageCount: existingPersona.usageCount + 1,
          description: finalDesc,
          avatarUrl: personaAvatarUrl || existingPersona.avatarUrl,
          sourceImages: sampleImagesJson,
          tags: Array.from(new Set(personaTags)).join(', '),
          ...(meta.reversePrompt ? { reversePrompt: meta.reversePrompt } : {}),
          dimensions: mergeAudienceDimensions(existingPersona.dimensions, meta.dimensions),
          updatedAt: new Date(),
        },
      });
    } else {
      savedRecords.persona = await db.personaAsset.create({
        data: {
          name,
          description: finalDesc,
          tags: Array.from(new Set(personaTags)).join(', '),
          avatarUrl: personaAvatarUrl,
          sourceImages: sampleImagesJson,
          ...meta,
        },
      });
    }
  }

  return savedRecords;
}
