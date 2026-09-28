import { isAppearanceRotation, matchesAppearanceSelection, parseAppearanceSelection } from '@shared/domain/assets/appearanceSelection';
import { eligiblePromptGroups, isAutoPromptGroupSelection, isWorkshopAssetEligible, promptGroupAppearance, promptGroupAppearanceFilter, type WorkshopAssetCandidate } from '@shared/domain/workshop/workshopPipeline';
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
  personaMode?: 'asset_driven' | 'none';
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
  const explicitGroup = !isAutoPromptGroupSelection(config.lockedFullPromptId);
  const group = explicitGroup ? groups.find(row => row.id === config.lockedFullPromptId) : undefined;
  if (explicitGroup && !group) return '锁定的图组母本已失效、未发布或不完整，请重新选择';
  const requestedAppearance = promptGroupAppearanceFilter(config.lockedFullPromptId);
  if (config.personaMode === 'none' && requestedAppearance === 'human') return '当前设置为无人物出镜，请将图组来源改为无人物或混合轮换';
  if (config.personaMode === 'none' && group && promptGroupAppearance(group) !== 'product') return '当前设置为无人物出镜，不能使用有人物或出镜待判定的图组母本';
  const appearanceFilter = config.personaMode === 'none' ? 'product' : requestedAppearance;
  const candidates = explicitGroup ? [] : eligiblePromptGroups(groups, item.title, item.props, appearanceFilter);
  if (!explicitGroup && candidates.length === 0) return appearanceFilter === 'human'
    ? '没有适配该商品的已发布有人物四图母本，请切换出镜范围或补充素材'
    : appearanceFilter === 'product'
      ? '没有适配该商品的已发布无人物四图母本，请切换出镜范围或补充素材'
      : '没有适配该商品的已发布四图母本，请到资产库导入并审核发布';
  const acceptsPeople = group
    ? promptGroupAppearance(group) === 'human'
    : candidates.some(candidate => promptGroupAppearance(candidate) === 'human');
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
