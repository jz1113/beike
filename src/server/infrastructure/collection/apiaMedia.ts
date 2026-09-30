import { socialImageUrl, socialVideoUrl } from './socialMediaUrls';

export type ApiaMediaResult = {
  title: string;
  description: string;
  author: string;
  cover: string;
  images: string[];
  video: string | null;
  /** 全量视频/实况流；video 保留首条以兼容旧调用方。 */
  videos: string[];
};

/** 深度提取 APIA 响应中的图片、封面与视频 */
export function extractMediaFromApiaData(data: unknown): ApiaMediaResult {
  if (!data || typeof data !== 'object') {
    return { title: '', description: '', author: '', cover: '', images: [], video: null, videos: [] };
  }

  const payload = data as Record<string, unknown>;
  const root =
    payload.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : payload;

  const rawTitle = String(root.title || payload.title || '');
  const rawDesc = String(root.desc || root.text || payload.desc || payload.text || '');
  const msgText = String(root.msg || payload.msg || root.message || payload.message || '');

  const fullTextCheck = `${rawTitle} ${rawDesc} ${msgText}`;
  if (/请求次数频繁|请勿使用盗版|操作过于频繁|请稍后再试|验证码|安全验证|风控拦截/i.test(fullTextCheck)) {
    throw new Error('小红书解析接口触发上游频控/风控拦截（提示：请求次数频繁，请稍后再试或降低并发）');
  }

  const authorRaw =
    (root.author as { nickname?: string } | string | undefined) ??
    root.user_name ??
    root.nickname ??
    payload.author ??
    '';
  const author =
    typeof authorRaw === 'object' && authorRaw !== null
      ? String((authorRaw as { nickname?: string }).nickname || '')
      : String(authorRaw || '');

  let cleanTitle = rawTitle;
  let cleanDesc = rawDesc;

  if (rawTitle.includes('||')) {
    const parts = rawTitle.split('||').map((p) => p.trim()).filter(Boolean);
    cleanTitle = parts[0] || '社媒精选爆款素材';
    cleanDesc = parts.slice(1).join('\n\n') || cleanDesc;
  } else if (!cleanTitle && cleanDesc) {
    const lines = cleanDesc.split(/[\n\r]+/);
    cleanTitle = lines[0]?.slice(0, 50) || '社媒精选爆款素材';
    if (lines.length > 1) cleanDesc = lines.slice(1).join('\n');
  }

  cleanTitle = cleanTitle.replace(/^[📌📱🔴🔥✨\s]+/u, '').trim() || '社媒精选爆款素材';

  let cover = String(
    root.cover ||
      root.download_image ||
      root.image ||
      root.cover_url ||
      root.video_cover ||
      payload.cover ||
      payload.download_image ||
      '',
  );
  if (typeof root.cover === 'object' && root.cover !== null) {
    const c = root.cover as { url?: string; url_list?: string[] };
    cover = c.url || c.url_list?.[0] || cover;
  }

  const isVideoUrl = (url: string) => /\.(mp4|mov|m4v|webm|avi|flv|m3u8)(?:[?#/]|$)/i.test(url);
  const staticUrls = (value: unknown, depth = 0): string[] => {
    if (depth > 8 || value == null) return [];
    if (typeof value === 'string') {
      const url = value.trim().replace(/^\/\//, 'https://');
      const image = socialImageUrl(url);
      return image ? [image] : [];
    }
    if (Array.isArray(value)) return value.flatMap((entry) => staticUrls(entry, depth + 1));
    if (typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    // Live 的 image/images 是静态图；url 可能是视频，不得优先于静态字段。
    for (const field of ['images', 'image', 'download_image', 'pic', 'origin_url', 'url_list', 'download_url', 'url']) {
      if (item[field] != null) {
        const urls = staticUrls(item[field], depth + 1);
        if (urls.length) return urls;
      }
    }
    return [];
  };
  const rawList: unknown[] = [];
  const sources = root === payload ? [root] : [root, payload];
  for (const source of sources) {
    if (Array.isArray(source)) rawList.push(...source);
    for (const field of ['images', 'pics', 'img_list', 'live_photos', 'livePhotos', 'live', 'image']) {
      if (source[field]) rawList.push(source[field]);
    }
    if (source.photo) rawList.push(typeof source.photo === 'string' ? source.photo.split(/[\n\r,;\s]+/) : source.photo);
  }
  // 使用精确 URL 去重，不能去掉查询参数：部分接口用同一路径的不同参数标识不同图片。
  const cleanImages = [...new Set(rawList.flatMap((entry) => staticUrls(entry)))];
  cover = staticUrls(root.cover || root.download_image || root.cover_url || root.video_cover || payload.cover || payload.download_image)[0] || cleanImages[0] || '';

  const VIDEO_CDN_RE = /kwaicdn|kwai|yximgs|snssdk|bytecdn|xhscdn|douyinvod/i;
  const looksLikeVideoUrl = (u: string) => {
    const candidate = socialVideoUrl(u);
    return candidate && (/video/i.test(new URL(candidate).pathname) || VIDEO_CDN_RE.test(new URL(candidate).hostname));
  };

  const videoUrls = (value: unknown, depth = 0, trusted = false): string[] => {
    if (depth > 8 || value == null) return [];
    if (typeof value === 'string') {
      const url = value.trim().replace(/^\/\//, 'https://');
      const candidate = socialVideoUrl(url);
      return candidate && (trusted || isVideoUrl(candidate) || looksLikeVideoUrl(candidate)) ? [candidate] : [];
    }
    if (Array.isArray(value)) return value.flatMap((entry) => videoUrls(entry, depth + 1, trusted));
    if (typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    return ['videos', 'video', 'video_url', 'down', 'download_video', 'download_url', 'play_url', 'live_photo_url', 'livePhotoUrl', 'url']
      .flatMap((field) => videoUrls(item[field], depth + 1, field !== 'url'));
  };

  // 实况作品同时包含静态封面与多段动态流，不能因存在图片而丢掉视频。
  const rawVideos = sources.flatMap((source) => [
    source.videos, source.video, source.video_url, source.down, source.download_video,
    source.live, source.live_photos, source.livePhotos,
  ].flatMap(entry => videoUrls(entry, 0, true)).concat(rawList.flatMap(entry => videoUrls(entry))));
  const fallbackVideos = videoUrls([root.url, payload.url]);
  const cleanVideos = [...new Set([...rawVideos, ...fallbackVideos])];

  if (cleanImages.length === 0 && cover) {
    const cleanCover = cover.startsWith('//') ? 'https:' + cover : cover;
    if (cleanCover) cleanImages.push(cleanCover);
  }

  const coverOut =
    cover && cover.startsWith('//') ? 'https:' + cover : cover || cleanImages[0] || '';

  return {
    title: cleanTitle,
    description: cleanDesc,
    author,
    cover: coverOut,
    images: cleanImages,
    video: cleanVideos[0] || null,
    videos: cleanVideos,
  };
}

