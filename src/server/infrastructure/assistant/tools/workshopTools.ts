import { OFFICIAL_MASTER_RECIPES } from '@shared/domain/prompts/masterRecipes';
import { prisma } from '@server/infrastructure/database/prisma';
import { formatToolError } from '../toolSafety';

export async function listWorkshopArchitectures(): Promise<Array<{ id: string; name: string }>> {
  const stored = await prisma.styleRecipe.findMany({ select: { id: true, name: true }, orderBy: { updatedAt: 'desc' }, take: 100 });
  const recipes = new Map(OFFICIAL_MASTER_RECIPES.map(recipe => [recipe.id, { id: recipe.id, name: recipe.name }]));
  for (const recipe of stored) recipes.set(recipe.id, recipe);
  return [...recipes.values()];
}

export async function toolSetWorkshopArch(args: Record<string, unknown>): Promise<string> {
  const archId = typeof args.arch_id === 'string' ? args.arch_id.trim() : '';
  try {
    const official = OFFICIAL_MASTER_RECIPES.find(recipe => recipe.id === archId);
    const recipe = official || (archId ? await prisma.styleRecipe.findUnique({ where: { id: archId }, select: { id: true, name: true } }) : null);
    if (!recipe) return JSON.stringify({ success: false, error: archId ? '拍摄架构不存在，请从可用列表选择' : '缺少拍摄架构 ID', availableArchitectures: await listWorkshopArchitectures() });
    return JSON.stringify({ success: true, action: 'set_workshop_arch', arch_id: recipe.id, reason: args.reason || '', message: `已核实架构「${recipe.name}」，已请求切换` });
  } catch (error) { return JSON.stringify({ success: false, error: formatToolError(error, '读取拍摄架构失败，请稍后重试') }); }
}
