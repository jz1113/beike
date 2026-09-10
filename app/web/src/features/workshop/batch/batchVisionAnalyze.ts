import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { apiFetch } from '@/lib/apiClient';
import {
  ShotPrompt,
  pickVisionAnalyzeFallbacks,
  PreviousGroupSignature,
} from '@beike/shared/vision';
import {
  assembleOriginalShotPrompt,
  assembleGrid2x2Prompt,
  assembleReplicationGrid2x2Prompt,
  cleanPromptText,
  ensureReplicationPromptSlots,
  softenReplicationSafetyWording,
  normalizeImageUrlToStandardJpg,
  enforceLookConsistency,
  extractOutfitFromPrompt,
  isGenericLook,
  preventJewelryGlitches,
} from '@beike/shared/drawing';
import { getGatewayClientOverrides } from '@/lib/gatewayClient';
import { recordModelUsage, resolveModelVendor } from '@/lib/usageTracker';
import { buildJewelryTemplateStyle, isJewelryProductTitle } from '@beike/shared/jewelryArchHelpers';
import type { BatchProductItem } from './batchTypes';
import { resolveHarmonizedTemplatesForItem } from './batchVisionAnalyzeHelpers';

export type VisionAnalyzeDeps = {
  recipes: Array<{ id: string; name: string; category?: string; promptSnippet?: string }>;
  selectedArchId: string;
  batchMode?: 'original' | 'replication';
  items?: BatchProductItem[];
  hasHumanPersona: boolean;
  lockedPersonaId: string;
  lockedSceneId: string;
  lockedOutfitId: string;
  lockedActionId: string;
  selectedShotCount: number;
  selectedVisionModel: string;
  availableVisionModels?: Array<{ id: string }>;
  useAssetLibrary?: boolean;
  availablePersonas?: unknown[];
  availableScenes?: unknown[];
  availableOutfits?: unknown[];
  setItems?: Dispatch<SetStateAction<BatchProductItem[]>>;
  batchGroupSignaturesRef?: MutableRefObject<PreviousGroupSignature[]>;
  batchActionIdsRef?: MutableRefObject<string[]>;
  batchSceneIdsRef?: MutableRefObject<string[]>;
};

export async function analyzeBatchProduct(
  deps: VisionAnalyzeDeps,
  item: BatchProductItem,
  itemIndex?: number,
  allocatedAsset?: {
    scene?: any;
    outfit?: any;
    persona?: any;
    actions?: any[];
  }
): Promise<boolean> {
    const archObj = deps.recipes.find(r => r.id === deps.selectedArchId) || deps.recipes[0];
    const isSocialMode = deps.batchMode === 'replication';
    const mode = isSocialMode ? 'social_face_product_swap' : 'storyboard_generate';

    const chosenProductImgs = item.selectedProductImages.length > 0
      ? item.selectedProductImages
      : [item.coverImage];
    const imagePayload = chosenProductImgs.map(normalizeImageUrlToStandardJpg);

    const chosenRefImgs = isSocialMode
      ? (item.selectedReferenceImages.length > 0 ? item.selectedReferenceImages : item.availableReferenceImages)
      : [];

    const effectivePersona = deps.hasHumanPersona
      ? '长相自然清秀的年轻东亚女生，自然生活感淡妆，真实自然肤质与细微毛孔，自然随性碎发，神态松弛自然'
      : '纯商品实物拍摄，无人物无模特，纯静物真实生活光影陈设';

    const { customBaseUrl: localUrl, customApiKey: localApiKey } = getGatewayClientOverrides();
    const targetShotCount = isSocialMode ? Math.max(1, chosenRefImgs.length) : (deps.selectedShotCount || 4);

    let data: any = null;
    let apiError: string | null = null;

    const lockedAssets = (deps.lockedPersonaId !== 'auto' || deps.lockedSceneId !== 'auto' || deps.lockedOutfitId !== 'auto' || deps.lockedActionId !== 'auto') ? {
      personaId: deps.lockedPersonaId !== 'auto' ? deps.lockedPersonaId : undefined,
      sceneId: deps.lockedSceneId !== 'auto' ? deps.lockedSceneId : undefined,
      outfitId: deps.lockedOutfitId !== 'auto' ? deps.lockedOutfitId : undefined,
      actionId: deps.lockedActionId !== 'auto' ? deps.lockedActionId : undefined,
    } : undefined;

    const computedProductIdx = typeof itemIndex === 'number'
      ? itemIndex
      : (deps.items ? deps.items.findIndex(p => p.id === item.id) : 0);

    const isJewelryArch =
      deps.selectedArchId === 'recipe_jewelry_master' ||
      deps.selectedArchId === 'arch_jewelry_master' ||
      archObj.id === 'recipe_jewelry_master' ||
      /珠宝|jewelry/i.test(String(archObj.category || ''));
    const templateStyle =
      isJewelryArch || isJewelryProductTitle(item.title, item.props)
        ? buildJewelryTemplateStyle(archObj.name, archObj.promptSnippet || '', item.title, item.props)
        : `${archObj.name} \n${archObj.promptSnippet || ''}`;

    try {
      const res = await apiFetch('/api/generate/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          productTitle: item.title || '优质电商商品',
          productProps: item.props || {},
          productIndex: Math.max(0, computedProductIdx),
          imageUrls: imagePayload,
          referenceImageUrls: chosenRefImgs,
          modelPersona: effectivePersona,
          templateStyle,
          useAssetLibrary: deps.useAssetLibrary,
          lockedAssets,
          allocatedAssets: allocatedAsset ? {
            sceneId: allocatedAsset.scene?.id,
            outfitId: allocatedAsset.outfit?.id,
            personaId: allocatedAsset.persona?.id,
            actionIds: allocatedAsset.actions?.map((a: any) => a.id),
          } : undefined,
          extraRequirements: `- 🚨【分镜数量严格保证】：必须输出完整的 ${targetShotCount} 个分镜，数组 prompts 长度必须严格等于 ${targetShotCount}！\n- 🚨【商品外观唯一锚定 @图片1】：美学置景与构图写入文字，生图只垫商品图。`,
          shotCount: targetShotCount,
          model: deps.selectedVisionModel,
          fallbackModels: pickVisionAnalyzeFallbacks(
            deps.selectedVisionModel,
            (deps.availableVisionModels || []).map(m => m.id).filter(Boolean)
          ),
          customBaseUrl: localUrl,
          customApiKey: localApiKey,
          previousGroupSignatures: deps.batchGroupSignaturesRef?.current?.slice(-4) || [],
          previousActionIds: deps.batchActionIdsRef?.current?.slice(-16) || [],
          previousSceneIds: deps.batchSceneIdsRef?.current?.slice(-20) || [],
        })
      });

      data = await res.json().catch(() => ({ error: `视觉分析接口响应解析异常 (HTTP ${res.status})` }));
      if (!res.ok || data?.error || !data?.prompts || data.prompts.length === 0) {
        apiError = data?.error || `视觉大模型响应异常 (HTTP ${res.status})`;
      }
    } catch (err: any) {
      apiError = err.message || '视觉分析请求超时或网络异常';
    }

    if (apiError || !data?.prompts || data.prompts.length === 0) {
      deps.setItems?.(prev => prev.map(p => {
        if (p.id !== item.id) return p;
        return {
          ...p,
          isAnalyzing: false,
          analyzedSuccess: false,
          analysisError: apiError || '视觉模型未返回有效分镜',
          prompts: []
        };
      }));
      throw new Error(apiError || '视觉模型未返回有效分镜');
    }

    // 🌟 记录多模态视觉模型真实调用与 Token 吞吐
    try {
      const usedModel = data?.modelUsed || deps.selectedVisionModel;
      const usageTokens = data?.usage || {};
      const promptTokens = usageTokens.promptTokens || usageTokens.prompt_tokens || 0;
      const completionTokens = usageTokens.completionTokens || usageTokens.completion_tokens || 0;
      const totalTokens = usageTokens.totalTokens || usageTokens.total_tokens || (promptTokens + completionTokens);

      recordModelUsage({
        modelId: usedModel,
        modelName: usedModel,
        provider: resolveModelVendor(usedModel),
        type: 'vision',
        promptTokens,
        completionTokens,
        totalTokens,
        mediaCount: imagePayload.length,
        success: true,
      });
    } catch {}

    const lookPartsFromApi = data?.lookParts || data?.look_parts || null;
    const styleBibleFromApi = data?.styleBible || data?.style_bible || '';
    const masterFromApi = data?.masterScene || data?.master_scene || '';
    const lookFromApi = data?.lookBible || data?.look_bible || '';
    const identityFromApi = data?.identityBible || data?.identity_bible || '';
    const productRoleFromApi = data?.productRole || data?.product_role || null;
    const fingerprintFromApi = data?.productFingerprint || data?.product_fingerprint || '';

    const digest = (data?.prompts || [])
      .map((s: any) => [s.expression, s.action].filter(Boolean).join('/'))
      .filter(Boolean)
      .join(' | ');
    if (deps.batchGroupSignaturesRef && (masterFromApi || digest || lookFromApi)) {
      deps.batchGroupSignaturesRef.current = [
        ...deps.batchGroupSignaturesRef.current,
        { scene: masterFromApi, actionDigest: digest, lookBible: lookFromApi }
      ].slice(-6);
    }
    if (deps.batchActionIdsRef && Array.isArray(data?.usedActionIds) && data.usedActionIds.length > 0) {
      deps.batchActionIdsRef.current = [
        ...deps.batchActionIdsRef.current,
        ...data.usedActionIds.map(String)
      ].slice(-24);
    }
    if (deps.batchSceneIdsRef && data?.selectedSceneId) {
      deps.batchSceneIdsRef.current = [
        ...deps.batchSceneIdsRef.current,
        String(data.selectedSceneId),
      ].slice(-24);
    }

    const formattedPrompts: ShotPrompt[] = (data.prompts || []).map((p: any, idx: number) => {
      const assignedImg = imagePayload[idx % imagePayload.length] || item.coverImage;
      const rawPrompt = cleanPromptText(p.prompt || p.description || '');
      const isHumanShot = deps.hasHumanPersona && (p.has_human !== false);

      const finalPrompt = isSocialMode
        ? softenReplicationSafetyWording(
            ensureReplicationPromptSlots(rawPrompt, {
              hasHuman: isHumanShot,
              hasFace: false,
              expression: p.expression || ''
            })
          )
        : assembleOriginalShotPrompt(
            {
              identityBible: identityFromApi,
              lookBible: lookFromApi,
              lookParts: lookPartsFromApi || undefined,
              masterScene: masterFromApi,
              styleBible: styleBibleFromApi,
              productRole: productRoleFromApi || undefined,
              productFingerprint: fingerprintFromApi || undefined,
            },
            {
              shot_no: p.shot_no || idx + 1,
              expression: isHumanShot ? p.expression : '无（纯静物）',
              action: p.action,
              prop: p.prop,
              optics: p.optics,
              camera_focal_length: p.camera_focal_length,
              angle: p.angle,
              lighting_type: p.lighting_type,
              scene: p.scene || masterFromApi,
              title: p.title,
              has_human: isHumanShot,
              promptFallback: rawPrompt,
            }
          );

      return {
        shot_no: p.shot_no || idx + 1,
        title: p.title || `分镜 ${idx + 1}`,
        scene: p.scene || masterFromApi || '真实买家秀生活场景',
        expression: isHumanShot ? (p.expression || '') : '',
        action: p.action || '',
        prop: p.prop || '',
        optics: p.optics || '',
        camera_focal_length: p.camera_focal_length || '85mm f/1.8 浅景深',
        angle: p.angle || '平视视角',
        lighting_type: p.lighting_type || '柔和自然漫反射',
        has_human: isHumanShot,
        shot_type: isHumanShot ? 'model_shot' : 'pure_product',
        productImageUrl: assignedImg,
        prompt: p.prompt || finalPrompt,
        applied_scene: p.applied_scene || data?.applied_scene || data?.appliedScene,
        applied_outfit: p.applied_outfit || data?.applied_outfit || data?.appliedOutfit,
        applied_action: p.applied_action,
        applied_persona: p.applied_persona || data?.applied_persona || data?.appliedPersona,
        selected: true
      };
    });

    const harmonizedTemplates = resolveHarmonizedTemplatesForItem({
      masterScene: masterFromApi || '',
      productTitle: item.title || '',
      hasHumanPersona: deps.hasHumanPersona,
      lockedSceneId: deps.lockedSceneId,
      availableScenes: deps.availableScenes as Array<{ id: string; shots?: unknown[]; description?: string; title?: string }>,
    });

    while (formattedPrompts.length < targetShotCount) {
      const idx = formattedPrompts.length;
      const t = harmonizedTemplates[idx % harmonizedTemplates.length];
      const assignedImg = imagePayload[idx % imagePayload.length] || item.coverImage;
      const isHumanShot = deps.hasHumanPersona && t.hasHuman;

      const fallbackPrompt = isSocialMode
        ? softenReplicationSafetyWording(
            ensureReplicationPromptSlots(
              `【爆款复刻实拍】：按对标图 ${idx + 1} 反推美学生成真实生活实拍，主体为 @图片1 所示商品实物，无鼠标光标或广告文字。`,
              {
                hasHuman: isHumanShot,
                hasFace: false,
                expression: t.expression
              }
            )
          )
        : assembleOriginalShotPrompt(
            {
              identityBible: identityFromApi,
              lookBible: lookFromApi,
              lookParts: lookPartsFromApi || undefined,
              masterScene: masterFromApi || '真实买家秀生活场景',
              styleBible: styleBibleFromApi,
              productRole: productRoleFromApi || undefined,
              productFingerprint: fingerprintFromApi || undefined,
            },
            {
              shot_no: idx + 1,
              expression: isHumanShot ? t.expression : '无（纯静物）',
              action: t.action,
              prop: '与生活场景匹配的极简自然道具',
              optics: `${t.camera}，${t.angle}，Shot on iPhone 16 Pro 手机后置原相机随手抓拍（Unedited RAW photo），f/1.8 自然光学浅景深，清晰物理接触阴影与自然传感器微颗粒感`,
              camera_focal_length: t.camera,
              angle: t.angle,
              lighting_type: '柔和自然漫反射',
              scene: t.sceneSuffix || masterFromApi || '真实买家秀生活场景',
              title: t.title,
              has_human: isHumanShot,
            }
          );

      formattedPrompts.push({
        shot_no: idx + 1,
        title: t.title,
        scene: t.sceneSuffix || masterFromApi || '真实买家秀生活场景',
        expression: isHumanShot ? t.expression : '',
        action: t.action,
        prop: '与生活场景匹配的极简自然道具',
        optics: `${t.camera}，${t.angle}，Shot on iPhone 16 Pro 手机后置原相机随手抓拍（Unedited RAW photo），f/1.8 自然光学浅景深，清晰物理接触阴影与自然传感器微颗粒感`,
        camera_focal_length: t.camera,
        angle: t.angle,
        lighting_type: '柔和自然漫反射',
        has_human: isHumanShot,
        shot_type: isHumanShot ? 'model_shot' : 'pure_product',
        productImageUrl: assignedImg,
        prompt: fallbackPrompt,
        selected: true
      });
    }

    // 🚨 组内穿搭强锁定：提取首镜穿搭并强制同步全套人物分镜（解决批量生产中同款商品分镜换衣服问题）
    let canonicalOutfit = lookPartsFromApi;
    if (formattedPrompts.some(p => p.has_human !== false)) {
      if (!canonicalOutfit?.top || isGenericLook(canonicalOutfit.top)) {
        const firstHuman = formattedPrompts.find(p => p.has_human !== false);
        if (firstHuman) {
          const extracted = extractOutfitFromPrompt(firstHuman.prompt);
          if (extracted?.top && !isGenericLook(extracted.top)) {
            canonicalOutfit = {
              top: extracted.top,
              bottom: extracted.bottom || '高腰直筒深色牛仔裤',
              shoes: '黑色复古乐福鞋',
              accessory: '佩戴 @图片1 所示商品'
            };
          }
        }
      }
      formattedPrompts.forEach((p) => {
        if (p.has_human !== false) {
          p.prompt = enforceLookConsistency(p.prompt, canonicalOutfit, productRoleFromApi, fingerprintFromApi);
          if (isSocialMode) {
            p.prompt = softenReplicationSafetyWording(p.prompt);
          }
        } else {
          p.prompt = preventJewelryGlitches(p.prompt, fingerprintFromApi);
        }
      });
    }

    // 组装 2x2 四宫格 Master Collage 提示词（复刻走 replication 槽位+安全软化）
    // 🚨 严密回填首镜权威穿搭进 gridBible，防止大图主指令出现泛化空洞导致各格子换衣服
    const effectiveLookPartsForGrid = (canonicalOutfit?.top && !isGenericLook(canonicalOutfit.top))
      ? canonicalOutfit
      : (lookPartsFromApi || undefined);
    const effectiveLookBibleForGrid = (canonicalOutfit?.top && !isGenericLook(canonicalOutfit.top))
      ? `身穿${canonicalOutfit.top}${canonicalOutfit.bottom ? `，搭配${canonicalOutfit.bottom}` : ''}`
      : (lookFromApi || '质感显白私服穿搭');

    const gridBible = {
      identityBible: identityFromApi || (deps.hasHumanPersona ? '' : '纯商品静物，无人物'),
      lookBible: effectiveLookBibleForGrid,
      lookParts: effectiveLookPartsForGrid,
      masterScene: masterFromApi || '真实买家秀生活场景',
      styleBible: styleBibleFromApi,
      productRole: productRoleFromApi || undefined,
      productFingerprint: fingerprintFromApi || undefined,
    };
    const gridShots = formattedPrompts.map(p => ({
      shot_no: p.shot_no,
      title: p.title,
      expression: p.expression,
      action: p.action,
      prop: p.prop,
      optics: p.optics,
      camera_focal_length: p.camera_focal_length,
      angle: p.angle,
      lighting_type: p.lighting_type,
      scene: p.scene,
      has_human: p.has_human,
    }));
    const effectiveIndex = typeof itemIndex === 'number'
      ? itemIndex
      : (deps.items ? deps.items.findIndex(p => p.id === item.id) : 0);
    const gridPrompt = isSocialMode
      ? assembleReplicationGrid2x2Prompt(gridBible, gridShots, { macroSlotIndex: 0 })
      : assembleGrid2x2Prompt(gridBible, gridShots, { macroSlotIndex: 0 });

    deps.setItems?.(prev => prev.map(p => {
      if (p.id !== item.id) return p;
      return {
        ...p,
        isAnalyzing: false,
        analyzedSuccess: true,
        analysisError: apiError || undefined,
        lookBible: effectiveLookBibleForGrid,
        identityBible: identityFromApi,
        styleBible: styleBibleFromApi,
        masterScene: masterFromApi,
        applied_scene: data?.applied_scene || data?.appliedScene,
        applied_outfit: data?.applied_outfit || data?.appliedOutfit,
        applied_persona: data?.applied_persona || data?.appliedPersona,
        productRole: productRoleFromApi,
        productFingerprint: fingerprintFromApi,
        lookParts: effectiveLookPartsForGrid,
        prompts: formattedPrompts,
        gridPrompt
      };
    }));

    return true;
  }

export async function runBatchVisionAnalyze(opts: {
  items: BatchProductItem[];
  concurrency: number;
  isAborted: () => boolean;
  analyzeOne: (item: BatchProductItem, index: number) => Promise<void>;
  onItemStart: (item: BatchProductItem) => void;
  onItemFinish: (finished: number, total: number) => void;
  onItemError: (item: BatchProductItem, err: unknown) => void;
}): Promise<number> {
  let successAnalyzed = 0;
  let finishedCount = 0;
  let itemIdx = 0;
  const concurrency = Math.min(opts.concurrency || 16, opts.items.length);

  const worker = async () => {
    while (itemIdx < opts.items.length && !opts.isAborted()) {
      const currentItemIdx = itemIdx++;
      const item = opts.items[currentItemIdx];
      if (!item) break;
      opts.onItemStart(item);
      try {
        await opts.analyzeOne(item, currentItemIdx);
        successAnalyzed++;
      } catch (err) {
        opts.onItemError(item, err);
      } finally {
        finishedCount++;
        opts.onItemFinish(finishedCount, opts.items.length);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return successAnalyzed;
}
