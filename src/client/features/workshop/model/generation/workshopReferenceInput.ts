import { imageCapabilities } from '@shared/domain/media/imageCapabilities';
import { upstreamModelId } from '@shared/domain/models/workflowModels';
import type { ShotPrompt } from '@shared/domain/prompts/vision';
import { isPhoneProduct } from '@shared/domain/products/phoneProductPolicy';

export function isLegacyReferenceShot(shot: ShotPrompt): boolean {
  return shot.assembly_source === 'group_skeleton' || Boolean(shot.sourceReferenceImageUrl || shot.sourceGroupId || shot.sourcePrompt);
}

/** Only product images enter a new skill-driven generation request. */
export function workshopReferenceInput(shots: ShotPrompt[], productImageCount: number, product?: { title: string; productFingerprint?: string }) {
  if (shots.some(isLegacyReferenceShot)) throw new Error('此分镜来自旧参考素材流程，请按创作技能重新分析后生成；历史成图和原任务仍可查看与恢复');
  const phone = product && isPhoneProduct(product.title);
  const views = productImageCount > 1 ? `@图片1 至 @图片${productImageCount}` : '@图片1';
  return {
    compositionReferenceImages: [] as string[],
    instruction: [
      `【商品图职责】${views} 仅用于当前同款商品的身份、结构、颜色和材质；细节以展示该部位的商品图为准，保留可见的间距、位置与纹理；画面构图、场景、人物与穿搭按已确认的技能分镜执行，不复制商品原图的广告字、原模特或背景。`,
      phone && product.productFingerprint && `【同一台手机的可见特征】${product.productFingerprint}`,
      phone && '每格只出现一台。按机身自身的上下左右定位模组和标记；转动或裁切同时改变它们的画面位置，不镜像机身。区分模组外轮廓、镜头与其他装饰环或小窗；保留各自可见的数量、相对大小、间距和朝向，不把反光或装饰补成镜头。以对应商品图为准，不猜画外的孔位或文字。',
    ].filter(Boolean).join('\n'),
  };
}

export function workshopReferenceBudget(model: string, shots: ShotPrompt[], hasFace: boolean): number {
  if (shots.some(isLegacyReferenceShot)) throw new Error('旧参考素材分镜需按创作技能重新分析后才能发起新生图');
  const limit = imageCapabilities(upstreamModelId(model)).maxReferenceImages;
  if (!limit) return 4;
  const productSlots = limit - (hasFace ? 1 : 0);
  if (productSlots < 1) throw new Error(`该模型最多支持 ${limit} 张参考图，无法同时保留商品图和锁脸图，请选择参考图容量更大的模型`);
  return Math.min(4, productSlots);
}
