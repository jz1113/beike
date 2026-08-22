interface ExportImageItem {
  filename?: string;
  url: string;
  shotNo?: number;
  title?: string;
  prompt?: string;
}

export interface ExportZipBody {
  batchTitle?: string;
  products?: Array<{
    skuId?: string;
    productTitle?: string;
    title?: string;
    description?: string;
    video?: string | null;
    videoUrl?: string | null;
    images: (string | ExportImageItem)[];
  }>;
  skuId?: string;
  productTitle?: string;
  description?: string;
  video?: string | null;
  videoUrl?: string | null;
  images?: (string | ExportImageItem)[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strMax(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new Error('字段类型无效');
  if (v.length > max) throw new Error(`字符串超过 ${max} 字符`);
  return v;
}

function parseImages(v: unknown, maxItems: number): (string | ExportImageItem)[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new Error('images 必须是数组');
  if (v.length > maxItems) throw new Error(`images 超过 ${maxItems} 项`);
  return v.map((item) => {
    if (typeof item === 'string') {
      if (item.length > 4096) throw new Error('图片 URL 过长');
      return item;
    }
    if (isObject(item) && typeof item.url === 'string') {
      if (item.url.length > 4096) throw new Error('图片 URL 过长');
      return {
        filename: strMax(item.filename, 256),
        url: item.url,
        shotNo: typeof item.shotNo === 'number' ? item.shotNo : undefined,
        title: strMax(item.title, 500),
        prompt: strMax(item.prompt, 8000),
      };
    }
    throw new Error('images 项格式无效');
  });
}

export function parseExportZipBody(body: unknown):
  { success: true; data: ExportZipBody } | { success: false; error: string } {
  try {
    if (!isObject(body)) {
      return { success: false, error: '请求体无效' };
    }
    const products = body.products === undefined
      ? undefined
      : (() => {
          if (!Array.isArray(body.products)) throw new Error('products 必须是数组');
          if (body.products.length > 50) throw new Error('products 超过 50 项');
          return body.products.map((p) => {
            if (!isObject(p)) throw new Error('products 项格式无效');
            return {
              skuId: strMax(p.skuId, 128),
              productTitle: strMax(p.productTitle, 500),
              title: strMax(p.title, 500),
              description: strMax(p.description, 5000),
              video: p.video === null ? null : strMax(p.video, 2048),
              videoUrl: p.videoUrl === null ? null : strMax(p.videoUrl, 2048),
              images: parseImages(p.images, 200) || [],
            };
          });
        })();

    const data: ExportZipBody = {
      batchTitle: strMax(body.batchTitle, 200),
      skuId: strMax(body.skuId, 128),
      productTitle: strMax(body.productTitle, 500),
      description: strMax(body.description, 5000),
      video: body.video === null ? null : strMax(body.video, 2048),
      videoUrl: body.videoUrl === null ? null : strMax(body.videoUrl, 2048),
      images: parseImages(body.images, 500),
      products,
    };
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '请求体无效',
    };
  }
}
