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

/** Reuse decoded images, including an earlier proxy signature or direct fallback. */
export function findLoadedImagePreview(source: string) {
  if (typeof document === 'undefined' || !document.images) return null;
  const identity = imageIdentity(source, document.baseURI);
  const loaded = Array.from(document.images)
    .filter((image) => image.complete && image.naturalWidth > 0 &&
      imageIdentity(image.currentSrc || image.src, document.baseURI) === identity)
    .sort((a, b) => b.naturalWidth - a.naturalWidth)[0];
  if (!loaded) return null;

  const src = loaded.currentSrc || loaded.src;
  const url = new URL(src, document.baseURI);
  const isThumbnail = url.pathname === '/api/system/proxy-image' &&
    (url.searchParams.has('thumb') || url.searchParams.has('w'));
  return { src, width: loaded.naturalWidth, height: loaded.naturalHeight, isThumbnail };
}
