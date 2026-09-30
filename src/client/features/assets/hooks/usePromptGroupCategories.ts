import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { subscribeAssetInvalidation } from '@client/shared/api/assetLibraryCache';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';

export function usePromptGroupCategories(active: boolean) {
  const [categories, setCategories] = useState<AssetProductCategory[]>([]);
  const [albums, setAlbums] = useState<PromptAlbum[]>([]);
  const requestId = useRef(0);

  const applyOrganization = useCallback((data: { categories: AssetProductCategory[]; albums: PromptAlbum[] }) => {
    requestId.current += 1;
    setCategories(data.categories);
    setAlbums(data.albums);
  }, []);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const response = await apiFetch('/api/catalog/assets/library?view=organization');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '品类加载失败');
      if (currentRequest !== requestId.current) return;
      setCategories(data.categories || []);
      setAlbums(data.albums || []);
    } catch (error) {
      console.warn('[assetLibrary] 商品大类加载失败', error);
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh().catch(() => {});
    const unsubscribe = subscribeAssetInvalidation(() => { void refresh().catch(() => {}); });
    return unsubscribe;
  }, [active, refresh]);

  return { categories, albums, refresh, applyOrganization };
}
