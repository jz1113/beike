import type { ShotPrompt } from '@beike/shared/vision';
import {
  assembleOriginalShotPrompt,
  ensureReplicationPromptSlots,
  softenReplicationSafetyWording,
  enforceLookConsistency,
  extractCanonicalOutfitFromPrompts,
} from '@beike/shared/drawing';
import type { BatchProductItem } from './batchTypes';
import { resolveHarmonizedTemplatesForItem } from './batchVisionAnalyzeHelpers';

export interface PromptPaddingContext {
  batchMode: 'original' | 'replication';
  hasHumanPersona: boolean;
  lockedSceneId?: string;
  availableScenes: any[];
  selectedShotCount?: number;
}

/**
 * 补齐并对齐商品的分镜提示词（若 prompts 为空则安全返回空列表）
 */
export function ensureItemPromptsPad(
  item: BatchProductItem,
  ctx: PromptPaddingContext,
  targetCount?: number
): ShotPrompt[] {
  const finalCount = targetCount ?? (ctx.selectedShotCount || 4);

  // 🚨 生产安全铁律：若商品原本未经过 AI 视觉分析（prompts 为空），严禁凭空伪造提示词！
  if (!item.prompts || item.prompts.length === 0) {
    return [];
  }
  const isSocialMode = ctx.batchMode === 'replication';
  // 🚨 从分镜 1 或已有分镜中精准提取模特实际穿着的权威服装 (Shot-1 As Single Source of Truth)
  const canonicalOutfit =
    item.prompts && item.prompts.length > 0
      ? extractCanonicalOutfitFromPrompts(item.prompts, item.productFingerprint || item.title)
      : null;

  const harmonizedTemplates = resolveHarmonizedTemplatesForItem({
    masterScene: item.masterScene || '',
    productTitle: item.title || '',
    hasHumanPersona: ctx.hasHumanPersona,
    lockedSceneId: ctx.lockedSceneId,
    availableScenes: ctx.availableScenes,
  });

  const padded = item.prompts ? [...item.prompts] : [];
  while (padded.length < finalCount) {
    const idx = padded.length;
    const t = harmonizedTemplates[idx % harmonizedTemplates.length];
    const isHumanShot = ctx.hasHumanPersona && t.hasHuman;
    const assignedImg =
      (item.selectedProductImages &&
        item.selectedProductImages[idx % item.selectedProductImages.length]) ||
      item.coverImage;

    const fallbackPrompt = isSocialMode
      ? softenReplicationSafetyWording(
          ensureReplicationPromptSlots(
            `【爆款复刻实拍】：按对标图 ${idx + 1} 反推美学生成真实生活实拍，主体为 @图片1 所示商品实物，无鼠标光标或广告文字。`,
            {
              hasHuman: isHumanShot,
              hasFace: false,
              expression: t.expression,
            }
          )
        )
      : assembleOriginalShotPrompt(
          {
            identityBible: item.identityBible,
            lookBible: item.lookBible,
            lookParts: canonicalOutfit || undefined,
            masterScene: item.masterScene,
            styleBible: item.styleBible,
            productRole: item.productRole || undefined,
            productFingerprint: item.productFingerprint || undefined,
          },
          {
            shot_no: idx + 1,
            expression: isHumanShot ? t.expression : '无（纯静物）',
            action: t.action,
            prop: '与生活场景匹配的极简自然道具',
            optics: `${t.camera}，${t.angle}，真实 iPhone 手机后置原相机随手抓拍`,
            camera_focal_length: t.camera,
            angle: t.angle,
            lighting_type: '柔和自然漫反射',
            scene: t.sceneSuffix || item.masterScene,
            title: t.title,
            has_human: isHumanShot,
          }
        );

    padded.push({
      shot_no: idx + 1,
      title: t.title,
      scene: t.sceneSuffix || item.masterScene || '真实买家秀生活场景',
      expression: isHumanShot ? t.expression : '',
      action: t.action,
      prop: '与生活场景匹配的极简自然道具',
      optics: `${t.camera}，${t.angle}`,
      camera_focal_length: t.camera,
      angle: t.angle,
      lighting_type: '柔和自然漫反射',
      has_human: isHumanShot,
      shot_type: isHumanShot ? 'model_shot' : 'pure_product',
      productImageUrl: assignedImg,
      prompt: fallbackPrompt,
      selected: true,
    });
  }

  // 🚨 全组 4 镜穿搭强同步：强制将分镜 1 的权威穿搭统一刷入全组所有人物分镜，100% 杜绝换装！
  if (ctx.hasHumanPersona) {
    padded.forEach((p) => {
      if (p.has_human !== false) {
        p.prompt = enforceLookConsistency(
          p.prompt,
          canonicalOutfit,
          item.productRole,
          item.productFingerprint || item.title
        );
        if (isSocialMode) {
          p.prompt = softenReplicationSafetyWording(p.prompt);
        }
      }
    });
  }

  return padded.slice(0, finalCount);
}
