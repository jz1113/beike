const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif|bmp|dpg|avif|heic|tiff?)(?:[!~_./]|$)/i;
const OTHER_MEDIA_EXTENSION = /\.(?:html?|mp4|mov|webm|m4v|avi|flv|m3u8|mpd|mp3|m4a|wav|ogg|pdf)(?:[!~]|$)/i;
const IMAGE_HOSTS = ['360buyimg.com', 'alicdn.com', 'taobaocdn.com', 'tbcdn.cn', 'pddpic.com', 'yangkeduo.com', 'xhscdn.com', 'xiaohongshu.com', 'douyinpic.com', 'byteimg.com', 'snssdk.com', 'pstatp.com', 'kwaicdn.com', 'kwimgs.com', 'yximgs.com', 'sinaimg.cn', 'hdslb.com', 'r2.dev', 'qiniucdn.com', 'upaiyun.com'];
const SOCIAL_IMAGE_HOSTS = ['xhscdn.com', 'xiaohongshu.com', 'douyinpic.com', 'byteimg.com', 'snssdk.com', 'pstatp.com', 'kwaicdn.com', 'kwimgs.com', 'yximgs.com', 'sinaimg.cn', 'hdslb.com'];
const TRACKER_PATH = /(?:i\.php|(?:space|spacer|1x1|blank)\.(?:gif|png)|taesite|tongji|picon\/|imagetools\/|service_ico|devfe\/|s(?:48x48|54x54|30x30|20x20|60x60)_|error-new|jisushenhe|spiderfont)/i;
const hostMatches = (host: string, domains: string[]) => domains.some(domain => host === domain || host.endsWith(`.${domain}`));

/** Keep the original path and query bytes: some CDN signatures depend on them. */
export function normalizeRemoteMediaUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const source = value.trim().replace(/^\/\//, 'https://');
  try {
    const parsed = new URL(source);
    return /^https?:$/.test(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password ? source : '';
  } catch { return ''; }
}

/** Validate known source types without guessing or rewriting an image's file format. */
export function normalizeImageSource(value: unknown): string {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(source) || /^blob:(?:https?:\/\/|null\/)/i.test(source)) return source;
  if (source.startsWith('/') && !source.startsWith('//')) {
    return OTHER_MEDIA_EXTENSION.test(source.split(/[?#]/)[0]) ? '' : source;
  }
  const remote = normalizeRemoteMediaUrl(source);
  if (!remote) return '';
  const { hostname, pathname } = new URL(remote);
  if (OTHER_MEDIA_EXTENSION.test(pathname) || TRACKER_PATH.test(pathname) || hostMatches(hostname, ['o0b.cn'])) return '';
  if (hostMatches(hostname, ['item.jd.com', 'item.taobao.com', 'detail.tmall.com'])) return '';
  return remote;
}

export function isKnownSocialImageHost(value: string): boolean {
  const source = normalizeRemoteMediaUrl(value);
  return Boolean(source && hostMatches(new URL(source).hostname, SOCIAL_IMAGE_HOSTS));
}

/** Check product image candidates using their actual host/path, never their query text. */
export function isProductImageUrl(value?: string | null): boolean {
  const source = normalizeImageSource(value);
  if (!source) return false;
  if (/^(?:data:image\/|blob:|\/(?!\/))/i.test(source)) return true;
  const { hostname, pathname, search } = new URL(source);
  return IMAGE_EXTENSION.test(pathname)
    || hostMatches(hostname, IMAGE_HOSTS)
    || /(?:^|\.)(?:cos\.|oss-)/i.test(hostname)
    || /(?:imageView2|imageMogr2|image_process|imageView|format\/)/i.test(search);
}

/** Apply documented e-commerce CDN transforms only; all other sources retain their format. */
export function normalizeImageUrlToStandardJpg(value?: string | null): string {
  if (typeof value === 'string' && value.trim().startsWith('jfs/')) {
    return `https://img10.360buyimg.com/pcpubliccms/s1440x1440_${value.trim()}`;
  }
  let source = normalizeImageSource(value);
  if (!source || !/^https?:\/\//i.test(source)) return source;
  const { hostname, search, hash } = new URL(source);
  // Even unknown query fields can be signed; preserve all of them without re-serialization.
  if (search || hash) return source;
  if (hostname === 'ci.xiaohongshu.com') {
    return source.replace(/^https?:\/\/ci\.xiaohongshu\.com/i, 'https://sns-img-hw.xhscdn.com');
  }
  if (hostMatches(hostname, ['360buyimg.com'])) {
    source = source.replace(/^https?:\/\/[^/]+\/(?:mobilecms\/|popWaterMark\/|popWareDetail\/|n\d+\/|sku\/|shaidan\/|babel\/|imgzone\/|pcpubliccms\/)?(?:s\d+x\d+_)?jfs\//i, 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/');
    source = source.replace(/\/s\d+x\d+_(?!jfs)/i, '/').replace(/\/s\d+x\d+\//i, '/');
    source = source.replace(/![a-zA-Z0-9_.-]*$/i, '').replace(/\.dpg(?:\.webp)?$/i, '');
    return source.replace(/\.(jpe?g|png)\.webp$/i, '.$1').replace(/\.webp$/i, '.jpg');
  }
  if (hostMatches(hostname, ['alicdn.com', 'taobaocdn.com', 'tbcdn.cn'])) {
    source = source.replace(/_\.webp$/i, '').replace(/_(?:q\d+\.jpg|\d+x\d+|sum\.jpg|[bms]\.jpg).*$/i, '');
    source = source.replace(/\.\d+x\d+\.jpg.*$/i, '.jpg').replace(/\.(?:search|summ)\.jpg.*$/i, '.jpg');
    return source.replace(/\.(jpe?g|png)\.webp$/i, '.$1').replace(/\.webp$/i, '.jpg');
  }
  if (hostMatches(hostname, ['pddpic.com', 'yangkeduo.com'])) return source.replace(/\.webp$/i, '.jpeg');
  return source;
}
