import { isAppearanceRotation, matchesAppearanceSelection, parseAppearanceSelection } from '@shared/domain/assets/appearanceSelection';
import { eligiblePromptGroups, isWorkshopAssetEligible, parseGroupShotSkeleton, type WorkshopAssetCandidate } from '@shared/domain/workshop/workshopPipeline';
import type { BatchProductItem } from '../batchTypes';

export interface AnalysisPreflightConfig {
  selectedArchId: string;
  recipes: Array<{ id: string }>;
  assetLoadState?: 'loading' | 'ready' | 'error';
  assetLoadError?: string;
  lockedFullPromptId?: string;
  lockedPersonaId: string;
  lockedSceneId: string;
  lockedOutfitId: string;
  availableFullPrompts?: WorkshopAssetCandidate[];
  availablePersonas?: WorkshopAssetCandidate[];
  availableScenes?: WorkshopAssetCandidate[];
  availableOutfits?: WorkshopAssetCandidate[];
}

/** Shared by single-product, batch and assisted analysis; no paid calls here. */
export function workshopAnalysisBlockReason(config: AnalysisPreflightConfig, item: BatchProductItem): string | null {
  if (item.status !== 'success') return '请先完成商品采集';
  if (!item.selectedProductImages?.some(url => typeof url === 'string' && url.trim())) return '请先选择并确认商品参考图';
  if (!config.recipes.some(recipe => recipe.id === config.selectedArchId)) return '请先确认有效的类目拍摄架构';
  if (config.assetLoadState === 'loading') return '正在加载生产资产，请稍后再分析';
  if (config.assetLoadState === 'error') return `生产资产加载失败，请在生产设置中重新加载：${config.assetLoadError || '请求失败'}`;
  const groups = (config.availableFullPrompts || []).filter(group => isWorkshopAssetEligible(group, 'full_prompt'));
  const explicitGroup = config.lockedFullPromptId && config.lockedFullPromptId !== 'auto';
  const group = explicitGroup ? groups.find(row => row.id === config.lockedFullPromptId) : undefined;
  if (explicitGroup && !group) return '锁定的图组母本已失效、未发布或不完整，请重新选择';
  if (!explicitGroup && eligiblePromptGroups(groups, item.title, item.props).length === 0) return '没有适配该商品的已发布四图母本，请到资产库导入并审核发布';
  const shots = parseGroupShotSkeleton(group?.shotPromptsJson);
  const acceptsPeople = !group || ((group as { hasHuman?: boolean }).hasHuman !== false && shots.some(
    shot => shot.has_human !== false && shot.shot_type !== 'hand_held_only' && shot.shot_type !== 'pure_product',
  ));
  const bindings = [
    { id: config.lockedSceneId, options: config.availableScenes, type: 'scene' as const, label: '场景', active: true },
    { id: config.lockedPersonaId, options: config.availablePersonas, type: 'persona' as const, label: '人物', active: acceptsPeople },
    { id: config.lockedOutfitId, options: config.availableOutfits, type: 'outfit' as const, label: '穿搭', active: acceptsPeople },
  ];
  for (const binding of bindings) {
    if (!binding.active || !binding.id || binding.id === 'auto') continue;
    if (isAppearanceRotation(binding.id) && binding.type !== 'scene') {
      const selection = parseAppearanceSelection(binding.id, binding.type === 'outfit');
      if (!binding.options?.some(row => isWorkshopAssetEligible(row, binding.type) && matchesAppearanceSelection({ ...row }, selection, binding.type === 'outfit'))) return `暂无可轮换的已发布${binding.label}资产，请先补充素材或沿用母本`;
      continue;
    }
    if (!binding.options?.some(row => row.id === binding.id && isWorkshopAssetEligible(row, binding.type))) {
      return `锁定的${binding.label}资产已失效、未发布或属于占位记录，请重新选择或沿用母本`;
    }
  }
  return null;
}
