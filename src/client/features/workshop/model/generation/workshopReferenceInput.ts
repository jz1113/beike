import { imageCapabilities } from '@shared/domain/media/imageCapabilities';
import { upstreamModelId } from '@shared/domain/models/workflowModels';
import type { ShotPrompt } from '@shared/domain/prompts/vision';

export function isLegacyReferenceShot(shot: ShotPrompt): boolean {
  return shot.assembly_source === 'group_skeleton' || Boolean(shot.sourceReferenceImageUrl || shot.sourceGroupId || shot.sourcePrompt);
}

/** Only product images enter a new skill-driven generation request. */
export function workshopReferenceInput(shots: ShotPrompt[], productImageCount: number) {
  if (shots.some(isLegacyReferenceShot)) throw new Error('此分镜来自旧参考素材流程，请按创作技能重新分析后生成；历史成图和原任务仍可查看与恢复');
  return {
    compositionReferenceImages: [] as string[],
    instruction: `【商品图职责】@图片1 至 @图片${productImageCount} 仅用于当前同款商品的身份、结构、颜色和材质；画面构图、场景、人物与穿搭按已确认的技能分镜执行，不复制商品原图的广告字、原模特或背景。`,
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
