const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif|bmp|dpg|avif|heic|tiff?)(?:[!~_./]|$)/i;
const OTHER_MEDIA_EXTENSION = /\.(?:html?|mp4|mov|webm|m4v|avi|flv|m3u8|mpd|mp3|m4a|wav|ogg|pdf)(?:[!~]|$)/i;
const IMAGE_HOSTS = ['360buyimg.com', 'alicdn.com', 'taobaocdn.com', 'tbcdn.cn', 'pddpic.com', 'yangkeduo.com', 'xhscdn.com', 'xiaohongshu.com', 'douyinpic.com', 'byteimg.com', 'snssdk.com', 'pstatp.com', 'kwaicdn.com', 'kwimgs.com', 'yximgs.com', 'sinaimg.cn', 'hdslb.com', 'r2.dev', 'qiniucdn.com', 'upaiyun.com'];
const SOCIAL_IMAGE_HOSTS = ['xhscdn.com', 'xiaohongshu.com', 'douyinpic.com', 'byteimg.com', 'snssdk.com', 'pstatp.com', 'kwaicdn.com', 'kwimgs.com', 'yximgs.com', 'sinaimg.cn', 'hdslb.com'];
const TRACKER_PATH = /(?:i\.php|(?:space|spacer|1x1|blank)\.(?:gif|png)|taesite|tongji|picon\/|imagetools\/|service_ico|devfe\/|error-new|jisushenhe|spiderfont)/i;
const SMALL_IMAGE_PATH = /s(?:48x48|54x54|30x30|20x20|60x60)_/i;
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
  return imageSource(value, false);
}

function imageSource(value: unknown, allowThumbnail: boolean): string {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(source) || /^blob:(?:https?:\/\/|null\/)/i.test(source)) return source;
  if (source.startsWith('/') && !source.startsWith('//')) {
    return OTHER_MEDIA_EXTENSION.test(source.split(/[?#]/)[0]) ? '' : source;
  }
  const remote = normalizeRemoteMediaUrl(source);
  if (!remote) return '';
  const { hostname, pathname } = new URL(remote);
  if (OTHER_MEDIA_EXTENSION.test(pathname) || TRACKER_PATH.test(pathname) || (!allowThumbnail && SMALL_IMAGE_PATH.test(pathname)) || hostMatches(hostname, ['o0b.cn'])) return '';
  if (hostMatches(hostname, ['item.jd.com', 'item.taobao.com', 'detail.tmall.com'])) return '';
  return remote;
}

export function isKnownSocialImageHost(value: string): boolean {
  const source = normalizeRemoteMediaUrl(value);
  return Boolean(source && hostMatches(new URL(source).hostname, SOCIAL_IMAGE_HOSTS));
}

/** Check product image candidates using their actual host/path, never their query text. */
export function isProductImageUrl(value?: string | null): boolean {
  return productImageUrl(value, false);
}

/** Candidate validation precedes size restoration; callers must still exclude unrestorable thumbnails. */
export function isProductImageCandidateUrl(value: string): boolean {
  return productImageUrl(value, true);
}

function productImageUrl(value: string | null | undefined, allowThumbnail: boolean): boolean {
  const source = imageSource(value, allowThumbnail);
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
  const { hostname, pathname } = new URL(source);
  // Even an empty trailing query can be signed; preserve its original bytes.
  if (source.includes('?') || source.includes('#')) return source;
  if (hostname === 'ci.xiaohongshu.com') {
    return source.replace(/^https?:\/\/ci\.xiaohongshu\.com/i, 'https://sns-img-hw.xhscdn.com');
  }
  if (hostMatches(hostname, ['360buyimg.com'])) {
    const sizes = [...pathname.matchAll(/(?:^|[/_!.-])s?(\d{1,5})x(\d{1,5})(?:[a-z]{1,3})?(?:q\d{1,3})?(?:[_.!/-]|$)/ig)];
    const size = sizes.at(-1);
    if (/(?:^|[/_])jfs\//i.test(pathname) && size && Math.max(+size[1], +size[2]) > 1440) return source;
    source = source.replace(/^https?:\/\/[^/]+\/(?:mobilecms\/|popWaterMark\/|popWareDetail\/|n\d+\/|sku\/|shaidan\/|babel\/|imgzone\/|pcpubliccms\/)?(?:s\d+x\d+_)?jfs\//i, 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/');
    source = source.replace(/\/s\d+x\d+_(?!jfs)/i, '/').replace(/\/s\d+x\d+\//i, '/');
    source = source.replace(/![a-zA-Z0-9_.-]*$/i, '').replace(/(\.(?:jpe?g|png|gif|webp))\.dpg(?:\.webp)?$/i, '$1');
    return source.replace(/\.(jpe?g|png)\.webp$/i, '.$1');
  }
  if (hostMatches(hostname, ['alicdn.com', 'taobaocdn.com', 'tbcdn.cn'])) {
    let original = pathname;
    for (;;) {
      const next = original.replace(/_(?:\d{1,5}x\d{1,5}(?:[a-z]{1,3})?(?:q\d{1,3})?(?:\.(?:jpe?g|png|webp))?|q\d+\.jpg|sum\.jpg|[bms]\.jpg|\.webp)$/i, '');
      if (next === original) break;
      original = next;
    }
    original = original.replace(/\.(?:\d+x\d+|search|summ)\.jpg$/i, '').replace(/\.(jpe?g|png)\.webp$/i, '.$1');
    if (original !== pathname && IMAGE_EXTENSION.test(original)) return `${new URL(source).origin}${original}`;
  }
  return source;
}
