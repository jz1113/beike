import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { invalidateGlobalAssetCache } from '../assetLibraryCache';
import type { AssetProductCategory, PromptAlbum } from '@beike/domain/assetOrganization';

export function useAssetOrganization(showToast: (message: string) => void) {
  const [categories, setCategories] = useState<AssetProductCategory[]>([]);
  const [albums, setAlbums] = useState<PromptAlbum[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [includeUniversal, setIncludeUniversal] = useState(true);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/catalog/assets/library?view=organization');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '品类加载失败');
      setCategories(data.categories); setAlbums(data.albums);
    } catch (error) { showToast(error instanceof Error ? error.message : '品类加载失败'); }
  }, [showToast]);
  useEffect(() => { void refresh(); }, [refresh]);
  const mutate = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/catalog/assets/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '保存失败');
      invalidateGlobalAssetCache();
      setCategories(data.categories); setAlbums(data.albums);
      showToast('已保存'); return true;
    } catch (error) { showToast(error instanceof Error ? error.message : '保存失败'); return false;
    } finally { setBusy(false); }
  };
  return { categories, albums, selectedCategory, setSelectedCategory, includeUniversal, setIncludeUniversal, refresh, mutate, busy };
}
export type AssetOrganizationApi = ReturnType<typeof useAssetOrganization>;
