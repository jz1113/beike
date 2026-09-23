import type { ShotPrompt } from '@beike/domain/vision';
import {
  assembleOriginalShotPrompt,
  assembleGrid2x2Prompt,
  cleanPromptText,
  enforceLookConsistency,
  extractOutfitFromPrompt,
  isGenericLook,
  preventJewelryGlitches,
} from '@beike/domain/drawing';
import type { BatchProductItem } from './batchTypes';

export function formatAnalyzedStoryboard(opts: {
  data: any;
  item: BatchProductItem;
  imagePayload: string[];
}): {
  formattedPrompts: ShotPrompt[];
  gridPrompt: string;
  lookBible: string;
  lookParts: any;
  identityBible: string;
  styleBible: string;
  masterScene: string;
  productRole: any;
  productFingerprint: string;
} {
  const { data, item, imagePayload } = opts;
  const lookPartsFromApi = data?.lookParts || data?.look_parts || null;
  const styleBibleFromApi = data?.styleBible || data?.style_bible || '';
  const masterFromApi = data?.masterScene || data?.master_scene || '';
  const lookFromApi = data?.lookBible || data?.look_bible || '';
  const identityFromApi = data?.identityBible || data?.identity_bible || '';
  const productRoleFromApi = data?.productRole || data?.product_role || null;
  const fingerprintFromApi = data?.productFingerprint || data?.product_fingerprint || '';

  const formattedPrompts: ShotPrompt[] = (data.prompts || []).map((p: any, idx: number) => {
    // 四镜共用同一商品实物锚图；轮换不同商品照片会导致型号和品牌漂移。
    const assignedImg = imagePayload[0] || item.coverImage;
    const rawPrompt = cleanPromptText(p.prompt || p.description || '');
    const isHumanShot = typeof p.has_human === 'boolean' ? p.has_human : true;
    const finalPrompt = assembleOriginalShotPrompt({
          identityBible: identityFromApi, lookBible: lookFromApi, lookParts: lookPartsFromApi || undefined,
          masterScene: masterFromApi, styleBible: styleBibleFromApi, productRole: productRoleFromApi || undefined,
          productFingerprint: fingerprintFromApi || undefined,
        }, {
          shot_no: p.shot_no || idx + 1, expression: isHumanShot ? p.expression : '无（纯静物）',
          action: p.action, prop: p.prop, optics: p.optics, camera_focal_length: p.camera_focal_length,
          angle: p.angle, lighting_type: p.lighting_type, scene: p.scene || masterFromApi,
          title: p.title, has_human: isHumanShot, promptFallback: rawPrompt,
        }, { hasFace: false, skipRichPrompt: true });
    return {
      shot_no: p.shot_no || idx + 1,
      title: p.title || `分镜 ${idx + 1}`,
      scene: p.scene || masterFromApi || '真实买家秀生活场景',
      expression: isHumanShot ? (p.expression || '') : '',
      action: p.action || '',
      prop: p.prop || '',
      optics: p.optics || '',
      camera_focal_length: p.camera_focal_length || '',
      angle: p.angle || '平视视角',
      lighting_type: p.lighting_type || '柔和自然漫反射',
      has_human: isHumanShot,
      shot_type: p.shot_type || (isHumanShot ? 'model_shot' : 'pure_product'),
      productImageUrl: assignedImg,
      compositionReferenceImageUrl: p.compositionReferenceImageUrl,
      prompt: p.prompt || finalPrompt,
      applied_scene: p.applied_scene || data?.applied_scene || data?.appliedScene,
      applied_outfit: p.applied_outfit || data?.applied_outfit || data?.appliedOutfit,
      applied_action: p.applied_action,
      applied_persona: p.applied_persona || data?.applied_persona || data?.appliedPersona,
      selected: true,
    };
  });

  let canonicalOutfit = lookPartsFromApi;
  if (formattedPrompts.some(p => p.has_human !== false)) {
    if (!canonicalOutfit?.top || isGenericLook(canonicalOutfit.top)) {
      const firstHuman = formattedPrompts.find(p => p.has_human !== false);
      if (firstHuman) {
        const extracted = extractOutfitFromPrompt(firstHuman.prompt);
        if (extracted?.top && !isGenericLook(extracted.top)) {
          canonicalOutfit = { top: extracted.top, bottom: extracted.bottom || '高腰直筒深色牛仔裤', shoes: '黑色复古乐福鞋', accessory: '佩戴 @图片1 所示商品' };
        }
      }
    }
    formattedPrompts.forEach((p) => {
      p.prompt = p.has_human !== false
        ? enforceLookConsistency(p.prompt, canonicalOutfit, productRoleFromApi, fingerprintFromApi)
        : preventJewelryGlitches(p.prompt, fingerprintFromApi);
    });
  }

  const lookParts = (canonicalOutfit?.top && !isGenericLook(canonicalOutfit.top)) ? canonicalOutfit : (lookPartsFromApi || undefined);
  const lookBible = (canonicalOutfit?.top && !isGenericLook(canonicalOutfit.top))
    ? `身穿${canonicalOutfit.top}${canonicalOutfit.bottom ? `，搭配${canonicalOutfit.bottom}` : ''}`
    : (lookFromApi || '质感显白私服穿搭');
  const gridBible = {
    identityBible: identityFromApi || (formattedPrompts.every(p => p.has_human === false) ? '纯商品静物，无人物' : ''),
    lookBible, lookParts, masterScene: masterFromApi || '真实买家秀生活场景',
    styleBible: styleBibleFromApi, productRole: productRoleFromApi || undefined, productFingerprint: fingerprintFromApi || undefined,
  };
  const gridShots = formattedPrompts.map(p => ({
    shot_no: p.shot_no, title: p.title, expression: p.expression, action: p.action, prop: p.prop,
    optics: p.optics, camera_focal_length: p.camera_focal_length, angle: p.angle, lighting_type: p.lighting_type,
    scene: p.scene, has_human: p.has_human,
  }));
  const gridPrompt = assembleGrid2x2Prompt(gridBible, gridShots, { macroSlotIndex: 0 });

  return {
    formattedPrompts, gridPrompt, lookBible, lookParts, identityBible: identityFromApi,
    styleBible: styleBibleFromApi, masterScene: masterFromApi, productRole: productRoleFromApi, productFingerprint: fingerprintFromApi,
  };
}
