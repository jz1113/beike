import { isProductImageCandidateUrl, normalizeImageSource, normalizeRemoteMediaUrl } from './imageUrls';

export interface CollectedProductImage {
  url: string;
  key: string;
  quality: number;
  small: boolean;
}

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const isAli = (host: string) => ['alicdn.com', 'taobaocdn.com', 'tbcdn.cn'].some(domain => hostMatches(host, domain));
const JD_LEVELS: Record<string, number> = { n0: 800, n1: 350, n2: 40, n3: 130, n4: 50, n5: 50, n6: 50, n7: 350, n9: 40, n11: 350, n12: 800 };

function jdResource(path: string): string {
  const resource = path.match(/(?:^|[/_])(jfs\/.+)$/i)?.[1];
  return resource ? resource.replace(/![a-z\d_.-]+$/i, '')
    .replace(/\.(jpe?g|png)\.webp$/i, '.$1')
    .replace(/(\.(?:jpe?g|png|webp))\.dpg(?:\.webp)?$/i, '$1') : '';
}

function aliOriginal(path: string): string {
  let original = path;
  for (;;) {
    const next = original.replace(/_(?:\d{1,5}x\d{1,5}(?:[a-z]{1,3})?(?:q\d{1,3})?(?:\.(?:jpe?g|png|webp))?|q\d+\.jpg|sum\.jpg|[bms]\.jpg|\.webp)$/i, '');
    if (next === original) break;
    original = next;
  }
  original = original.replace(/\.(?:\d+x\d+|search|summ)\.jpg$/i, '').replace(/\.(jpe?g|png)\.webp$/i, '.$1');
  return /\.(?:jpe?g|png|webp|gif|bmp|dpg|avif|heic|tiff?)(?:[!~_./]|$)/i.test(original) ? original : path;
}

function dimensions(parsed: URL): [number, number] {
  const level = hostMatches(parsed.hostname, '360buyimg.com') ? parsed.pathname.match(/^\/(n\d+)\//i)?.[1].toLowerCase() : '';
  let width = level ? JD_LEVELS[level] || 0 : 0;
  let height = width;
  for (const match of parsed.pathname.matchAll(/(?:^|[/_!.-])s?(\d{1,5})x(\d{1,5})(?:[a-z]{1,3})?(?:q\d{1,3})?(?:[_.!/-]|$)/ig)) {
    width = +match[1]; height = +match[2];
  }
  for (const [w, h] of [['w', 'h'], ['width', 'height']]) {
    if (Number(parsed.searchParams.get(w)) > 0) width = Number(parsed.searchParams.get(w));
    if (Number(parsed.searchParams.get(h)) > 0) height = Number(parsed.searchParams.get(h));
  }
  for (const key of ['imageView2', 'imageMogr2', 'x-oss-process', 'x-tos-process', 'image_process']) {
    let text = parsed.searchParams.get(key) || '';
    for (const part of parsed.search.slice(1).split('&')) if (part.startsWith(`${key}/`)) text = part;
    for (const match of text.matchAll(/(?:^|[/,])([wh])[_/](\d{1,5})/ig)) {
      if (match[1].toLowerCase() === 'w') width = +match[2];
      else height = +match[2];
    }
  }
  return [width, height];
}

/** Matches the Go product parser: URL bytes and identity are deliberately separate. */
export function parseCollectedProductImage(value: unknown): CollectedProductImage | null {
  if (typeof value !== 'string') return null;
  let source = value.trim();
  if (/^(?:data:image\/|blob:|\/(?!\/))/i.test(source)) {
    return normalizeImageSource(source) ? { url: source, key: source, quality: 10000, small: false } : null;
  }
  if (source.startsWith('jfs/')) source = `https://img10.360buyimg.com/pcpubliccms/s1440x1440_${source}`;
  source = normalizeRemoteMediaUrl(source);
  if (!source || !isProductImageCandidateUrl(source)) return null;
  const parsed = new URL(source);
  const [width, height] = dimensions(parsed);
  const result = { url: source, key: source, quality: width || height ? Math.max(width, height) : 10000, small: (width > 0 && width < 200) || (height > 0 && height < 200) };
  // Even an empty trailing query can be part of a signature.
  const protectedUrl = source.includes('?') || source.includes('#');
  if (hostMatches(parsed.hostname, '360buyimg.com')) {
    const resource = jdResource(parsed.pathname);
    if (resource) {
      result.key = `jd:${resource}`;
      if (!protectedUrl && Math.max(width, height) <= 1440) Object.assign(result, { url: `https://img10.360buyimg.com/pcpubliccms/s1440x1440_${resource}`, quality: 1440, small: false });
    }
  } else if (isAli(parsed.hostname)) {
    const original = aliOriginal(parsed.pathname);
    result.key = `ali:${parsed.host.toLowerCase()}${original}`;
    if (!protectedUrl && original !== parsed.pathname) Object.assign(result, { url: `${parsed.protocol}//${parsed.host}${original}`, quality: 10000, small: false });
  }
  return result;
}

/** Product collection only: restore known CDN sizes before filtering thumbnails. */
export function normalizeCollectedProductImage(value: unknown): string {
  const image = parseCollectedProductImage(value);
  return image && !image.small ? image.url : '';
}

/** Identity never becomes a downloadable URL. Unknown hosts/queries remain distinct. */
export function collectedProductImageIdentity(source: string): string {
  return parseCollectedProductImage(source)?.key || source;
}

export function collectedProductImageQuality(source: string): number {
  const image = parseCollectedProductImage(source);
  return image ? image.small ? -1 : image.quality : -1;
}
