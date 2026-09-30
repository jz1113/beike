import { jsonResponse } from '../../core/http';
import { readJsonBody } from '../../core/validate';
import { productRepository } from '@server/repositories/products';
import { normalizeImageUrlToStandardJpg, isProductImageUrl } from '@shared/domain/media/drawing';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { cleanupStorageObjects } from '@server/infrastructure/storage/storageCleanup';
import { resolveStorageConfig } from '@server/infrastructure/storage/storage';

// 获取已采集保存的商品记录列表（分页）
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50));

    const { total, products } = await productRepository.list(page, pageSize);

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
  } catch (error: unknown) {
    return jsonResponse({ success: false, products: [], error: formatUserError(error) }, 500);
  }
}

// 创建或保存自定义/本地上传商品记录（只保存用户选中的图片链接）
export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req);
    const { platform = 'local', itemId, title, picUrl, detailUrls, selectedImages } = body;

    if (!title || !itemId) {
      return jsonResponse({ error: '缺少商品标题或商品ID' }, 400);
    }

    const rawSaved = Array.isArray(selectedImages) && selectedImages.length > 0
      ? selectedImages
      : (Array.isArray(detailUrls?.main) ? detailUrls.main : (picUrl ? [picUrl] : []));
    
    const savedImages = rawSaved.map(normalizeImageUrlToStandardJpg).filter(Boolean);
    const cleanPicUrl = normalizeImageUrlToStandardJpg(picUrl) || savedImages[0] || '';

    const product = await productRepository.save({
      platform, itemId: itemId.toString(), title, cleanPicUrl, savedImages,
    });

    return jsonResponse({ success: true, product });
  } catch (error: unknown) {
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}

// 修改商品信息或同步已选中的图片
export async function PUT(req: Request) {
  try {
    const body = await readJsonBody(req);
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

    const updated = await productRepository.update(id, updateData);

    return jsonResponse({ success: true, product: updated });
  } catch (error: unknown) {
    return jsonResponse({ error: formatUserError(error) }, 500);
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

    const product = await productRepository.findMedia(id);

    if (product) {
      const mediaUrls: string[] = [];
      if (product.picUrl) mediaUrls.push(product.picUrl);
      if (product.detailUrls) {
        try {
          const parsed = JSON.parse(product.detailUrls);
          if (Array.isArray(parsed)) mediaUrls.push(...parsed.filter(Boolean));
        } catch {
          /* ignore json parse error */
        }
      }
      if (mediaUrls.length > 0) {
        cleanupStorageObjects(mediaUrls, resolveStorageConfig()).catch((err) => {
          console.warn('[删除商品-OSS清理异常]', err);
        });
      }
    }

    await productRepository.delete(id);

    return jsonResponse({ success: true });
  } catch (error: unknown) {
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}
