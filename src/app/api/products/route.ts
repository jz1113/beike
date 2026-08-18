import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 获取所有已采集保存的商品记录列表
export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const formatted = products.map(p => {
      let imageCount = 0;
      try {
        if (p.detailUrls) {
          const imgs = JSON.parse(p.detailUrls);
          imageCount = (imgs.main?.length || 0) + (imgs.skus?.length || 0) + (imgs.details?.length || 0);
        }
      } catch {}
      return {
        ...p,
        imageCount
      };
    });

    return NextResponse.json({ success: true, products: formatted });
  } catch (error: any) {
    return NextResponse.json({ success: true, products: [], warning: error.message });
  }
}

// 创建或保存自定义/本地上传商品记录（只保存用户选中的图片链接）
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { platform = 'local', itemId, title, picUrl, detailUrls, selectedImages } = body;

    if (!title || !itemId) {
      return NextResponse.json({ error: '缺少商品标题或商品ID' }, { status: 400 });
    }

    const savedImages = Array.isArray(selectedImages) && selectedImages.length > 0
      ? selectedImages
      : (Array.isArray(detailUrls?.main) ? detailUrls.main : (picUrl ? [picUrl] : []));

    const existing = await prisma.product.findFirst({
      where: { platform, itemId: itemId.toString() }
    });

    let product;
    if (existing) {
      product = await prisma.product.update({
        where: { id: existing.id },
        data: {
          title,
          picUrl: picUrl || existing.picUrl,
          detailUrls: JSON.stringify({ main: savedImages })
        }
      });
    } else {
      product = await prisma.product.create({
        data: {
          platform,
          itemId: itemId.toString(),
          title,
          picUrl: picUrl || '',
          detailUrls: JSON.stringify({ main: savedImages })
        }
      });
    }

    return NextResponse.json({ success: true, product });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 修改商品信息或同步已选中的图片
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, title, itemId, picUrl, selectedImages } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少商品记录 id' }, { status: 400 });
    }

    const updateData: any = {};
    if (title) updateData.title = title;
    if (itemId) updateData.itemId = itemId.toString();
    if (picUrl) updateData.picUrl = picUrl;
    if (Array.isArray(selectedImages)) {
      updateData.detailUrls = JSON.stringify({ main: selectedImages.filter(Boolean) });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ success: true, product: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 删除某条采集商品记录
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 });
    }

    await prisma.product.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

