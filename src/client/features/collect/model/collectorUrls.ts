import { normalizeImageSource, normalizeRemoteMediaUrl } from '@shared/domain/media/drawing';
import { normalizeCollectedProductImages } from '@shared/domain/collection/productImages';
import { normalizeCollectedProductImage } from '@shared/domain/media/productImageUrls';

/**
 * 修复小红书图片域名
 */
export function fixXhsUrl(u: string): string {
  if (!u) return '';
  const remote = normalizeRemoteMediaUrl(u);
  if (remote && new URL(remote).hostname === 'ci.xiaohongshu.com' && !new URL(remote).search) {
    return u.replace(/https?:\/\/ci\.xiaohongshu\.com/i, 'https://sns-img-hw.xhscdn.com');
  }
  return u;
}

/**
 * 过滤合法图片链接（区分社媒与电商）
 */
export function keepCollectedUrl(u: string, isSocial: boolean): boolean {
  if (!u || typeof u !== 'string') return false;
  if (isSocial) {
    return Boolean(normalizeImageSource(u));
  }
  return Boolean(normalizeCollectedProductImage(u));
}

/**
 * 统一数据清洗过滤函数，彻底剔除统计追踪图、UI服务图标、角标等垃圾碎片
 */
export function sanitizeCollectedItem(it: any): any {
  if (!it || typeof it !== 'object') return it;
  const isSocial =
    it.type === 'social' || it.platform === 'social' ||
    ['xiaohongshu.com', 'xhslink.com', 'douyin.com', 'kuaishou.com', 'weibo.com', 'bilibili.com'].some(domain => {
      const source = normalizeRemoteMediaUrl(it.sourceUrl || it.url);
      const host = source ? new URL(source).hostname : '';
      return host === domain || host.endsWith(`.${domain}`);
    });

  const keepUrl = (u: string) => keepCollectedUrl(u, isSocial);
  // Signed social CDN URLs must retain their path, format and query parameters.
  const cleanUrl = (u: unknown) => typeof u === 'string'
    ? isSocial
      ? fixXhsUrl(normalizeImageSource(u))
      : normalizeCollectedProductImage(u)
    : '';
  const mapImgs = (arr: any) =>
    [...new Set<string>((Array.isArray(arr) ? arr : []).map(cleanUrl).filter(keepUrl))];

  const productGroups = isSocial ? undefined : normalizeCollectedProductImages({ product: it });
  const cleanMain = productGroups?.mainImgs ?? mapImgs(it.mainImages?.length ? it.mainImages : it.images);
  const cleanSkus = productGroups?.skuImgs ?? mapImgs(it.skuImages);
  const cleanDesc = productGroups?.descImgs ?? mapImgs(it.descImages?.length ? it.descImages : it.detailImages);
  const all = productGroups?.allImgs ?? [...new Set([...cleanMain, ...cleanSkus, ...cleanDesc, ...mapImgs(it.images)])];
  const rawCover = productGroups?.coverImg || cleanUrl(it.coverImage || it.picUrl) || cleanMain[0] || all[0] || '';
  const cover = keepUrl(rawCover) ? rawCover : all[0] || '';
  if (all.length === 0 && cover) all.push(cover);
  const videos = [...new Set([...(Array.isArray(it.videos) ? it.videos : []), it.video, it.videoUrl]
    .map(normalizeRemoteMediaUrl).filter(Boolean))];
  const video = videos[0] || null;

  return {
    ...it,
    coverImage: cover,
    images: all,
    mainImages: isSocial && cleanMain.length === 0 && all.length > 0 ? [all[0]] : cleanMain,
    skuImages: cleanSkus,
    descImages: cleanDesc,
    detailImages: cleanDesc,
    video,
    videoUrl: video,
    videos,
    livePhotos: [...new Set((Array.isArray(it.livePhotos) ? it.livePhotos : []).map(normalizeRemoteMediaUrl).filter(Boolean))],
  };
}
