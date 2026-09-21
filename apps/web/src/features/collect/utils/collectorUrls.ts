import { isProductImageUrl, normalizeImageUrlToStandardJpg } from '@beike/domain/drawing';

/**
 * 修复小红书图片域名
 */
export function fixXhsUrl(u: string): string {
  if (!u) return '';
  if (/ci\.xiaohongshu\.com/i.test(u)) {
    return u.replace(/https?:\/\/ci\.xiaohongshu\.com/i, 'https://sns-img-hw.xhscdn.com');
  }
  return u;
}

/**
 * 过滤合法图片链接（区分社媒与电商）
 */
export function keepCollectedUrl(u: string, isSocial: boolean): boolean {
  if (!u) return false;
  if (isSocial) {
    const n = fixXhsUrl(normalizeImageUrlToStandardJpg(u) || u);
    return /^https?:\/\//i.test(n) || n.startsWith('//');
  }
  return isProductImageUrl(normalizeImageUrlToStandardJpg(u) || u);
}

/**
 * 统一数据清洗过滤函数，彻底剔除统计追踪图、UI服务图标、角标等垃圾碎片
 */
export function sanitizeCollectedItem(it: any): any {
  if (!it) return it;
  const isSocial =
    it.platform === 'social' ||
    Boolean(it.video) ||
    /xiaohongshu|douyin|kuaishou|weibo|bilibili/i.test(String(it.url || ''));

  const keepUrl = (u: string) => keepCollectedUrl(u, isSocial);
  const mapImgs = (arr: any) =>
    (Array.isArray(arr) ? arr : [])
      .map((u: string) => fixXhsUrl(normalizeImageUrlToStandardJpg(u) || u))
      .filter(keepUrl);

  const cleanMain = mapImgs(it.mainImages?.length ? it.mainImages : it.images);
  const cleanSkus = mapImgs(it.skuImages);
  const cleanDesc = mapImgs(it.descImages?.length ? it.descImages : it.detailImages);
  const all = Array.from(new Set([...cleanMain, ...cleanSkus, ...cleanDesc])).filter(Boolean);
  const rawCover = fixXhsUrl(normalizeImageUrlToStandardJpg(it.coverImage) || cleanMain[0] || all[0] || '');
  const cover = keepUrl(rawCover) ? fixXhsUrl(normalizeImageUrlToStandardJpg(rawCover) || rawCover) : all[0] || '';
  const videos = Array.from(new Set([
    ...(Array.isArray(it.videos) ? it.videos : []),
    it.video,
    it.videoUrl,
  ].filter((url): url is string => typeof url === 'string' && Boolean(url.trim()))));

  return {
    ...it,
    coverImage: cover,
    images: all,
    mainImages: cleanMain.length > 0 ? cleanMain : all.length > 0 ? [all[0]] : [],
    skuImages: cleanSkus,
    descImages: cleanDesc,
    video: videos[0] || null,
    videos,
  };
}
