import { proxyMediaUrl } from '@client/shared/api/apiClient';

function imageIdentity(source: string, base: string): string {
  try {
    const url = new URL(source, base);
    if (url.pathname === '/api/system/proxy-image') {
      const original = url.searchParams.get('url');
      if (original) return new URL(original, base).href;
    }
    return url.href;
  } catch {
    return source;
  }
}

/** Reuse the actual decoded feed image, including its direct/proxy fallback URL. */
export function resolveLightboxImageSources(resultUrl: string) {
  const fullSource = proxyMediaUrl(resultUrl, { width: 1920 });
  const fallbackSources = [...new Set([fullSource, resultUrl])];
  if (typeof document === 'undefined') return { sources: fallbackSources, preview: null };

  const identity = imageIdentity(proxyMediaUrl(resultUrl), document.baseURI);
  const loaded = Array.from(document.images)
    .filter((image) => image.complete && image.naturalWidth > 0 &&
      imageIdentity(image.currentSrc || image.src, document.baseURI) === identity)
    .sort((a, b) => b.naturalWidth - a.naturalWidth)[0];
  if (!loaded) return { sources: fallbackSources, preview: null };

  const src = loaded.currentSrc || loaded.src;
  const url = new URL(src, document.baseURI);
  const isThumbnail = url.pathname === '/api/system/proxy-image' &&
    (url.searchParams.has('thumb') || url.searchParams.has('w'));
  return {
    // Direct originals are already in the browser cache; avoid fetching them again via the server.
    sources: isThumbnail ? fallbackSources : [src, ...fallbackSources.filter((source) => source !== src)],
    preview: { src, width: loaded.naturalWidth, height: loaded.naturalHeight },
  };
}
