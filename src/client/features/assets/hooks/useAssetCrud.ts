import { useRef, useState } from 'react';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import { apiFetch as rawApiFetch } from '@client/shared/api/apiClient';
import { pickAssetEditFields } from '@shared/domain/assets/assetEdit';

// Keep the raw Response contract while rejecting HTTP and business errors here.
async function apiFetch(...args: Parameters<typeof rawApiFetch>): Promise<Response> {
  const res = await rawApiFetch(...args);
  const body = await res.clone().json().catch(() => null);
  if (!res.ok || body?.success === false) throw new Error(body?.error || `请求失败 (${res.status})`);
  return res;
}
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { resolveAssetApiType } from '../model/assetPromptConstants';
import { buildBackupData, parseBackupDataToBulkItems } from '../model/assetBackup';

function errorText(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface UseAssetCrudOptions {
  activeSubTab: 'full_prompt' | 'persona' | 'outfit' | 'scene' | 'action';
  items: AssetLibrarySlim[];
  setItems: React.Dispatch<React.SetStateAction<AssetLibrarySlim[]>>;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  setIsBatchMode: (v: boolean) => void;
  detailItem: AssetLibrarySlim | null;
  setDetailItem: React.Dispatch<React.SetStateAction<AssetLibrarySlim | null>>;
  showToast: (msg: string) => void;
  fetchAssets: (forceReload?: boolean) => Promise<void>;
}

/**
 * 资产增删改查、收藏、去重、备份与电商图文联动 Hook
 */
export function useAssetCrud({
  activeSubTab,
  setItems,
  selectedIds,
  setSelectedIds,
  setIsBatchMode,
  detailItem,
  setDetailItem,
  showToast,
  fetchAssets,
}: UseAssetCrudOptions) {
  const [editingItem, setEditingItem] = useState<AssetLibrarySlim | null>(null);
  const [tagEditItem, setTagEditItem] = useState<AssetLibrarySlim | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletingRef = useRef(false);
  const activeTabRef = useRef(activeSubTab);
  activeTabRef.current = activeSubTab;



  // 切换收藏
  const toggleFavorite = async (item: AssetLibrarySlim, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const updatedFav = !item.isFavorite;
      await apiFetch('/api/catalog/assets/library', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: resolveAssetApiType(activeSubTab),
          id: item.id,
          data: { isFavorite: updatedFav },
        }),
      });
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, isFavorite: updatedFav } : it))
      );
      if (detailItem?.id === item.id) {
        setDetailItem((prev) => (prev ? { ...prev, isFavorite: updatedFav } : null));
      }
      invalidateGlobalAssetCache();
      showToast(updatedFav ? '⭐ 已加入收藏' : '已取消收藏');
    } catch (err) {
      showToast(`收藏失败：${err instanceof Error ? err.message : '请重试'}`);
    }
  };

  // 单项删除
  const deleteAsset = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('确定要删除该原子资产吗？')) return;
    try {
      await apiFetch(`/api/catalog/assets/library?type=${resolveAssetApiType(activeSubTab)}&id=${id}`, {
        method: 'DELETE',
      });
      invalidateGlobalAssetCache();
      setItems((prev) => prev.filter((it) => it.id !== id));
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      if (detailItem?.id === id) setDetailItem(null);
      showToast('🗑️ 已删除该资产');
    } catch (err) {
      showToast(`删除失败：${err instanceof Error ? err.message : '请重试'}`);
    }
  };

  // 批量删除选中的资产
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0 || deletingRef.current) return;
    if (!window.confirm(`确认要彻底批量删除选中的 ${selectedIds.length} 项资产吗？`)) return;
    deletingRef.current = true;
    setIsDeleting(true);
    try {
      const idsParam = selectedIds.join(',');
      const response = await apiFetch(`/api/catalog/assets/library?type=${resolveAssetApiType(activeSubTab)}&ids=${idsParam}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || '删除失败');
      invalidateGlobalAssetCache();
      if (activeTabRef.current !== activeSubTab) return;
      setItems((prev) => prev.filter((it) => !selectedIds.includes(it.id)));
      showToast(`🗑️ 成功批量删除 ${result.count ?? 0} 项资产`);
      setSelectedIds(prev => prev.filter(id => !selectedIds.includes(id)));
      setIsBatchMode(false);
      await fetchAssets(true);
    } catch (err) {
      alert('批量删除失败: ' + errorText(err));
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  };

  // 导出 JSON 备份
  const handleExportJsonBackup = async () => {
    try {
      showToast('⏳ 正在打包导出资产库数据...');
      const res = await apiFetch('/api/catalog/assets/library?type=all&export=1');
      if (!res || !res.ok) throw new Error('读取数据失败');
      const data = await res.json();
      if (!data.success || !data.complete) throw new Error(data.error || '备份数据不完整');

      const backupData = buildBackupData(data);
      const blob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `beike_prompt_assets_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('📦 资产库数据备份已下载（不含媒体文件）！');
    } catch (err) {
      alert('导出失败: ' + errorText(err));
    }
  };

  // 导入恢复资产备份 (JSON)
  const handleImportJsonBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const { items: bulkItems, productCategories, albums, promptAssetRegistries, fullPromptImageReplacements } = parseBackupDataToBulkItems(text);

        showToast('⏳ 正在恢复并合并资产库...');

        const res = await apiFetch('/api/catalog/assets/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bulk-import', items: bulkItems, productCategories, albums,
            promptAssetRegistries, fullPromptImageReplacements }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || '批量导入失败');
        }

        const importedCount = data.count ?? bulkItems.length;
        const warnings: string[] = Array.isArray(data.warnings)
          ? data.warnings.filter((warning: unknown): warning is string => typeof warning === 'string' && !!warning.trim())
          : [];
        showToast(`🎉 成功导入 ${importedCount} 条原子资产！`);
        if (warnings.length) {
          window.alert(`导入已完成，但有 ${warnings.length} 项需要核对：\n${warnings.map((warning) => `• ${warning}`).join('\n')}`);
        }
        void fetchAssets(true);
      } catch (err) {
        alert('导入失败: ' + errorText(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 保存编辑后的资产
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setIsUpdating(true);
    try {
      const data = pickAssetEditFields(resolveAssetApiType(activeSubTab), editingItem);
      if (activeSubTab === 'full_prompt' && !editingItem._productCategoryDirty) {
        delete data.productCategoryIds;
        delete data.isUniversal;
      }
      const response = await apiFetch('/api/catalog/assets/library', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: resolveAssetApiType(activeSubTab),
          id: editingItem.id,
          data,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || '资产保存失败');
      const savedItem = { ...editingItem, ...result.item };
      invalidateGlobalAssetCache();
      if (activeSubTab === 'full_prompt') {
        // 商品大类由服务端按图集级联更新，重新读取整组以同步卡片与筛选数量。
        await fetchAssets();
      } else {
        setItems((prev) => prev.map((it) => (it.id === editingItem.id ? savedItem : it)));
      }
      if (detailItem?.id === editingItem.id) setDetailItem(savedItem);
      setEditingItem(null);
      showToast('✅ 资产已更新保存');
    } catch (err) {
      alert('更新失败: ' + err);
    } finally {
      setIsUpdating(false);
    }
  };

  // 快捷保存标签与景别分类修改
  const handleSaveTagEdit = async (updatedFields: {
    shotType?: string;
    suitableAnatomy?: string;
    tags?: string;
    category?: string;
  }) => {
    if (!tagEditItem) return;
    setIsUpdating(true);
    try {
      const mergedData = {
        ...tagEditItem,
        ...updatedFields,
      };
      await apiFetch('/api/catalog/assets/library', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: resolveAssetApiType(activeSubTab),
          id: tagEditItem.id,
          data: pickAssetEditFields(resolveAssetApiType(activeSubTab), updatedFields),
        }),
      });
      invalidateGlobalAssetCache();
      setItems((prev) => prev.map((it) => (it.id === tagEditItem.id ? mergedData : it)));
      if (detailItem?.id === tagEditItem.id) setDetailItem(mergedData);
      setTagEditItem(null);
      showToast('✅ 属性标签已更新保存');
    } catch (err) {
      alert('更新标签失败: ' + err);
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    editingItem,
    setEditingItem,
    tagEditItem,
    setTagEditItem,
    isUpdating,
    isDeleting,
    toggleFavorite,
    deleteAsset,
    handleBatchDelete,
    handleExportJsonBackup,
    handleImportJsonBackup,
    handleSaveEdit,
    handleSaveTagEdit,
  };
}
