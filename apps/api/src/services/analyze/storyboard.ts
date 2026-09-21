import { prisma } from '../../repositories/db';
import {
  prepareAnalyzeImages,
  callVisionModel,
  buildVisionContent,
} from '../analyzeVisionCall';
import { buildVisionSystemPrompt } from '@beike/domain/vision';
import {
  getCategoryTailoredOutfits,
  getCategoryTailoredPersonas,
  buildSuitableCategoriesOr,
} from '@beike/domain/jewelryArch';
import { resolveShotsForScene } from '@beike/domain/sceneBundle';
import {
  pickWeightedRandom,
  computeSamplingSeed,
  pickActionSet,
  stableAssetCode,
} from '@beike/domain/assetSampling';
import {
  extractPureActionFromPrompt,
  stripGarmentsFromAction,
} from '@beike/domain/drawing';
import { inferProductCategoryAndAnatomy } from '@beike/domain/productCategory';
import { ANATOMY_ACTION_PRESETS } from '../../routes/generate/analyze/anatomyPresets';
import { assembleStoryboardShots } from './promptAssembler';
import { resolveAssetShotSubject } from '@beike/domain/workshopShotSubject';

export interface ExecuteStoryboardParams {
  productTitle?: string;
  productProps?: any;
  imageUrls: string[];
  anchorFaceImageUrl?: string;
  modelPersona?: string;
  productFingerprint?: string;
  resolvedTemplateStyle: string;
  shotCount: number;
  extraRequirements: string;
  model: string;
  fallbackModels: string[];
  targetBaseUrl: string;
  targetApiKey: string;
  hasAnchorFace: boolean;
  previousMasterScenes?: any[];
  previousGroupSignatures?: any[];
  previousActionIds?: any[];
  previousSceneIds?: any[];
  allocatedAssets?: any;
  lockedAssets?: any;
  productIndex: number;
  useAssetLibrary?: boolean;
}

const ASSET_PROVENANCE_WHERE = {
  provenance: { not: 'reference_import' as const },
};

export async function executeStoryboard(params: ExecuteStoryboardParams) {
  const {
    productTitle,
    productProps,
    imageUrls = [],
    anchorFaceImageUrl,
    modelPersona,
    resolvedTemplateStyle,
    shotCount,
    extraRequirements,
    model,
    fallbackModels = [],
    targetBaseUrl,
    targetApiKey,
    hasAnchorFace,
    previousMasterScenes = [],
    previousGroupSignatures = [],
    previousActionIds = [],
    previousSceneIds = [],
    allocatedAssets,
    lockedAssets,
    productIndex,
    useAssetLibrary,
  } = params;

  if (!productTitle && imageUrls.length === 0) {
    throw new Error('缺少商品标题或商品图片素材');
  }

  const personaText = modelPersona || '';
  let assetLibraryData: any = undefined;
  let assetPickTrace: Record<string, unknown> | undefined;
  let actionItems: any[] = [];

  // 🌟 自动从「提示词资产库」检索精选原子零件进行智能装配
  if (useAssetLibrary !== false) {
    try {
      const titleStr = `${productTitle || ''} ${JSON.stringify(productProps || {})}`.toLowerCase();
      const categoryInfo = inferProductCategoryAndAnatomy(productTitle, productProps);
      const targetAnatomy = categoryInfo.targetAnatomy;
      const categoryTags = categoryInfo.categoryTags;
      const categoryOr = buildSuitableCategoriesOr(categoryTags);
      const assetOrder = [
        { isFavorite: 'desc' as const },
        { usageCount: 'desc' as const },
        { createdAt: 'desc' as const },
      ];

      const targetPersonaId = lockedAssets?.personaId || (allocatedAssets as any)?.personaId;
      const targetSceneId = lockedAssets?.sceneId || (allocatedAssets as any)?.sceneId;
      const targetOutfitId = lockedAssets?.outfitId || (allocatedAssets as any)?.outfitId;
      const targetActionIds =
        (lockedAssets?.actionId ? [lockedAssets.actionId] : undefined) ||
        (allocatedAssets as any)?.actionIds;

      // 1. 获取博主人设 (Persona)
      let personaItems: any[] = [];
      if (targetPersonaId) {
        const p = await prisma.personaAsset.findFirst({
          where: { id: targetPersonaId, ...ASSET_PROVENANCE_WHERE },
        });
        if (p) personaItems = [p];
      }
      if (personaItems.length === 0) {
        personaItems = await prisma.personaAsset.findMany({
          where: ASSET_PROVENANCE_WHERE,
          orderBy: assetOrder,
          take: 12,
        });
      }
      // 🚨 如果召回的博主少于 5 位且用户未强锁单一模特，补充预置多样性博主，保证跨商品轮询池深度
      if (!targetPersonaId && personaItems.length < 5) {
        const tailoredPersonas = getCategoryTailoredPersonas(titleStr, targetAnatomy);
        const existingNames = new Set(personaItems.map((p) => p.name));
        const extra = tailoredPersonas.filter((tp) => !existingNames.has(tp.name));
        personaItems = [...personaItems, ...extra];
      }

      // 2. 获取真实场景 (Scene) - 按品类/材质智能召回并动态洗牌（彻底激活全库场景）
      let sceneItems: any[] = [];
      if (targetSceneId) {
        const s = await prisma.sceneAsset.findFirst({
          where: { id: targetSceneId, ...ASSET_PROVENANCE_WHERE },
        });
        if (s) sceneItems = [s];
      }
      if (sceneItems.length === 0) {
        let allScenes: any[] = [];
        if (categoryOr.length > 0) {
          allScenes = await prisma.sceneAsset.findMany({
            where: { ...ASSET_PROVENANCE_WHERE, OR: categoryOr },
            orderBy: assetOrder,
            take: 100,
          });
        }
        if (allScenes.length < 15) {
          const generalScenes = await prisma.sceneAsset.findMany({
            where: ASSET_PROVENANCE_WHERE,
            orderBy: assetOrder,
            take: 100,
          });
          allScenes = [
            ...allScenes,
            ...generalScenes.filter((g) => !allScenes.some((c) => c.id === g.id)),
          ];
        }

        // 🌟 批次互斥与 Fisher-Yates 伪随机加权洗牌，彻底打散 100+ 场景池，杜绝场景撞车
        const previousSceneIdsList: string[] = Array.isArray(previousSceneIds)
          ? previousSceneIds.map(String)
          : [];
        const usedSceneSet = new Set(previousSceneIdsList);
        let availableCandidates = allScenes.filter((s) => !usedSceneSet.has(String(s.id)));
        if (availableCandidates.length < 3) {
          availableCandidates = [...allScenes];
        }

        // 确定性伪随机 Fisher-Yates 洗牌（结合 productIndex 与 title hash）
        const titleHash = Array.from(String(productTitle || '')).reduce(
          (acc: number, ch: string) => acc + ch.charCodeAt(0),
          0
        );
        const seed = (productIndex * 37 + titleHash * 13) % 10007;
        const shuffled = [...availableCandidates];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.abs(seed * (i + 1) + i * 17) % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        sceneItems = shuffled.slice(0, 15);
      }

      // 3. 获取显白穿搭 (Outfit) - 按品类/材质智能召回
      let outfitItems: any[] = [];
      if (targetOutfitId) {
        const o = await prisma.outfitAsset.findFirst({
          where: { id: targetOutfitId, ...ASSET_PROVENANCE_WHERE },
        });
        if (o) outfitItems = [o];
      }
      if (outfitItems.length === 0 && categoryOr.length > 0) {
        outfitItems = await prisma.outfitAsset.findMany({
          where: { ...ASSET_PROVENANCE_WHERE, OR: categoryOr },
          orderBy: assetOrder,
          take: 50,
        });
      }
      if (outfitItems.length === 0) {
        outfitItems = await prisma.outfitAsset.findMany({
          where: ASSET_PROVENANCE_WHERE,
          orderBy: assetOrder,
          take: 50,
        });
      }
      // 🚨 如果召回的穿搭少于 4 套且用户未强锁单一穿搭，补充通用私服穿搭，保证跨商品轮循池深度，防止所有商品穿同一套
      if (!targetOutfitId && outfitItems.length < 4) {
        const existingIds = outfitItems.map((o) => o.id);
        const extraOutfits = await prisma.outfitAsset.findMany({
          where: {
            ...ASSET_PROVENANCE_WHERE,
            ...(existingIds.length > 0 ? { id: { notIn: existingIds } } : {}),
          },
          orderBy: assetOrder,
          take: 12 - outfitItems.length,
        });
        outfitItems = [...outfitItems, ...extraOutfits];
      }

      // 🌟 品类-穿搭智能风格路由器：注入品类高匹配度的私服穿搭，杜绝跨商品撞衫（新中式/法式复古/极简通勤）
      if (!targetOutfitId) {
        const tailoredPresets = getCategoryTailoredOutfits(titleStr, targetAnatomy);
        outfitItems = [...tailoredPresets, ...outfitItems];
      }

      // 4. 获取抓拍动作 (Action)
      actionItems = [];
      if (Array.isArray(targetActionIds) && targetActionIds.length > 0) {
        const specificActions = await prisma.actionAsset.findMany({
          where: { id: { in: targetActionIds }, ...ASSET_PROVENANCE_WHERE },
        });
        if (specificActions.length > 0) {
          actionItems = targetActionIds
            .map((id: string) => specificActions.find((a) => String(a.id) === String(id)))
            .filter(Boolean);
        }
      } else if (lockedAssets?.actionId) {
        const a = await prisma.actionAsset.findFirst({
          where: { id: lockedAssets.actionId, ...ASSET_PROVENANCE_WHERE },
        });
        if (a) actionItems = [a];
      } else if (lockedAssets?.sceneId && sceneItems[0]) {
        const lockedScene = sceneItems[0];
        const linkedActions = await prisma.actionAsset.findMany({
          where: { sceneId: lockedScene.id, ...ASSET_PROVENANCE_WHERE },
          orderBy: [{ shotOrder: 'asc' }, { createdAt: 'asc' }],
          take: 4,
        });
        if (linkedActions.length > 0) {
          actionItems = linkedActions;
        } else {
          const shots = resolveShotsForScene(lockedScene, []);
          actionItems = shots.map((s, idx) => ({
            id: s.id,
            title: s.title,
            action: s.action,
            camera: s.camera,
            shotType: s.shotType,
            shotOrder: s.shotOrder || idx + 1,
            suitableAnatomy: '["all"]',
            provenance: s.provenance,
          }));
        }
      }

      // 🌟 核心升级：以提示词资产库为唯一事实源，按品类从库中互斥抽取多样性动作并彻底净化服装与地点词
      if (actionItems.length === 0) {
        let allCandidates: any[] = [];
        const matchConditions: any[] = (categoryTags || []).map((tag) => ({
          suitableAnatomy: { contains: tag },
        }));
        matchConditions.push({ suitableAnatomy: { contains: 'all' } });

        allCandidates = await prisma.actionAsset.findMany({
          where: {
            ...ASSET_PROVENANCE_WHERE,
            OR: matchConditions,
          },
          orderBy: assetOrder,
          take: 100,
        });

        if (allCandidates.length < 10) {
          const generalCandidates = await prisma.actionAsset.findMany({
            where: ASSET_PROVENANCE_WHERE,
            orderBy: assetOrder,
            take: 100,
          });
          allCandidates = [
            ...allCandidates,
            ...generalCandidates.filter((g) => !allCandidates.some((c) => c.id === g.id)),
          ];
        }

        if (allCandidates.length > 0) {
          const usedActionSet = new Set(
            (Array.isArray(previousActionIds) ? previousActionIds : []).map(String)
          );
          const samplingSeed = computeSamplingSeed(productIndex, productTitle || '');
          const pickedActions = pickActionSet(allCandidates, samplingSeed + 11, usedActionSet, 4);

          actionItems = pickedActions.map((cand, pickedIdx) => ({
            ...cand,
            code: stableAssetCode('A', String(cand.id)),
            action: stripGarmentsFromAction(cand.action, pickedIdx),
            reversePrompt: cand.reversePrompt
              ? stripGarmentsFromAction(cand.reversePrompt, pickedIdx)
              : null,
          }));
        }
      }

      // 🌟 内置解剖学专业分镜动作兜底
      if (actionItems.length < 4 && targetAnatomy) {
        const presets = ANATOMY_ACTION_PRESETS[targetAnatomy];
        if (presets) {
          actionItems = [...actionItems, ...presets.slice(actionItems.length)];
        }
      }

      if (
        personaItems.length > 0 ||
        sceneItems.length > 0 ||
        outfitItems.length > 0 ||
        actionItems.length > 0
      ) {
        const samplingSeed = computeSamplingSeed(productIndex, productTitle || '');
        const usedSceneSet = new Set(
          (Array.isArray(previousSceneIds) ? previousSceneIds : []).map(String)
        );

        if (!lockedAssets?.sceneId && !allocatedAssets?.sceneId && sceneItems.length > 1) {
          const { picked, reason } = pickWeightedRandom(sceneItems, samplingSeed, usedSceneSet, 1);
          if (picked.length > 0) sceneItems = picked;
          assetPickTrace = { ...(assetPickTrace || {}), scenePickReason: reason };
        }
        if (!lockedAssets?.outfitId && !allocatedAssets?.outfitId && outfitItems.length > 1) {
          const { picked } = pickWeightedRandom(outfitItems, samplingSeed + 3, new Set(), 1);
          if (picked.length > 0) outfitItems = picked;
        }
        if (!lockedAssets?.personaId && !allocatedAssets?.personaId && personaItems.length > 1) {
          const { picked } = pickWeightedRandom(personaItems, samplingSeed + 7, new Set(), 1);
          if (picked.length > 0) personaItems = picked;
        }

        // 回填锁定资产标题
        if (lockedAssets?.personaId && personaItems[0]) lockedAssets.personaName = personaItems[0].name;
        if (lockedAssets?.sceneId && sceneItems[0]) lockedAssets.sceneTitle = sceneItems[0].title;
        if (lockedAssets?.outfitId && outfitItems[0]) lockedAssets.outfitTitle = outfitItems[0].title;
        if (lockedAssets?.actionId && actionItems[0]) lockedAssets.actionTitle = actionItems[0].title;

        const mappedPersonas = personaItems.map((p: any) => ({
          id: p.id,
          code: stableAssetCode('P', String(p.id)),
          name: p.name,
          description: p.reversePrompt || p.description,
          reversePrompt: p.reversePrompt || null,
        }));
        const mappedScenes = sceneItems.map((s: any) => ({
          id: s.id,
          code: stableAssetCode('S', String(s.id)),
          title: s.title,
          description: s.reversePrompt || s.description,
          lighting: s.lighting,
          reversePrompt: s.reversePrompt || null,
        }));
        const mappedOutfits = outfitItems.map((o: any) => ({
          id: o.id,
          code: stableAssetCode('O', String(o.id)),
          title: o.title,
          top: o.top,
          bottom: o.bottom,
          colorPalette: o.colorPalette,
          reversePrompt: o.reversePrompt || null,
        }));
        const mappedActions = actionItems.map((a: any, idx: number) => {
          const rawAction = a.action || a.reversePrompt || '';
          const pureAction = extractPureActionFromPrompt(rawAction);
          const cleanedAction = stripGarmentsFromAction(pureAction || rawAction, idx);
          const subject = resolveAssetShotSubject({
            has_human: a.has_human,
            hasHuman: a.hasHuman,
            shotType: a.shotType,
            title: a.title,
            action: a.action,
            reversePrompt: a.reversePrompt,
          });
          return {
            id: a.id,
            code: a.code || stableAssetCode('A', String(a.id)),
            title: a.title,
            action: cleanedAction,
            camera: a.camera,
            shotType: subject?.shot_type || a.shotType,
            has_human: subject?.has_human,
            suitableAnatomy: a.suitableAnatomy,
            reversePrompt: a.reversePrompt
              ? stripGarmentsFromAction(extractPureActionFromPrompt(a.reversePrompt), idx)
              : null,
          };
        });

        assetLibraryData = {
          personas: mappedPersonas,
          scenes: mappedScenes,
          outfits: mappedOutfits,
          actions: mappedActions,
        };

        assetPickTrace = {
          ...(assetPickTrace || {}),
          sceneId: mappedScenes[0]?.id,
          outfitId: mappedOutfits[0]?.id,
          personaId: mappedPersonas[0]?.id,
          actionIds: mappedActions.map((a: { id: string }) => a.id).filter(Boolean),
        };
      }
    } catch (assetErr) {
      console.warn('[Analyze API] 读取提示词资产库失败，使用通用大模型自主生成:', assetErr);
    }
  }

  // 出镜主体由每条动作资产决定：仅当这组动作都明确为无人时，才启用纯商品架构。
  // 混合资产保留逐镜 has_human，不能再由一个全局开关覆盖。
  const actionSubjects = assetLibraryData?.actions || [];
  const isAllStillLife =
    actionSubjects.length > 0 &&
    actionSubjects.every((action: { has_human?: boolean }) => action.has_human === false);
  const assetDrivenNoModel = isAllStillLife;

  let systemPrompt = buildVisionSystemPrompt({
    productTitle: productTitle || '指定商品',
    productProps,
    templateStyle: resolvedTemplateStyle !== 'auto' ? resolvedTemplateStyle : undefined,
    shotCount,
    extraRequirements,
    modelPersona: personaText,
    hasAnchorFace: hasAnchorFace && !assetDrivenNoModel,
    architectureMode: isAllStillLife ? 'pure_product' : 'seed_portrait',
    previousMasterScenes: Array.isArray(previousMasterScenes)
      ? previousMasterScenes.filter((s: unknown) => typeof s === 'string' && s.trim()).slice(0, 2)
      : [],
    previousGroupSignatures: Array.isArray(previousGroupSignatures)
      ? previousGroupSignatures
          .filter((s: any) => s && (typeof s.scene === 'string' || typeof s.actionDigest === 'string'))
          .map((s: any) => ({
            scene: String(s.scene || '').trim(),
            actionDigest: String(s.actionDigest || '').trim(),
          }))
          .filter((s: { scene: string; actionDigest: string }) => s.scene || s.actionDigest)
          .slice(0, 3)
      : [],
    assetLibraryData,
    lockedAssets,
  });

  const coreProductImages = (Array.isArray(imageUrls) ? imageUrls : []).slice(0, 3);
  const imagesToInspect = [
    ...coreProductImages,
    ...(hasAnchorFace && !assetDrivenNoModel ? [anchorFaceImageUrl] : []),
  ].filter(Boolean) as string[];

  if (hasAnchorFace && !assetDrivenNoModel) {
    systemPrompt += `\n\n【传入图片顺序】：第 1 张起为商品实物图（@图片1）；最后一张为专属正脸 ID（生图 @图片2，仅五官）。`;
  }

  const preparedImages = await prepareAnalyzeImages(imagesToInspect);

  console.log(`[Vision Analyze] 正在使用用户指定模型 ${model} 进行视觉提示词提炼...`);
  const visionResult = await callVisionModel(
    model,
    buildVisionContent(systemPrompt, preparedImages),
    targetBaseUrl,
    targetApiKey,
    fallbackModels,
    shotCount
  );
  const rawOutput = visionResult.rawText;
  const actualModelUsed = visionResult.actualModel;
  const triedModels = visionResult.triedModels;
  const visionUsage = visionResult.usage ? { ...visionResult.usage } : null;

  if (!rawOutput) {
    throw new Error(`视觉模型 [${actualModelUsed}] 未返回任何内容，请检查模型可用性或切换其他模型`);
  }

  return assembleStoryboardShots({
    rawOutput,
    shotCount,
    productTitle,
    productProps,
    isNoModel: assetDrivenNoModel,
    hasAnchorFace,
    productIndex,
    assetLibraryData,
    lockedAssets,
    assetPickTrace,
    actionItems,
    actualModelUsed,
    triedModels,
    visionUsage,
  });
}
