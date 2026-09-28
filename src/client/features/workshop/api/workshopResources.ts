import { isWorkshopAssetEligible } from '@shared/domain/workshop/workshopPipeline';
import { apiFetch } from '@client/shared/api/apiClient';
import { useAppStore } from '@client/store';
import { getGlobalAssetLibrary } from '@client/shared/api/assetLibraryCache';
import { SYSTEM_MASTER_RECIPES } from '../model/batchTypes';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';

export { loadSystemConfiguredModels };

/**
 * 拉取自定义配方列表并与系统配方合并
 */
export async function fetchRecipes(
  setRecipes: (r: any[]) => void,
  setSelectedArchId: (id: string) => void
): Promise<void> {
  try {
    const res = await apiFetch('/api/catalog/styles');
    const data = await res.json();
    if (data.success && Array.isArray(data.recipes) && data.recipes.length > 0) {
      const customFormatted = data.recipes.map((r: any) => ({
        id: r.id,
        name: r.id === 'recipe_jewelry_master' ? r.name : (r.name.startsWith('🌟 ') ? r.name : `🌟 ${r.name}`),
        category: r.category || '我的专属配方',
        tag: r.tag || '已保存配方',
        promptSnippet: r.promptSnippet || r.prompt_snippet || '',
      }));
      const dbIds = new Set(customFormatted.map((r: { id: string }) => r.id));
      const merged = [
        ...SYSTEM_MASTER_RECIPES.filter((r) => !dbIds.has(r.id)),
        ...customFormatted,
      ];
      setRecipes(merged);
      const prev = useAppStore.getState().selectedArchId;
      if (!merged.some((r) => r.id === prev)) {
        const jewelryArch = merged.find(
          (r) =>
            r.id === 'recipe_jewelry_master' ||
            r.id === 'arch_jewelry_master' ||
            /珠宝首饰/.test(String(r.name))
        );
        setSelectedArchId(jewelryArch?.id || merged[0]?.id || 'recipe_jewelry_master');
      }
    } else {
      setRecipes(SYSTEM_MASTER_RECIPES);
      if (!SYSTEM_MASTER_RECIPES.some((r) => r.id === useAppStore.getState().selectedArchId)) {
        setSelectedArchId(SYSTEM_MASTER_RECIPES[0].id);
      }
    }
  } catch {
    setRecipes(SYSTEM_MASTER_RECIPES);
    if (!SYSTEM_MASTER_RECIPES.some((r) => r.id === useAppStore.getState().selectedArchId)) {
      setSelectedArchId(SYSTEM_MASTER_RECIPES[0].id);
    }
  }
}

/**
 * 异步拉取全局资产库选项（人像、场景、穿搭、动作）
 */
export async function fetchAssetLibraryOptions(force = false): Promise<{
  personas: any[];
  scenes: any[];
  outfits: any[];
  actions: any[];
  fullPrompts: any[];
}> {
  const store = await getGlobalAssetLibrary(force);
  return {
    personas: store.personas.filter(row => isWorkshopAssetEligible(row, 'persona')),
    scenes: store.scenes.filter(row => isWorkshopAssetEligible(row, 'scene')),
    outfits: store.outfits.filter(row => isWorkshopAssetEligible(row, 'outfit')),
    actions: store.actions.filter(row => isWorkshopAssetEligible(row, 'action')),
    fullPrompts: store.fullPrompts.filter(row => isWorkshopAssetEligible(row, 'full_prompt')),
  };
}
