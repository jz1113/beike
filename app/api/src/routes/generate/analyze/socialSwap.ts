import {
  buildReplicationReverseSystemPrompt,
  buildReplicationOptimizeSystemPrompt,
  buildActionDigestFromShots,
} from '@beike/domain/vision';
import {
  cleanPromptText,
  ensureReplicationPromptSlots,
} from '@beike/domain/drawing';
import {
  prepareAnalyzeImages,
  buildVisionContent,
  mergePromptsByShotNo,
  missingShotNos,
  padMissingSocialShots,
  callVisionModel,
  parseResponseJson,
} from '../../../services/analyzeHelpers';

export interface SocialSwapParams {
  referenceImageUrls: string[];
  imageUrls: string[];
  shotCount: number;
  model: string;
  fallbackModels: string[];
  targetBaseUrl: string;
  targetApiKey: string;
  productTitle?: string;
  productProps?: Record<string, any>;
  modelPersona?: string;
  hasAnchorFace: boolean;
  anchorFaceImageUrl?: string;
  productFingerprint?: string;
  templateStyle?: string;
  extraRequirements?: string;
}

export interface SocialSwapResult {
  rawOutput: string;
  actualModelUsed: string;
  triedModels: string[];
  parsedResult: any;
  visionUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  prompts: any[];
  actionDigest: string;
}

export async function executeSocialSwap(params: SocialSwapParams): Promise<SocialSwapResult> {
  const {
    referenceImageUrls,
    imageUrls,
    shotCount,
    model,
    fallbackModels,
    targetBaseUrl,
    targetApiKey,
    productTitle,
    productProps,
    modelPersona,
    hasAnchorFace,
    anchorFaceImageUrl,
    productFingerprint,
    templateStyle,
    extraRequirements,
  } = params;

  const refUrls = (referenceImageUrls.length > 0 ? referenceImageUrls : imageUrls).filter(Boolean);
  const refCount = Math.max(1, refUrls.length || Number(shotCount) || 4);

  if (refUrls.length === 0 && imageUrls.length === 0) {
    throw new Error('爆款复刻缺少对标参考图或商品图');
  }

  console.log(`[Vision Analyze] 爆款复刻 Pass1 全维反推（${refCount} 张对标图）…`);
  const reverseSystemPrompt = `${buildReplicationReverseSystemPrompt({ referenceImageCount: refCount })}

【传入图片】：第 1 到第 ${refCount} 张依次为爆款参考图 1..${refCount}，请按序 1:1 反推。`;
  const preparedRefs = await prepareAnalyzeImages(refUrls.slice(0, refCount));
  const reverseResult = await callVisionModel(
    model,
    buildVisionContent(reverseSystemPrompt, preparedRefs),
    targetBaseUrl,
    targetApiKey,
    fallbackModels,
    refCount,
  );
  const reversePassRaw = reverseResult.rawText;
  let actualModelUsed = reverseResult.actualModel;
  let triedModels = reverseResult.triedModels;
  let visionUsage = reverseResult.usage ? { ...reverseResult.usage } : null;

  if (!reversePassRaw) {
    throw new Error(`视觉模型 [${actualModelUsed}] Pass1 反推未返回内容`);
  }

  const reverseParsed = parseResponseJson(reversePassRaw);
  let reversePrompts = mergePromptsByShotNo(reverseParsed.prompts || [], [], refCount);
  reversePrompts = padMissingSocialShots(
    reversePrompts.map((p: any, i: number) => ({
      ...p,
      shot_no: p.shot_no || i + 1,
      reverse_prompt:
        p.reverse_prompt ||
        p.prompt ||
        p.description ||
        (typeof p === 'string' ? p : ''),
      prompt: p.reverse_prompt || p.prompt || p.description || '',
    })),
    refCount
  ).map((p: any) => ({
    shot_no: p.shot_no,
    image_type: p.image_type || 'photography',
    has_human: p.has_human,
    shot_type: p.shot_type,
    title: p.title,
    scene: p.scene,
    reverse_prompt: String(
      p.reverse_prompt || p.prompt || `参考图 ${p.shot_no} 的场景结构、光影与构图实拍`
    ).trim(),
    negative_prompt: String(p.negative_prompt || p.negative_prompt_zh || '').trim() || undefined,
  }));

  console.log(`[Vision Analyze] 爆款复刻 Pass2 商品优化…`);
  const optimizeSystemPrompt = buildReplicationOptimizeSystemPrompt({
    productTitle: productTitle || '指定商品',
    productProps,
    referenceImageCount: refCount,
    modelPersona: modelPersona || '',
    hasAnchorFace,
    productFingerprint,
    templateStyle: typeof templateStyle === 'string' ? templateStyle : undefined,
    extraRequirements: extraRequirements || '',
    reverseShots: reversePrompts,
  });

  const optimizeImageRoles: string[] = [];
  let optIdx = 1;
  const optimizeImages: string[] = [];
  if (imageUrls.length > 0) {
    optimizeImageRoles.push(
      `- 第 ${optIdx} 起共 ${imageUrls.length} 张为【目标商品实物图】（生图 @图片1，外观唯一真相；product_fingerprint 只从此提取）`
    );
    optimizeImages.push(...imageUrls);
    optIdx += imageUrls.length;
  }
  if (hasAnchorFace && anchorFaceImageUrl) {
    optimizeImageRoles.push(
      `- 第 ${optIdx} 张为【专属正脸 ID】（生图 @图片3，仅五官；禁止抄其表情与背景）`
    );
    optimizeImages.push(anchorFaceImageUrl);
  }

  const optimizeFullPrompt = `${optimizeSystemPrompt}

【传入图片顺序】：
${optimizeImageRoles.join('\n') || '- 无商品图时仅依据标题/参数与反推原文优化'}
`;

  const preparedOptimize = await prepareAnalyzeImages(
    optimizeImages.length > 0 ? optimizeImages : imageUrls.slice(0, 1)
  );

  const optimizeContent =
    preparedOptimize.length > 0
      ? buildVisionContent(optimizeFullPrompt, preparedOptimize)
      : [{ type: 'text' as const, text: optimizeFullPrompt }];

  const optimizeResult = await callVisionModel(
    actualModelUsed,
    optimizeContent,
    targetBaseUrl,
    targetApiKey,
    fallbackModels,
    refCount,
  );
  let rawOutput = optimizeResult.rawText;
  if (optimizeResult.actualModel) actualModelUsed = optimizeResult.actualModel;
  triedModels = Array.from(new Set([...triedModels, ...optimizeResult.triedModels]));
  if (optimizeResult.usage) {
    visionUsage = {
      promptTokens: (visionUsage?.promptTokens || 0) + optimizeResult.usage.promptTokens,
      completionTokens: (visionUsage?.completionTokens || 0) + optimizeResult.usage.completionTokens,
      totalTokens: (visionUsage?.totalTokens || 0) + optimizeResult.usage.totalTokens,
    };
  }

  if (!rawOutput) {
    throw new Error(`视觉模型 [${actualModelUsed}] Pass2 优化未返回内容`);
  }

  const parsedResult = parseResponseJson(rawOutput);
  rawOutput = JSON.stringify({
    pass1_reverse: reversePassRaw,
    pass2_optimize: rawOutput,
  });

  let rawPromptsSocial = parsedResult.prompts || [];
  rawPromptsSocial = mergePromptsByShotNo(rawPromptsSocial, [], refCount);
  const missing = missingShotNos(rawPromptsSocial, refCount);
  if (missing.length > 0) {
    const refillPrompt = `你刚才输出的分镜数量不足。必须只补齐缺失的 shot_no：${missing.join('、')}（共 ${refCount} 镜，1:1）。
只输出 JSON：{"prompts":[...]}，数组里仅包含这 ${missing.length} 条。
每条含 shot_no、title、scene、expression、has_human、shot_type、prompt。
prompt 用简体中文；商品外观只认 @图片1；严禁出现 @图片2。
反推原文提示：\n${reversePrompts
      .filter((r) => missing.includes(r.shot_no))
      .map((r) => `[${r.shot_no}] ${r.reverse_prompt}`)
      .join('\n')}`;
    try {
      const refillResult = await callVisionModel(
        actualModelUsed,
        preparedOptimize.length > 0
          ? buildVisionContent(refillPrompt, preparedOptimize)
          : [{ type: 'text' as const, text: refillPrompt }],
        targetBaseUrl,
        targetApiKey,
        fallbackModels,
        refCount,
      );
      const extra = parseResponseJson(refillResult.rawText).prompts || [];
      rawPromptsSocial = mergePromptsByShotNo(rawPromptsSocial, extra, refCount);
      triedModels = Array.from(new Set([...triedModels, ...refillResult.triedModels]));
    } catch (refillErr) {
      console.warn('[Vision Analyze] 复刻缺镜补全失败，将按槽位垫齐:', refillErr);
    }
  }

  rawPromptsSocial = padMissingSocialShots(
    rawPromptsSocial.map((p: any, i: number) => {
      const rev = reversePrompts.find((r) => r.shot_no === (p.shot_no || i + 1));
      if (p.prompt) return p;
      return {
        ...p,
        prompt: rev?.reverse_prompt
          ? `【爆款复刻实拍】：${rev.reverse_prompt}；主体商品外观以 @图片1 为准。`
          : p.prompt,
        has_human: p.has_human ?? rev?.has_human,
        shot_type: p.shot_type || rev?.shot_type,
        image_type: p.image_type || rev?.image_type,
      };
    }),
    refCount
  );

  const formattedPrompts = rawPromptsSocial.map((p: any, idx: number) => {
    const promptText = (p.prompt || p.description || (typeof p === 'string' ? p : '')).toString();
    const hasHumanExplicit = p.has_human !== undefined ? Boolean(p.has_human) : undefined;
    const isPureStillLife = promptText.includes('无人物') || promptText.includes('无模特') || promptText.includes('纯静物') || promptText.includes('纯商品');
    const mentionsModelFace = !isPureStillLife && (
      promptText.includes('模特') ||
      promptText.includes('女生') ||
      promptText.includes('女性') ||
      promptText.includes('面容') ||
      promptText.includes('人脸') ||
      promptText.includes('五官') ||
      promptText.includes('自拍') ||
      promptText.includes('穿搭买家秀') ||
      promptText.includes('OOTD')
    );

    const finalHasHuman = hasHumanExplicit !== undefined
      ? hasHumanExplicit
      : (isPureStillLife ? false : mentionsModelFace);

    const isHandHeldOnly = !mentionsModelFace && (promptText.includes('手持') || promptText.includes('手部操作') || promptText.includes('双手'));
    const finalShotType = p.shot_type || (finalHasHuman ? 'model_shot' : (isHandHeldOnly ? 'hand_held_only' : 'pure_product'));

    const slotted = ensureReplicationPromptSlots(cleanPromptText(promptText), {
      hasHuman: finalHasHuman,
      hasFace: hasAnchorFace,
      expression: p.expression,
    });

    return {
      shot_no: p.shot_no || (idx + 1),
      title: p.title || `分镜 ${idx + 1}`,
      scene: p.scene || '',
      expression: p.expression || '',
      action: p.action || '',
      camera_focal_length: p.camera_focal_length || '85mm f/1.8 特写',
      angle: p.angle || '45° 沉浸视角',
      lighting_type: p.lighting_type || '自然日光漫反射',
      has_human: finalHasHuman,
      shot_type: finalShotType,
      prompt: slotted,
      selected: true,
    };
  });

  const actionDigest = buildActionDigestFromShots(formattedPrompts);

  return {
    rawOutput,
    actualModelUsed,
    triedModels,
    parsedResult,
    visionUsage,
    prompts: formattedPrompts,
    actionDigest,
  };
}
