import { prisma } from '@beike/shared/prisma';
import {
  createCompactThumbnailDataUrl,
  createCompactSourceImagesJson,
} from '@beike/shared/imageConverter';
import {
  sanitizeActionPrompt,
  sanitizeActionTitle,
  sanitizeScenePrompt,
  isActionTitle,
  dedupeOutfitCandidates,
} from '@beike/shared/assetDeconstruct/validate';
import {
  extractActionCategories,
  extractActionFocusAnchors,
} from '@beike/shared/productCategoryHelpers';
import type { PerImageResult } from '@beike/shared/assetDeconstruct/prompts';

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
}): Promise<SavedRecords> {
  const { parsedResult, perImageResults, imageUrls, albumName, isSingleImage, category } = params;

  const savedRecords: SavedRecords = {
    scenes: [],
    outfits: [],
    actions: [],
    fullPrompts: [],
  };

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

  // 0. 入库每一张参考图反推生成的完整母本提示词 (FullPromptAsset)
  for (const img of perImageResults) {
    if (!img || (!img.reverse_prompt_zh && !img.reverse_prompt)) continue;
    const imgIndex = img.image_index || 1;
    const fullPromptZh = (img.reverse_prompt_zh || img.reverse_prompt || '').trim();
    const fullTitle = (img.title || `${albumName}_图#${imgIndex}`).trim();
    const rawImgCover = (imgIndex >= 1 && imgIndex <= imageUrls.length)
      ? imageUrls[imgIndex - 1]
      : defaultCoverUrl;
    const compactImgCover = await thumbForUrl(rawImgCover);

    const sceneSummary = img.scene?.title || '';
    const outfitSummary = img.outfit ? [img.outfit.top, img.outfit.bottom].filter(Boolean).join(' + ') || img.outfit.title || '' : '';
    const actionSummary = img.action?.title || img.action?.action || '';
    const personaSummary = img.persona?.name || '';
    const fullTags = Array.isArray(img.tags) ? img.tags.join(', ') : (img.tags || '');

    const existingFullPrompt = await prisma.fullPromptAsset.findFirst({
      where: {
        OR: [
          { reversePromptZh: fullPromptZh },
          { AND: [{ albumName }, { sourceImageIndex: imgIndex }] },
        ],
      },
    });

    if (existingFullPrompt) {
      const updated = await prisma.fullPromptAsset.update({
        where: { id: existingFullPrompt.id },
        data: {
          title: fullTitle,
          albumName,
          reversePromptZh: fullPromptZh,
          dimensions: img.dimensions ? JSON.stringify(img.dimensions) : existingFullPrompt.dimensions,
          imageType: img.image_type || existingFullPrompt.imageType,
          sourceImageIndex: imgIndex,
          coverUrl: compactImgCover || existingFullPrompt.coverUrl,
          sourceImages: sampleImagesJson,
          hasHuman: Boolean(img.persona && (img.persona.hair || img.persona.name || img.persona.face)),
          shotFraming: img.shot_framing || existingFullPrompt.shotFraming,
          productFrameRatio: img.product_frame_ratio ?? existingFullPrompt.productFrameRatio,
          sceneSummary,
          outfitSummary,
          actionSummary,
          personaSummary,
          tags: fullTags || existingFullPrompt.tags,
          category,
          usageCount: existingFullPrompt.usageCount + 1,
          updatedAt: new Date(),
        },
      });
      savedRecords.fullPrompts.push(updated);
    } else {
      const created = await prisma.fullPromptAsset.create({
        data: {
          title: fullTitle,
          albumName,
          reversePromptZh: fullPromptZh,
          dimensions: img.dimensions ? JSON.stringify(img.dimensions) : null,
          imageType: img.image_type || 'photography',
          sourceImageIndex: imgIndex,
          coverUrl: compactImgCover,
          sourceImages: sampleImagesJson,
          hasHuman: Boolean(img.persona && (img.persona.hair || img.persona.name || img.persona.face)),
          shotFraming: img.shot_framing || 'medium_full_body',
          productFrameRatio: img.product_frame_ratio ?? null,
          sceneSummary,
          outfitSummary,
          actionSummary,
          personaSummary,
          tags: fullTags,
          category,
          provenance: 'deconstructed',
        },
      });
      savedRecords.fullPrompts.push(created);
    }
  }

  const rawScenes: any[] = Array.isArray(parsedResult.scenes)
    ? parsedResult.scenes
    : parsedResult.scene
    ? [parsedResult.scene]
    : [];

  const scenesToProcess = isSingleImage && rawScenes.length > 1 ? [rawScenes[0]] : rawScenes.slice(0, imageUrls.length);
  const sceneIdBySourceIndex = new Map<number, string>();

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
      ? await prisma.sceneAsset.findFirst({
          where: { title, sourceImageIndex: primaryIndex },
        })
      : await prisma.sceneAsset.findFirst({
          where: { title },
        });

    const rawSceneCover = primaryIndex !== null && imageUrls[primaryIndex - 1]
      ? imageUrls[primaryIndex - 1]
      : (defaultCoverUrl || '');
    const sceneCoverUrl = await thumbForUrl(rawSceneCover);

    if (existingScene) {
      const updated = await prisma.sceneAsset.update({
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
      if (primaryIndex !== null) sceneIdBySourceIndex.set(primaryIndex, updated.id);
      for (const idx of clusterIndices) {
        sceneIdBySourceIndex.set(idx, updated.id);
      }
    } else {
      const created = await prisma.sceneAsset.create({
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
      if (primaryIndex !== null) sceneIdBySourceIndex.set(primaryIndex, created.id);
      for (const idx of clusterIndices) {
        sceneIdBySourceIndex.set(idx, created.id);
      }
    }
  }

  const rawOutfits: any[] = Array.isArray(parsedResult.outfits) && parsedResult.outfits.length > 0
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
    const clusterIndices: number[] = Array.isArray(ot.source_image_indices) ? ot.source_image_indices : [];
    const sourceIndex = meta.sourceImageIndex ?? clusterIndices[0] ?? ot.source_image_index;
    const rawOutfitCover = sourceIndex !== null && sourceIndex !== undefined && imageUrls[sourceIndex - 1]
      ? imageUrls[sourceIndex - 1]
      : (defaultCoverUrl || '');
    const outfitCoverUrl = await thumbForUrl(rawOutfitCover);
    const outfitTags = [
      ...(Array.isArray(ot.tags) ? ot.tags : ot.tags ? [ot.tags] : []),
      ...(clusterIndices.length > 1 ? [`cluster:${clusterIndices.join(',')}`] : []),
    ].filter(Boolean).join(', ');

    const existingOutfit = await prisma.outfitAsset.findFirst({
      where: {
        OR: [
          { title },
          { AND: [{ top: top || title }, { bottom: bottom || '' }] },
        ],
      },
    });

    if (existingOutfit) {
      const updated = await prisma.outfitAsset.update({
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
          ...(meta.dimensions ? { dimensions: meta.dimensions } : {}),
          updatedAt: new Date(),
        },
      });
      savedRecords.outfits.push(updated);
    } else {
      const created = await prisma.outfitAsset.create({
        data: {
          title,
          top: top || title,
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

  const rawActions: any[] = Array.isArray(parsedResult.actions)
    ? parsedResult.actions
    : parsedResult.action
    ? [parsedResult.action]
    : [];

  const actionsToProcess = isSingleImage && rawActions.length > 1 ? [rawActions[0]] : rawActions.slice(0, imageUrls.length);
  const shotOrderByScene = new Map<string, number>();

  for (const act of actionsToProcess) {
    if (!act) continue;
    const rawActTitle = (act.title || '抓拍动作').trim();
    const shotType = act.shot_type || act.shot_framing || 'half_body';
    const meta = extractAssetMeta(act);
    const rawActionCover = meta.sourceImageIndex !== null && meta.sourceImageIndex !== undefined && imageUrls[meta.sourceImageIndex - 1]
      ? imageUrls[meta.sourceImageIndex - 1]
      : (defaultCoverUrl || '');
    const actionCoverUrl = await thumbForUrl(rawActionCover);

    let actSpatial = 'general';
    const actFull = `${rawActTitle} ${act.action || ''}`.toLowerCase();
    if (actFull.includes('车') || actFull.includes('副驾')) actSpatial = 'car_seated';
    else if (actFull.includes('微距') || shotType === 'macro_detail') actSpatial = 'macro';
    else if (actFull.includes('坐') || actFull.includes('椅') || actFull.includes('卡座')) actSpatial = 'sitting';
    else if (actFull.includes('走') || actFull.includes('漫步')) actSpatial = 'walking';

    const cleanActionDesc = sanitizeActionPrompt(act.action || meta.reversePrompt || '');
    const cleanActionReverse = meta.reversePrompt ? sanitizeActionPrompt(meta.reversePrompt) : undefined;
    const actTitle = sanitizeActionTitle(rawActTitle, shotType, cleanActionDesc);

    const existingAction =
      meta.sourceImageIndex !== null
        ? await prisma.actionAsset.findFirst({
            where: { sourceImageIndex: meta.sourceImageIndex, title: actTitle },
          })
        : await prisma.actionAsset.findFirst({
            where: {
              OR: [
                { title: actTitle },
                { AND: [{ shotType }, { action: cleanActionDesc }] },
              ],
            },
          });

    const linkedSceneId =
      meta.sourceImageIndex !== null && meta.sourceImageIndex !== undefined
        ? sceneIdBySourceIndex.get(meta.sourceImageIndex) ?? savedRecords.scenes[0]?.id ?? null
        : savedRecords.scenes[0]?.id ?? null;
    let shotOrder = 0;
    if (linkedSceneId) {
      const next = (shotOrderByScene.get(linkedSceneId) ?? 0) + 1;
      shotOrderByScene.set(linkedSceneId, next);
      shotOrder = next;
    }

    if (existingAction) {
      const updated = await prisma.actionAsset.update({
        where: { id: existingAction.id },
        data: {
          usageCount: existingAction.usageCount + 1,
          coverUrl: actionCoverUrl || existingAction.coverUrl,
          sourceImages: sampleImagesJson,
          ...(cleanActionReverse ? { reversePrompt: cleanActionReverse } : {}),
          ...(meta.dimensions ? { dimensions: meta.dimensions } : {}),
          ...(meta.sourceImageIndex ? { sourceImageIndex: meta.sourceImageIndex } : {}),
          ...(linkedSceneId ? { sceneId: linkedSceneId, shotOrder } : {}),
          updatedAt: new Date(),
        },
      });
      savedRecords.actions.push(updated);
    } else {
      const rawAnatomy = Array.isArray(act.suitable_anatomy) ? [...act.suitable_anatomy] : [];
      if (act.focus_anatomy && !rawAnatomy.includes(act.focus_anatomy)) {
        rawAnatomy.push(act.focus_anatomy);
      }
      const cats = extractActionCategories({
        title: actTitle,
        action: cleanActionDesc,
        suitableAnatomy: JSON.stringify(rawAnatomy),
        tags: rawAnatomy.join(', '),
      });
      const anchors = extractActionFocusAnchors({
        title: actTitle,
        action: cleanActionDesc,
        shotType,
        suitableAnatomy: JSON.stringify(rawAnatomy),
        tags: rawAnatomy.join(', '),
      });

      let targetList: string[] = [];
      if (anchors.length > 0) {
        targetList = [
          ...cats.map((c) => c.id),
          ...anchors.map((anc) => anc.id),
          ...(anchors.some((a) => a.id === 'wrist') ? ['bracelet'] : []),
          ...(anchors.some((a) => a.id === 'collarbone') ? ['necklace'] : []),
          ...(anchors.some((a) => a.id === 'fingers') ? ['ring'] : []),
          ...(anchors.some((a) => a.id === 'ear') ? ['earring'] : []),
          ...(anchors.some((a) => a.id === 'hair') ? ['hairpin'] : []),
          ...(anchors.some((a) => a.id === 'brooch') ? ['brooch'] : []),
        ];
      } else {
        targetList = cats.map((c) => c.id);
      }
      const uniqueList = Array.from(new Set(targetList));
      const targetAnatomyJson = JSON.stringify(uniqueList);
      const targetTags = Array.from(new Set([
        ...cats.map((c) => c.label),
        ...anchors.map((a) => a.label),
      ])).join(', ');

      const created = await prisma.actionAsset.create({
        data: {
          title: actTitle,
          action: cleanActionDesc,
          shotType,
          spatialType: actSpatial,
          camera: act.camera || 'iPhone 50mm 生活镜头',
          suitableAnatomy: targetAnatomyJson,
          tags: targetTags,
          coverUrl: actionCoverUrl,
          sourceImages: sampleImagesJson,
          ...meta,
          ...(cleanActionReverse ? { reversePrompt: cleanActionReverse } : {}),
          provenance: 'deconstructed',
          ...(linkedSceneId ? { sceneId: linkedSceneId, shotOrder } : {}),
        },
      });
      savedRecords.actions.push(created);
    }
  }

  if (parsedResult.persona) {
    const ps = parsedResult.persona as Record<string, unknown>;
    const name = ((ps.name as string) || '气质博主').trim();
    const meta = extractAssetMeta(ps);
    const rawPersonaAvatar = meta.sourceImageIndex !== null && meta.sourceImageIndex !== undefined && imageUrls[meta.sourceImageIndex - 1]
      ? imageUrls[meta.sourceImageIndex - 1]
      : (defaultCoverUrl || '');
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

    const existingPersona = await prisma.personaAsset.findFirst({
      where: {
        OR: [{ name }, { description: finalDesc }],
      },
    });

    if (existingPersona) {
      savedRecords.persona = await prisma.personaAsset.update({
        where: { id: existingPersona.id },
        data: {
          usageCount: existingPersona.usageCount + 1,
          description: finalDesc,
          avatarUrl: personaAvatarUrl || existingPersona.avatarUrl,
          sourceImages: sampleImagesJson,
          tags: Array.from(new Set(personaTags)).join(', '),
          ...(meta.reversePrompt ? { reversePrompt: meta.reversePrompt } : {}),
          ...(meta.dimensions ? { dimensions: meta.dimensions } : {}),
          updatedAt: new Date(),
        },
      });
    } else {
      savedRecords.persona = await prisma.personaAsset.create({
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
