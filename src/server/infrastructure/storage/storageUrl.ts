type StorageUrlConfig = { endpoint?: string; publicDomain?: string; bucketName?: string; region?: string };

function legalKey(raw: string): string | null {
  try {
    const key = decodeURIComponent(raw);
    return key.startsWith('azhuo/') && !/[\x00-\x1f\\%?#]/.test(key) && !key.split('/').some(part => !part || part === '.' || part === '..') ? key : null;
  } catch { return null; }
}

function parseStorageBase(raw?: string): URL | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed : null;
  } catch {
    return null;
  }
}

function keyUnderBase(parsed: URL, base: URL, prefix = ''): string | null {
  if (parsed.origin !== base.origin) return null;
  const basePath = decodeURIComponent(base.pathname).replace(/\/+$/, '');
  const expectedPrefix = `${basePath}/${prefix}`;
  const pathname = parsed.pathname;
  if (!pathname.startsWith(expectedPrefix)) return null;
  const key = pathname.slice(expectedPrefix.length);
  return legalKey(key);
}

/** Only configured storage origins may address private objects; signed query strings do not change the key. */
export function extractKnownStorageKey(url: string, config?: StorageUrlConfig | null): string | null {
  if (!url || typeof url !== 'string' || /[\x00-\x1f\\]/.test(url)) return null;
  if (url.startsWith('/storage/')) {
    const key = url.slice('/storage/'.length).split(/[?#]/)[0].trim();
    return legalKey(key);
  }
  if (url.startsWith('/azhuo/') || url.startsWith('azhuo/')) return legalKey(url.replace(/^\/+/, '').split(/[?#]/)[0]);
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    const publicBase = parseStorageBase(config?.publicDomain);
    const publicKey = publicBase && keyUnderBase(parsed, publicBase);
    if (publicKey) return publicKey;
    const endpoint = parseStorageBase(config?.endpoint);
    const bucket = config?.bucketName?.trim();
    if (endpoint && bucket) {
      const pathKey = keyUnderBase(parsed, endpoint, `${bucket}/`);
      if (pathKey) return pathKey;
      if (endpoint.hostname.startsWith(`${bucket}.`)) {
        const endpointKey = keyUnderBase(parsed, endpoint);
        if (endpointKey) return endpointKey;
      }
      const virtualBase = new URL(endpoint);
      virtualBase.hostname = `${bucket}.${endpoint.hostname}`;
      const virtualKey = keyUnderBase(parsed, virtualBase);
      if (virtualKey) return virtualKey;
    }
    if (!endpoint && bucket) {
      const region = config?.region || 'us-east-1';
      for (const host of [`s3.amazonaws.com`, `s3.${region}.amazonaws.com`, `s3-${region}.amazonaws.com`]) {
        const key = keyUnderBase(parsed, new URL(`https://${bucket}.${host}`)) || keyUnderBase(parsed, new URL(`https://${host}`), `${bucket}/`);
        if (key) return key;
      }
    }
  } catch {
    // Malformed URLs and escaped paths cannot address internal storage.
  }
  return null;
}
