import { jsonResponse } from '../../adapters/http';
import { prisma } from '@/lib/prisma';

// 获取所有已保存的自定义风格配方列表
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    const where: any = {};
    if (category && category !== 'all') {
      where.category = category;
    }

    const recipes = await prisma.styleRecipe.findMany({
      where,
      orderBy: [
        { isFavorite: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return jsonResponse({ success: true, recipes });
  } catch (error: any) {
    console.error('[StyleRecipe] GET 异常:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

// 创建并保存新的自定义风格配方
export async function POST(req: Request) {
  try {
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
    return jsonResponse({ error: error.message }, 500);
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
    return jsonResponse({ error: error.message }, 500);
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
    return jsonResponse({ error: error.message }, 500);
  }
}
