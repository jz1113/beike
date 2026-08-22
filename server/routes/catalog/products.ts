import { jsonResponse } from '../../adapters/http';
import { prisma } from '@/lib/prisma';
import { normalizeImageUrlToStandardJpg, isProductImageUrl } from '@/lib/drawing';

// 获取已采集保存的商品记录列表（分页）
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50));

    const [total, products] = await Promise.all([
      prisma.product.count(),
      prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const formatted = products.map(p => {
      let imageCount = 0;
      let cleanedDetailUrls = p.detailUrls;
      try {
        if (p.detailUrls) {
          const imgs = JSON.parse(p.detailUrls);
          const cleanMain = Array.isArray(imgs.main) ? imgs.main.map(normalizeImageUrlToStandardJpg).filter(isProductImageUrl) : [];
          const cleanSkus = Array.isArray(imgs.skus) ? imgs.skus.map(normalizeImageUrlToStandardJpg).filter(isProductImageUrl) : [];
          const cleanDetails = Array.isArray(imgs.details) ? imgs.details.map(normalizeImageUrlToStandardJpg).filter(isProductImageUrl) : [];
          imageCount = cleanMain.length + cleanSkus.length + cleanDetails.length;
          // 保留原有 props/price/brand/category 等元数据
          cleanedDetailUrls = JSON.stringify({
            ...imgs,
            main: cleanMain,
            skus: cleanSkus,
            details: cleanDetails,
          });
        }
      } catch {}
      return {
        ...p,
        picUrl: normalizeImageUrlToStandardJpg(p.picUrl),
        detailUrls: cleanedDetailUrls,
        imageCount
      };
    });

    return jsonResponse({ success: true, page, pageSize, total, products: formatted });
  } catch (error: any) {
    return jsonResponse({ success: false, products: [], error: error.message }, 500);
  }
}

// 创建或保存自定义/本地上传商品记录（只保存用户选中的图片链接）
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { platform = 'local', itemId, title, picUrl, detailUrls, selectedImages } = body;

    if (!title || !itemId) {
      return jsonResponse({ error: '缺少商品标题或商品ID' }, 400);
    }

    const rawSaved = Array.isArray(selectedImages) && selectedImages.length > 0
      ? selectedImages
      : (Array.isArray(detailUrls?.main) ? detailUrls.main : (picUrl ? [picUrl] : []));
    
    const savedImages = rawSaved.map(normalizeImageUrlToStandardJpg).filter(Boolean);
    const cleanPicUrl = normalizeImageUrlToStandardJpg(picUrl) || savedImages[0] || '';

    const existing = await prisma.product.findFirst({
      where: { platform, itemId: itemId.toString() }
    });

    let product;
    if (existing) {
      product = await prisma.product.update({
        where: { id: existing.id },
        data: {
          title,
          picUrl: cleanPicUrl || normalizeImageUrlToStandardJpg(existing.picUrl),
          detailUrls: JSON.stringify({ main: savedImages })
        }
      });
    } else {
      product = await prisma.product.create({
        data: {
          platform,
          itemId: itemId.toString(),
          title,
          picUrl: cleanPicUrl,
          detailUrls: JSON.stringify({ main: savedImages })
        }
      });
    }

    return jsonResponse({ success: true, product });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// 修改商品信息或同步已选中的图片
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, title, itemId, picUrl, selectedImages } = body;

    if (!id) {
      return jsonResponse({ error: '缺少商品记录 id' }, 400);
    }

    const updateData: any = {};
    if (title) updateData.title = title;
    if (itemId) updateData.itemId = itemId.toString();
    if (picUrl) updateData.picUrl = normalizeImageUrlToStandardJpg(picUrl);
    if (Array.isArray(selectedImages)) {
      updateData.detailUrls = JSON.stringify({ main: selectedImages.map(normalizeImageUrlToStandardJpg).filter(Boolean) });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: updateData
    });

    return jsonResponse({ success: true, product: updated });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// 删除某条采集商品记录
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: '缺少 id 参数' }, 400);
    }

    await prisma.product.delete({
      where: { id }
    });

    return jsonResponse({ success: true });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

