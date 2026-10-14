import { isWorkshopAssetEligible } from '@shared/domain/workshop/workshopPipeline';
import { apiRequest } from '@client/shared/api/apiRequest';
import { useAppStore } from '@client/store';
import { getGlobalAssetLibrary } from '@client/shared/api/assetLibraryCache';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { hasActivePromptGroupFolders } from '@shared/domain/assets/promptGroupFolders';

export { loadSystemConfiguredModels };

/**
 * 以服务端的可见配方列表为准。服务端会过滤用户隐藏的官方架构；
 * 客户端不能再拼入内置配方，否则删除或编辑后的官方架构会重新出现。
 */
export async function fetchRecipes(
  setRecipes: (r: any[]) => void,
  setSelectedArchId: (id: string) => void
): Promise<void> {
  try {
    const recipes: any[] = [];
    const pageSize = 100;
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      const res = await apiRequest('GET', '/api/catalog/styles', { search: `page=${page}&pageSize=${pageSize}` });
      if (!res.ok) throw new Error('拍摄架构加载失败');
      const data = await res.json();
      if (!data.success || !Array.isArray(data.recipes)) throw new Error('拍摄架构响应无效');
      if (page === 1 && Number.isInteger(data.total) && data.total > 0) pages = Math.ceil(data.total / pageSize);
      recipes.push(...data.recipes);
      if (data.recipes.length === 0) break;
    }

    const visibleRecipes = [...new Map(recipes.map(recipe => [recipe.id, recipe])).values()].map((recipe: any) => ({
      id: recipe.id,
      name: recipe.name,
      category: recipe.category || 'general',
      tag: recipe.tag || '已保存配方',
      promptSnippet: recipe.promptSnippet || recipe.prompt_snippet || '',
    }));
    setRecipes(visibleRecipes);

    const selectedId = useAppStore.getState().selectedArchId;
    if (selectedId !== 'auto' && !visibleRecipes.some((recipe: { id: string }) => recipe.id === selectedId)) {
      setSelectedArchId(visibleRecipes.length ? 'auto' : '');
    } else if (selectedId === 'auto' && visibleRecipes.length === 0) {
      setSelectedArchId('');
    }
  } catch {
    // A failed request must not resurrect an official recipe that the user hid.
    // Keep the saved preference so a later successful reload can restore it.
    setRecipes([]);
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
  productCategories: AssetProductCategory[];
}> {
  const store = await getGlobalAssetLibrary(force);
  return {
    personas: store.personas.filter(row => isWorkshopAssetEligible(row, 'persona')),
    scenes: store.scenes.filter(row => isWorkshopAssetEligible(row, 'scene')),
    outfits: store.outfits.filter(row => isWorkshopAssetEligible(row, 'outfit')),
    actions: store.actions.filter(row => isWorkshopAssetEligible(row, 'action')),
    fullPrompts: store.fullPrompts.filter(row => isWorkshopAssetEligible(row, 'full_prompt') && hasActivePromptGroupFolders(row, store.productCategories)),
    productCategories: store.productCategories,
  };
}
