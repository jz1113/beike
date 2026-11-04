import type { CustomAssetItem } from './customAssetStore';
import type { AssetCanvasProject } from './canvasAssets';

/** Browser-owned library records and every saved canvas version still own their media. */
export function collectProtectedAssetMedia(projects: readonly AssetCanvasProject[], assets: readonly CustomAssetItem[]): string[] {
  const urls = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      if (!/^(https?:\/\/|\/(?!\/))/i.test(value)) return;
      if (typeof window !== 'undefined' && /^https?:\/\//i.test(value)) {
        try {
          const url = new URL(value);
          if (url.origin === window.location.origin) value = url.pathname + url.search;
        } catch { return; }
      }
      urls.add(value as string);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  projects.forEach(visit);
  assets.forEach(asset => { visit(asset.mediaUrl); visit(asset.coverUrl); });
  return [...urls];
}
