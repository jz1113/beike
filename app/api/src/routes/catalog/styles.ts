import { jsonResponse } from '../../core/http';
import { prisma } from '@beike/shared/prisma';
import { formatUserError } from '@beike/shared/upstreamErrors';

// 获取已保存的自定义风格配方列表（分页）
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50));

    const where: Record<string, unknown> = {};
    if (category && category !== 'all') {
      where.category = category;
    }

    const [total, recipes] = await Promise.all([
      prisma.styleRecipe.count({ where }),
      prisma.styleRecipe.findMany({
        where,
        orderBy: [
          { isFavorite: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          category: true,
          tag: true,
          desc: true,
          coverUrl: true,
          sampleImages: true,
          isFavorite: true,
          createdAt: true,
          updatedAt: true,
          promptSnippet: true,
        },
      }),
    ]);

    return jsonResponse({
      success: true,
      page,
      pageSize,
      total,
      recipes,
    });
  } catch (error: any) {
    console.error('[StyleRecipe] GET 异常:', error);
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}

// 创建并保存新的自定义风格配方（支持 action=seed 一键导入官方预置）
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'seed') {
      const { OFFICIAL_MASTER_RECIPES } = await import('@beike/shared/masterRecipes');

      for (const item of OFFICIAL_MASTER_RECIPES) {
        const exists = await prisma.styleRecipe.findFirst({
          where: {
            OR: [
              { id: item.id },
              { name: item.name },
              { category: item.category },
              { name: { contains: '珠宝' } },
            ],
          },
        });
        if (exists) {
          await prisma.styleRecipe.update({
            where: { id: exists.id },
            data: {
              name: item.name,
              category: item.category,
              tag: item.tag,
              desc: item.desc,
              promptSnippet: item.promptSnippet,
              coverUrl: item.coverUrl,
              sampleImages: item.sampleImages,
              isFavorite: true,
            },
          });
        } else {
          await prisma.styleRecipe.create({ data: item });
        }
      }
      return jsonResponse({ success: true, message: '官方预置品类拍摄大架构已全面更新至 V6.0 资产库联动版' });
    }

    const body = await req.json();
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

    const recipe = await prisma.styleRecipe.create({
      data: {
        name,
        category,
        tag: tag || '',
        desc: desc || '',
        promptSnippet,
        coverUrl: coverUrl || '',
        sampleImages: typeof sampleImages === 'string' ? sampleImages : JSON.stringify(sampleImages || []),
        sourceUrl: sourceUrl || ''
      }
    });

    return jsonResponse({ success: true, recipe });
  } catch (error: any) {
    console.error('[StyleRecipe] POST 异常:', error);
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}

// 修改风格配方 (重命名、调整类目、置顶收藏、微调提示词)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, category, tag, desc, promptSnippet, isFavorite, coverUrl } = body;

    if (!id) {
      return jsonResponse({ error: '缺少配方 id' }, 400);
    }

    const dataToUpdate: any = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (category !== undefined) dataToUpdate.category = category;
    if (tag !== undefined) dataToUpdate.tag = tag;
    if (desc !== undefined) dataToUpdate.desc = desc;
    if (promptSnippet !== undefined) dataToUpdate.promptSnippet = promptSnippet;
    if (isFavorite !== undefined) dataToUpdate.isFavorite = isFavorite;
    if (coverUrl !== undefined) dataToUpdate.coverUrl = coverUrl;

    const updated = await prisma.styleRecipe.update({
      where: { id },
      data: dataToUpdate
    });

    return jsonResponse({ success: true, recipe: updated });
  } catch (error: any) {
    console.error('[StyleRecipe] PUT 异常:', error);
    return jsonResponse({ error: formatUserError(error) }, 500);
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

    await prisma.styleRecipe.delete({
      where: { id }
    });

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error('[StyleRecipe] DELETE 异常:', error);
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}
