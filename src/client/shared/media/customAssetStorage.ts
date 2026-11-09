export type CustomAssetCategory = 'character' | 'product' | 'voice' | 'file';

export interface CustomAssetItem {
  id: string;
  category: CustomAssetCategory;
  name: string;
  description?: string;
  mediaKind?: 'image' | 'video' | 'audio';
  folder?: string;
  collection?: boolean;
  scriptId?: string;
  placementKey?: string;
  placementFolders?: string[];
  placementSources?: string[];
  tags?: string[];
  coverUrl?: string;
  mediaUrl?: string;
  fileSize?: string;
  duration?: string;
  createdAt: number;
  updatedAt: number;
}

export const CUSTOM_ASSET_STORAGE_KEY = 'beike.custom_assets';

function safeParse(json: string | null): CustomAssetItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as CustomAssetItem[]) : [];
  } catch {
    return [];
  }
}

export function loadCustomAssets(): CustomAssetItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return safeParse(window.localStorage.getItem(CUSTOM_ASSET_STORAGE_KEY));
  } catch {
    return [];
  }
}
