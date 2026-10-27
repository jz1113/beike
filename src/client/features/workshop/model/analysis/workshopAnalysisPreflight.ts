import { resolveRecipeForProduct, type RecipeForProduct } from '@shared/domain/products/productRecipeSelection';
import type { BatchProductItem } from '../batchTypes';

export interface AnalysisPreflightConfig {
  selectedArchId: string;
  recipes: RecipeForProduct[];
  skillLoadState?: 'loading' | 'ready' | 'error';
  skillLoadError?: string;
}

/** Check product and skill readiness only; reference inventory never gates production. */
export function workshopAnalysisBlockReason(config: AnalysisPreflightConfig, item: BatchProductItem): string | null {
  if (item.status !== 'success') return '请先完成商品采集';
  if (!item.selectedProductImages?.some(url => typeof url === 'string' && url.trim())) return '请先选择并确认商品图';
  if (config.skillLoadState === 'loading') return '正在加载创作技能，请稍后再分析';
  if (config.skillLoadState === 'error') return `创作技能加载失败：${config.skillLoadError || '请刷新技能后重试'}`;
  const resolved = resolveRecipeForProduct(config.recipes, config.selectedArchId, item);
  if (!resolved.recipe) return resolved.error;
  if (resolved.recipe.id !== '__category_skill__' && !resolved.recipe.promptSnippet?.trim()) return '创作技能内容为空，请先补全技能';
  return null;
}
