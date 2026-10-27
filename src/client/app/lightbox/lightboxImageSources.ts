import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { findLoadedImagePreview } from '@client/shared/media/loadedImagePreview';

/** Reuse the actual decoded feed image, including its direct/proxy fallback URL. */
export function resolveLightboxImageSources(resultUrl: string) {
  const fullSource = proxyMediaUrl(resultUrl, { width: 1920 });
  const fallbackSources = [...new Set([fullSource, resultUrl])];
  const loaded = findLoadedImagePreview(proxyMediaUrl(resultUrl));
  if (!loaded) return { sources: fallbackSources, preview: null };

  const { src, isThumbnail, width, height } = loaded;
  return {
    // Direct originals are already in the browser cache; avoid fetching them again via the server.
    sources: isThumbnail ? fallbackSources : [src, ...fallbackSources.filter((source) => source !== src)],
    preview: { src, width, height },
  };
}
