import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { findLoadedImagePreview } from '@client/shared/media/loadedImagePreview';

export const GROUP_CARD_IMAGE_WIDTH = 320;

export function groupCardImageUrl(url: string): string {
  return proxyMediaUrl(url, { thumb: true, width: GROUP_CARD_IMAGE_WIDTH });
}

export function groupPreviewImageSources(url: string, view: 'group' | 'shot') {
  const direct = url.startsWith('//') ? `https:${url}` : url;
  const width = view === 'group' ? 640 : 1600;
  const full = proxyMediaUrl(direct, { thumb: true, width });
  const loaded = findLoadedImagePreview(proxyMediaUrl(direct));
  const reusable = loaded && (!loaded.isThumbnail || loaded.width >= width);
  return {
    sources: [...new Set([...(reusable ? [loaded.src] : []), full, direct])],
    preview: loaded?.src || groupCardImageUrl(direct),
    previewLoaded: Boolean(loaded),
  };
}
