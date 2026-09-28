interface ExportImageItem {
  filename?: string;
  url: string;
  shotNo?: number;
  title?: string;
  prompt?: string;
}

export interface ExportZipBody {
  batchTitle?: string;
  offlineMatrix?: boolean;
  /** 图片/视频下载并发数，默认 16（最高），上限 16 */
  downloadConcurrency?: number;
  products?: Array<{
    skuId?: string;
    /** 导出时使用的顺序命名（1、2、3…）。 */
    currentName?: string;
    productTitle?: string;
    title?: string;
    description?: string;
    sourceUrl?: string;
    coverImage?: string;
    copywritingTitle?: string;
    copywritingContent?: string;
    copywritingTags?: string[];
    video?: string | null;
    videoUrl?: string | null;
    videos?: string[];
    images: (string | ExportImageItem)[];
  }>;
  skuId?: string;
  folderName?: string;
  productTitle?: string;
  copywritingTitle?: string;
  copywritingContent?: string;
  copywritingTags?: string[];
  description?: string;
  video?: string | null;
  videoUrl?: string | null;
  images?: (string | ExportImageItem)[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeString(v: unknown, max = 500, fallback = ''): string {
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, max);
  return fallback;
}

function safeOptionalString(v: unknown, max = 500): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, max);
  return undefined;
}

function parseImages(v: unknown, maxItems = 500): (string | ExportImageItem)[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) return [];
  const list = v.slice(0, maxItems);
  const result: (string | ExportImageItem)[] = [];
  for (const item of list) {
    if (!item) continue;
    if (typeof item === 'string') {
      if (item.trim()) result.push(item.trim());
    } else if (isObject(item) && typeof item.url === 'string' && item.url.trim()) {
      result.push({
        filename: safeOptionalString(item.filename, 256),
        url: item.url.trim(),
        shotNo: typeof item.shotNo === 'number' ? item.shotNo : undefined,
        title: safeOptionalString(item.title, 500),
        prompt: safeOptionalString(item.prompt, 10000),
      });
    }
  }
  return result;
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
          if (!Array.isArray(body.products)) return undefined;
          return body.products.slice(0, 2000).map((p, idx) => {
            if (!isObject(p)) {
              return {
                skuId: `PROD_${idx + 1}`,
                title: `商品_${idx + 1}`,
                images: [],
              };
            }
            return {
              skuId: safeOptionalString(p.skuId, 128) || `PROD_${idx + 1}`,
              currentName: safeOptionalString(p.currentName, 128),
              productTitle: safeOptionalString(p.productTitle, 500),
              title: safeOptionalString(p.title, 500) || `商品_${idx + 1}`,
              description: safeOptionalString(p.description, 50000),
              sourceUrl: safeOptionalString(p.sourceUrl, 4096),
              coverImage: safeOptionalString(p.coverImage, 4096),
              copywritingTitle: safeOptionalString(p.copywritingTitle, 500),
              copywritingContent: safeOptionalString(p.copywritingContent, 50000),
              copywritingTags: Array.isArray(p.copywritingTags)
                ? p.copywritingTags.map((t: unknown) => safeString(t, 100)).filter(Boolean)
                : undefined,
              video: p.video === null ? null : safeOptionalString(p.video, 4096),
              videoUrl: p.videoUrl === null ? null : safeOptionalString(p.videoUrl, 4096),
              videos: Array.isArray(p.videos)
                ? p.videos.map((url: unknown) => safeString(url, 4096)).filter(Boolean).slice(0, 50)
                : undefined,
              images: parseImages(p.images, 200) || [],
            };
          });
        })();

    const downloadConcurrency =
      body.downloadConcurrency === undefined || body.downloadConcurrency === null
        ? undefined
        : (() => {
            if (typeof body.downloadConcurrency !== 'number' || !Number.isFinite(body.downloadConcurrency)) {
              return 16;
            }
            const n = Math.floor(body.downloadConcurrency);
            return Math.max(1, Math.min(16, n));
          })();

    const data: ExportZipBody = {
      batchTitle: safeOptionalString(body.batchTitle, 200) || '全渠道采集批量导出',
      offlineMatrix: body.offlineMatrix === true,
      downloadConcurrency,
      skuId: safeOptionalString(body.skuId, 128),
      folderName: safeOptionalString(body.folderName, 300),
      productTitle: safeOptionalString(body.productTitle, 500),
      copywritingTitle: safeOptionalString(body.copywritingTitle, 500),
      copywritingContent: safeOptionalString(body.copywritingContent, 50000),
      copywritingTags: Array.isArray(body.copywritingTags)
        ? body.copywritingTags.map((t: unknown) => safeString(t, 100)).filter(Boolean)
        : undefined,
      description: safeOptionalString(body.description, 50000),
      video: body.video === null ? null : safeOptionalString(body.video, 4096),
      videoUrl: body.videoUrl === null ? null : safeOptionalString(body.videoUrl, 4096),
      images: parseImages(body.images, 500),
      products,
    };
    return { success: true, data };
  } catch {
    return {
      success: false,
      error: '请求体无效',
    };
  }
}
