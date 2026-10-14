export type CustomAssetCategory = 'character' | 'product' | 'voice' | 'file';

export interface CustomAssetItem {
  id: string;
  category: CustomAssetCategory;
  name: string;
  description?: string;
  tags?: string[];
  coverUrl?: string;
  mediaUrl?: string;
  fileSize?: string;
  duration?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'beike.custom_assets';

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
    return safeParse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveCustomAssets(items: CustomAssetItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('beike:custom_assets_updated'));
  } catch {
    // 忽略本地存储写入失败
  }
}

export function addCustomAsset(
  input: Omit<CustomAssetItem, 'id' | 'createdAt' | 'updatedAt'>
): CustomAssetItem {
  const now = Date.now();
  const newItem: CustomAssetItem = {
    ...input,
    id: `asset-${now}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  const list = loadCustomAssets();
  list.unshift(newItem);
  saveCustomAssets(list);
  return newItem;
}

export function deleteCustomAsset(id: string): void {
  const list = loadCustomAssets().filter((item) => item.id !== id);
  saveCustomAssets(list);
}
