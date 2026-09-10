import { jsonResponse } from '../../core/http';
import { prisma } from '@beike/server-kit/prisma';
import { normalizeVisionModelId } from '@beike/domain/vision';
import { resolveGatewayCreds } from '@beike/domain/gatewayCreds';
import { formatVisionAnalyzeError } from '@beike/domain/visionTimeouts';
import { parseJsonBody, analyzeBodySchema } from '../../core/validate';
import { getDefaultBaseUrl, getDefaultApiKey } from '../../services/imageHelpers';
import { resolveTemplateStyleWithJewelryGuard } from './analyze/jewelryGuard';
import { executeSocialSwap } from './analyze/socialSwap';
import { executeStoryboard } from './analyze/storyboard';

export async function POST(req: Request) {
  try {
    const rawBody: unknown = await req.json();
    const parsed = parseJsonBody(rawBody, analyzeBodySchema);
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error }, 400);
    }
    const body: any = parsed.data;
    const {
      mode = 'storyboard_generate',
      productTitle,
      productProps,
      imageUrls = [],
      referenceImageUrls = [],
      anchorFaceImageUrl,
      modelPersona,
      productFingerprint,
      templateStyle = 'auto',
      shotCount = 4,
      extraRequirements = '',
      model = 'gpt-5.6-luna',
      fallbackModels = [],
      customBaseUrl,
      customApiKey,
      previousMasterScenes = [],
      previousGroupSignatures = [],
      previousActionIds = [],
      previousSceneIds = [],
      allocatedAssets,
    } = body;

    const { baseUrl: targetBaseUrl, apiKey: targetApiKey } = resolveGatewayCreds(
      req,
      { customBaseUrl, customApiKey },
      { baseUrl: getDefaultBaseUrl(), apiKey: getDefaultApiKey() }
    );

    if (!targetApiKey) {
      return jsonResponse(
        {
          error:
            '未配置 AI 视觉大模型接口密钥 (API Key)。请前往「⚙️ 设置 -> 服务接口配置」中填入您的 Comfly API 凭证。',
          missingConfig: 'apiKey',
        },
        400
      );
    }

    const personaText = modelPersona || '';
    const isNoModel =
      !personaText ||
      personaText === 'none' ||
      personaText.includes('无人物') ||
      personaText.includes('无需模特') ||
      personaText.includes('纯商品') ||
      personaText.includes('纯静物');

    const resolvedTemplateStyle = resolveTemplateStyleWithJewelryGuard(
      templateStyle,
      productTitle,
      productProps
    );

    const hasAnchorFace = Boolean(anchorFaceImageUrl);
    const productIndex =
      typeof body.productIndex === 'number'
        ? body.productIndex
        : typeof body.itemIndex === 'number'
        ? body.itemIndex
        : 0;

    let productFingerprintRaw = productFingerprint || '';
    let productRole: string | null = null;
    let effectiveMasterScene = '';
    let masterScene = '';
    let appliedSceneTitle: string | undefined = undefined;
    let selectedSceneId: string | null = null;
    let selectedOutfitId: string | null = null;
    let selectedPersonaId: string | null = null;
    let appliedOutfitTitle: string | undefined = undefined;
    let appliedPersonaName: string | undefined = undefined;
    let finalLookBible = '';
    let lookBible = '';
    let finalCanonicalOutfit: any = null;
    let sanitizedLookParts: any = null;
    let lookParts: any = null;
    let styleBible = '';
    let identityBible = '';
    let actionDigest = '';
    let groupSignature: { scene: string; actionDigest: string } | null = null;
    let formattedPrompts: any[] = [];
    let actualModelUsed = model;
    let triedModels: string[] = [];
    let rawOutput = '';
    let visionUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null =
      null;
    let usedActionIds: string[] = [];
    let assetTrace: any = null;

    if (mode === 'social_face_product_swap') {
      const socialResult = await executeSocialSwap({
        referenceImageUrls,
        imageUrls,
        shotCount,
        model,
        fallbackModels: Array.isArray(fallbackModels) ? fallbackModels : [],
        targetBaseUrl,
        targetApiKey,
        productTitle,
        productProps,
        modelPersona,
        hasAnchorFace,
        anchorFaceImageUrl,
        productFingerprint,
        templateStyle: typeof templateStyle === 'string' ? templateStyle : undefined,
        extraRequirements,
      });

      rawOutput = socialResult.rawOutput;
      actualModelUsed = socialResult.actualModelUsed;
      triedModels = socialResult.triedModels;
      visionUsage = socialResult.visionUsage;
      formattedPrompts = socialResult.prompts;
      actionDigest = socialResult.actionDigest;
    } else {
      const storyboardResult = await executeStoryboard({
        productTitle,
        productProps,
        imageUrls,
        anchorFaceImageUrl,
        modelPersona,
        productFingerprint,
        resolvedTemplateStyle,
        shotCount,
        extraRequirements,
        model,
        fallbackModels: Array.isArray(fallbackModels) ? fallbackModels : [],
        targetBaseUrl,
        targetApiKey,
        isNoModel,
        hasAnchorFace,
        previousMasterScenes,
        previousGroupSignatures,
        previousActionIds,
        previousSceneIds,
        allocatedAssets,
        lockedAssets: body.lockedAssets,
        productIndex,
        useAssetLibrary: body.useAssetLibrary,
      });

      productFingerprintRaw = storyboardResult.productFingerprintRaw;
      productRole = storyboardResult.productRole;
      effectiveMasterScene = storyboardResult.effectiveMasterScene;
      masterScene = storyboardResult.masterScene;
      appliedSceneTitle = storyboardResult.appliedSceneTitle;
      selectedSceneId = storyboardResult.selectedSceneAssetId;
      selectedOutfitId = storyboardResult.selectedOutfitAssetId;
      selectedPersonaId = storyboardResult.selectedPersonaAssetId;
      appliedOutfitTitle = storyboardResult.appliedOutfitTitle;
      appliedPersonaName = storyboardResult.appliedPersonaName;
      finalLookBible = storyboardResult.finalLookBible;
      lookBible = storyboardResult.lookBible;
      finalCanonicalOutfit = storyboardResult.finalCanonicalOutfit;
      sanitizedLookParts = storyboardResult.sanitizedLookParts;
      lookParts = storyboardResult.lookParts;
      styleBible = storyboardResult.styleBible;
      identityBible = storyboardResult.identityBible;
      actionDigest = storyboardResult.actionDigest;
      groupSignature = storyboardResult.groupSignature;
      formattedPrompts = storyboardResult.prompts;
      actualModelUsed = storyboardResult.actualModelUsed;
      triedModels = storyboardResult.triedModels;
      rawOutput = storyboardResult.rawOutput;
      visionUsage = storyboardResult.visionUsage;
      usedActionIds = storyboardResult.usedActionIds;
      assetTrace = storyboardResult.assetTrace;
    }

    // 自动持久化保存到本地数据库
    try {
      await prisma.promptRecord.create({
        data: {
          productTitle: productTitle || '未命名商品',
          productFingerprint: productFingerprintRaw,
          modelUsed: actualModelUsed,
          styleName:
            resolvedTemplateStyle !== 'auto' ? resolvedTemplateStyle : '📱 真实手机买家秀',
          promptsJson: JSON.stringify(formattedPrompts),
        },
      });
    } catch (dbErr) {
      console.warn('保存提示词到数据库时忽略轻微异常:', dbErr);
    }

    return jsonResponse({
      success: true,
      product_fingerprint: productFingerprintRaw,
      productFingerprint: productFingerprintRaw,
      product_role: productRole || null,
      productRole: productRole || null,
      master_scene: effectiveMasterScene || masterScene,
      masterScene: effectiveMasterScene || masterScene,
      applied_scene: appliedSceneTitle,
      appliedScene: appliedSceneTitle,
      selectedSceneId: selectedSceneId || null,
      selectedOutfitId: selectedOutfitId || null,
      selectedPersonaId: selectedPersonaId || null,
      applied_outfit: appliedOutfitTitle,
      appliedOutfit: appliedOutfitTitle,
      applied_persona: appliedPersonaName,
      appliedPersona: appliedPersonaName,
      look_bible: finalLookBible || lookBible,
      lookBible: finalLookBible || lookBible,
      look_parts: finalCanonicalOutfit || sanitizedLookParts || lookParts || null,
      lookParts: finalCanonicalOutfit || sanitizedLookParts || lookParts || null,
      style_bible: styleBible,
      styleBible,
      identity_bible: identityBible,
      identityBible,
      actionDigest,
      groupSignature:
        effectiveMasterScene || masterScene
          ? { scene: effectiveMasterScene || masterScene, actionDigest }
          : null,
      prompts: formattedPrompts,
      modelUsed: actualModelUsed,
      requestedModel: model,
      modelSwitched:
        actualModelUsed !== model && actualModelUsed !== normalizeVisionModelId(model),
      triedModels,
      rawOutput,
      usage: visionUsage,
      usedActionIds,
      assetTrace,
    });
  } catch (error: any) {
    console.error('Vision Analyze API Error:', error);
    return jsonResponse({ error: formatVisionAnalyzeError(error) }, 500);
  }
}
