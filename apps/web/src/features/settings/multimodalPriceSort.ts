import { isMultimodalWorkflowModel, type WorkflowCapability } from '@beike/domain/workflowModels';
import { COMFY_MODEL_PRICING } from '@/shared/utils/modelPricing.data';

export type ComflyPriceMap = Record<string, { promptPer1k: number; completionPer1k: number }>;
type SortPriceMap = Record<string, { promptPer1k?: number; completionPer1k?: number }>;

/** 各输入、输出 1K token 的默认分组报价之和；只用于比较同类型对话模型。 */
export function multimodalPriceScore(modelId: string, prices: SortPriceMap = COMFY_MODEL_PRICING): number | null {
  const rule = prices[modelId.toLowerCase()];
  if (rule?.promptPer1k === undefined || rule.completionPer1k === undefined) return null;
  return rule.promptPer1k + rule.completionPer1k;
}

/** Reorder only multimodal slots. Keep image/video placement and unknown-price ties stable. */
export function sortMultimodalModelsByPrice<T extends WorkflowCapability>(models: readonly T[], prices?: SortPriceMap): T[] {
  const priced = models.filter(isMultimodalWorkflowModel).sort((a, b) => {
    const aPrice = multimodalPriceScore(a.id, prices);
    const bPrice = multimodalPriceScore(b.id, prices);
    if (aPrice === null) return bPrice === null ? 0 : 1;
    if (bPrice === null) return -1;
    return aPrice - bPrice;
  });
  let index = 0;
  return models.map((model) => isMultimodalWorkflowModel(model) ? priced[index++] : model);
}
