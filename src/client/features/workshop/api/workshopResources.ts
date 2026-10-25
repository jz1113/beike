import { apiRequest } from '@client/shared/api/apiRequest';
import { getGlobalAssetLibrary } from '@client/shared/api/assetLibraryCache';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import type { WorkshopRecipeSummary } from '../model/workshopResourceRules';

export { loadSystemConfiguredModels };

/**
 * 以服务端的可见配方列表为准。服务端会过滤用户隐藏的官方架构；
 * 客户端不能再拼入内置配方，否则删除或编辑后的官方架构会重新出现。
 */
export async function fetchRecipes(): Promise<WorkshopRecipeSummary[]> {
  const recipes: Array<Record<string, unknown>> = [];
  const pageSize = 100;
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    const res = await apiRequest('GET', '/api/catalog/styles', { search: `page=${page}&pageSize=${pageSize}` });
    if (!res.ok) throw new Error('电商图文技能加载失败');
    const data = await res.json();
    if (!data.success || !Array.isArray(data.recipes)) throw new Error('电商图文技能响应无效');
    if (page === 1 && Number.isInteger(data.total) && data.total > 0) pages = Math.ceil(data.total / pageSize);
    if (page === 1 && data.categorySkillBase) recipes.push(data.categorySkillBase);
    recipes.push(...data.recipes);
    if (data.recipes.length === 0) break;
  }
  return [...new Map(recipes.map((recipe) => [recipe.id, recipe])).values()].map((recipe) => ({
    id: String(recipe.id),
    name: String(recipe.name ?? ''),
    category: String(recipe.category || 'general'),
    tag: String(recipe.tag || '已保存配方'),
    promptSnippet: String(recipe.promptSnippet || recipe.prompt_snippet || ''),
    libraryVersion: typeof recipe.libraryVersion === 'string' ? recipe.libraryVersion : undefined,
  }));
}

export async function fetchAssetLibraryOptions(force = false) {
  return getGlobalAssetLibrary(force);
}
