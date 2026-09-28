import { OFFICIAL_WORKSPACE_ID } from '@server/infrastructure/workspace/workspaceContext';
import { saveStyleRecipe, deleteStyleRecipe, listStyleRecipes, createStyleRecipe, type StyleRecipeChanges } from '../../repositories/styleRecipe';
import { jsonResponse } from '../../core/http';
import { readJsonBody } from '../../core/validate';

// 获取已保存的自定义风格配方列表（分页）
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50));

    const { total, recipes } = await listStyleRecipes(category, page, pageSize);

    return jsonResponse({
      success: true,
      page,
      pageSize,
      total,
      recipes: recipes.map(({ workspaceId, ...recipe }) => ({ ...recipe, isOfficial: workspaceId === OFFICIAL_WORKSPACE_ID })),
    });
  } catch (error: unknown) {
    console.error('[StyleRecipe] GET 异常:', error);
    return jsonResponse({ success: false, error: '架构操作失败，请稍后重试。' }, 500);
  }
}

// 创建并保存新的自定义风格配方（支持 action=seed 一键导入官方预置）
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'seed') {
      const { upsertOfficialMasterRecipes } = await import('@server/infrastructure/database/officialCatalogSeed');
      await upsertOfficialMasterRecipes();
      return jsonResponse({ success: true, message: '官方预置品类拍摄大架构已全面更新至 V6.0 资产库联动版' });
    }

    const body = await readJsonBody(req);
    const {
      name,
      category = 'general',
      tag,
      desc,
      promptSnippet,
      coverUrl,
      sampleImages,
      sourceUrl
    } = body;

    if (!name || !promptSnippet) {
      return jsonResponse({ error: '缺少风格名称或提示词配方内容' }, 400);
    }

    const recipe = await createStyleRecipe({
        name,
        category,
        tag: tag || '',
        desc: desc || '',
        promptSnippet,
        coverUrl: coverUrl || '',
        sampleImages: typeof sampleImages === 'string' ? sampleImages : JSON.stringify(sampleImages || []),
        sourceUrl: sourceUrl || ''
    });

    return jsonResponse({ success: true, recipe });
  } catch (error: unknown) {
    console.error('[StyleRecipe] POST 异常:', error);
    return jsonResponse({ success: false, error: '架构操作失败，请稍后重试。' }, 500);
  }
}

// 修改风格配方 (重命名、调整类目、置顶收藏、微调提示词)
export async function PUT(req: Request) {
  try {
    const body = await readJsonBody(req);
    const { id, name, category, tag, desc, promptSnippet, isFavorite, coverUrl } = body;

    if (!id) {
      return jsonResponse({ error: '缺少配方 id' }, 400);
    }

    const dataToUpdate: StyleRecipeChanges = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (category !== undefined) dataToUpdate.category = category;
    if (tag !== undefined) dataToUpdate.tag = tag;
    if (desc !== undefined) dataToUpdate.desc = desc;
    if (promptSnippet !== undefined) dataToUpdate.promptSnippet = promptSnippet;
    if (isFavorite !== undefined) dataToUpdate.isFavorite = isFavorite;
    if (coverUrl !== undefined) dataToUpdate.coverUrl = coverUrl;

    const result = await saveStyleRecipe(id, dataToUpdate);
    if (!result) return jsonResponse({ success: false, code: 'recipe_not_found', error: '该架构已不存在，请刷新列表。编辑内容已保留，可另存为新架构。' }, 404);
    return jsonResponse({ success: true, ...result });
  } catch (error: any) {
    console.error('[StyleRecipe] PUT 异常:', error);
    if (error?.code === 'P2025') return jsonResponse({ success: false, code: 'recipe_not_found', error: '该架构已不存在，编辑内容已保留，可另存为新架构。' }, 404);
    return jsonResponse({ success: false, error: '架构保存失败，请稍后重试。编辑内容已保留。' }, 500);
  }
}

// 删除某条风格配方
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: '缺少 id 参数' }, 400);
    }

    await deleteStyleRecipe(id);

    return jsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('[StyleRecipe] DELETE 异常:', error);
    return jsonResponse({ success: false, error: '架构操作失败，请稍后重试。' }, 500);
  }
}
