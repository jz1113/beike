import { useState } from 'react';
import { apiFetch as rawApiFetch } from '@client/shared/api/apiClient';
import { pickAssetEditFields } from '@shared/domain/assets/assetEdit';
import { appearanceAudience } from '@shared/domain/assets/appearanceAudience';
import { isCompletePromptGroup, workshopAssetBlockReason } from '@shared/domain/workshop/workshopPipeline';

// Keep the raw Response contract while rejecting HTTP and business errors here.
async function apiFetch(...args: Parameters<typeof rawApiFetch>): Promise<Response> {
  const res = await rawApiFetch(...args);
  const body = await res.clone().json().catch(() => null);
  if (!res.ok || body?.success === false) throw new Error(body?.error || `请求失败 (${res.status})`);
  return res;
}
import { useAppStore } from '@client/store';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { resolveAssetApiType } from '../utils/assetPromptConstants';
import { buildBackupData, parseBackupDataToBulkItems } from '../utils/assetBackup';
import { parsePersonaLayers, formatPersonaPrompt } from '../utils/assetPromptConstants';

export interface UseAssetCrudOptions {
  activeSubTab: 'full_prompt' | 'persona' | 'outfit' | 'scene' | 'action';
  items: any[];
  setItems: React.Dispatch<React.SetStateAction<any[]>>;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  setIsBatchMode: (v: boolean) => void;
  setIsLoading: (v: boolean) => void;
  detailItem: any;
  setDetailItem: React.Dispatch<React.SetStateAction<any>>;
  showToast: (msg: string) => void;
  fetchAssets: (forceReload?: boolean) => Promise<void>;
  onEnterWorkshop?: () => void;
}

/**
 * 资产增删改查、收藏、去重、备份与工坊联动 Hook
 */
export function useAssetCrud({
  activeSubTab,
  setItems,
  selectedIds,
  setSelectedIds,
  setIsBatchMode,
  setIsLoading,
  detailItem,
  setDetailItem,
  showToast,
  fetchAssets,
  onEnterWorkshop,
}: UseAssetCrudOptions) {
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [tagEditItem, setTagEditItem] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const {
    setQuickPrompt,
    setCurrentView,
    setStep,
    setPendingBatchLockedAssets,
    setPendingBatchStage,
  } = useAppStore();

  // 一键彻底清空资产
  const handleClearAssets = async (scope: 'current' | 'all') => {
    const scopeName =
      scope === 'all'
        ? '全部本地数据库数据（资产、图集与分类、工坊项目、生成任务、历史记录及 AI 对话）'
        : `当前「${
            activeSubTab === 'full_prompt'
              ? '完整提示词'
              : activeSubTab === 'scene'
                ? '场景'
                : activeSubTab === 'action'
                  ? '动作'
                  : activeSubTab === 'outfit'
                    ? '穿搭'
                    : activeSubTab === 'persona'
                      ? '人物'
                      : '当前'
          }」全部资产`;
    if (!window.confirm(`⚠️ 高危操作：确定要彻底清空 ${scopeName} 吗？清空后将无法恢复，且重启服务也不会自动恢复。`)) return;

    try {
      const url = scope === 'all'
        ? '/api/catalog/assets/library?action=clear-database'
        : `/api/catalog/assets/library?action=clear-all&type=${resolveAssetApiType(activeSubTab)}`;
      const res = await apiFetch(url, {
        method: 'DELETE',
      });
      if (res && res.ok) {
        const data = await res.json();
        showToast(`🗑️ ${data.message || '已清空'}`);
        invalidateGlobalAssetCache();
        setSelectedIds([]);
        await fetchAssets(true);
      } else {
        throw new Error('清空失败');
      }
    } catch (err: any) {
      alert('清空操作失败: ' + (err.message || err));
    }
  };

  // 切换收藏
  const toggleFavorite = async (item: any, e?: React.MouseEvent) => {
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
        setDetailItem((prev: any) => (prev ? { ...prev, isFavorite: updatedFav } : null));
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
    if (selectedIds.length === 0) return;
    if (!window.confirm(`确认要彻底批量删除选中的 ${selectedIds.length} 项资产吗？`)) return;

    try {
      const idsParam = selectedIds.join(',');
      const response = await apiFetch(`/api/catalog/assets/library?type=${resolveAssetApiType(activeSubTab)}&ids=${idsParam}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || '删除失败');
      invalidateGlobalAssetCache();
      setItems((prev) => prev.filter((it) => !selectedIds.includes(it.id)));
      showToast(`🗑️ 成功批量删除 ${result.count ?? 0} 项资产`);
      setSelectedIds(prev => prev.filter(id => !selectedIds.includes(id)));
      setIsBatchMode(false);
      await fetchAssets(true);
    } catch (err: any) {
      alert('批量删除失败: ' + (err.message || err));
    }
  };

  // 一键智能提纯、分类归位与去重
  const handleDeduplicate = async () => {
    if (!window.confirm('智能提纯将自动扫描库中所有错位资产（如穿搭/动作/人物误存入场景），自动迁移归位到对应分类并深度去重，确定继续吗？')) return;
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/catalog/assets/library?action=deduplicate`, { method: 'DELETE' });
      if (res && res.ok) {
        const data = await res.json();
        showToast(`✨ ${data.message || '已完成智能提纯与积木重分类'}`);
        invalidateGlobalAssetCache();
        await fetchAssets(true);
      }
    } catch (err) {
      alert('提纯归位失败: ' + err);
    } finally {
      setIsLoading(false);
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
    } catch (err: any) {
      alert('导出失败: ' + (err.message || err));
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
      } catch (err: any) {
        alert('导入失败: ' + (err.message || err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 一键应用并载入种草工坊
  const handleApplyToWorkshop = (item: any) => {
    const blocked = workshopAssetBlockReason(item, activeSubTab);
    if (blocked) { showToast(blocked); return; }
    if ((activeSubTab === 'persona' || activeSubTab === 'outfit')
      && appearanceAudience(item, activeSubTab === 'outfit') === 'unknown') {
      showToast('请先确认该资产的适用人群，再载入工坊进行人物或穿搭替换');
      return;
    }
    let promptSnippet = '';
    if (activeSubTab === 'full_prompt') {
      if (!isCompletePromptGroup(item)) {
        showToast('该图组不是完整四图母本，请在资产库重新解构后再载入');
        return;
      }
      promptSnippet = [
        item.architectureSummary ? `【固定图组架构】${item.architectureSummary}` : '',
        item.contentSummary ? `【内容总结】${item.contentSummary}` : '',
      ].filter(Boolean).join('\n');
      // Loading a new mother means its own people, clothing and scene are the default.
      // Do not silently carry substitutions from the previously selected group.
      setPendingBatchLockedAssets({
        fullPromptId: item.id,
        personaId: 'auto',
        outfitId: 'auto',
        sceneId: 'auto',
        actionId: 'auto',
      });
      setPendingBatchStage(2);
    } else if (activeSubTab === 'scene') {
      const desc = item.description || '';
      const spacePart = desc.includes(item.title) ? desc : `${item.title ? `${item.title}，` : ''}${desc}`;
      promptSnippet = `【场景空间】：${spacePart}；【采光光影】：${item.lighting || '自然采光与清晰接触阴影'}`;
      setPendingBatchLockedAssets({ sceneId: item.id });
      setPendingBatchStage(2);
    } else if (activeSubTab === 'action') {
      const act = item.action || '';
      const actPart = act.includes(item.title) ? act : `${item.title ? `${item.title}，` : ''}${act}`;
      promptSnippet = `【抓拍动作】：${actPart}；【机位】：${item.camera || 'iPhone 50mm 生活镜头'}`;
      setPendingBatchLockedAssets({ actionId: item.id });
      setPendingBatchStage(2);
    } else if (activeSubTab === 'outfit') {
      promptSnippet = `【服装穿搭】：${item.top}，${item.bottom}${item.shoes ? `，${item.shoes}` : ''}，配色：${item.colorPalette || ''}`;
      setPendingBatchLockedAssets({ outfitId: item.id });
      setPendingBatchStage(2);
    } else if (activeSubTab === 'persona') {
      const layers = parsePersonaLayers(item.description || item.name);
      promptSnippet = `【模特博主】：${formatPersonaPrompt(layers)}`;
      setPendingBatchLockedAssets({ personaId: item.id });
      setPendingBatchStage(2);
    }

    setQuickPrompt(promptSnippet);

    if (onEnterWorkshop) {
      onEnterWorkshop();
    } else {
      const store = useAppStore.getState();
      store.setWorkshopMode('storyboard_generate');
      store.setActiveWorkshopTab('studio');
      setStep(2);
      setCurrentView('workshop');
    }
    showToast(activeSubTab === 'full_prompt'
      ? '已锁定图组母本；默认沿用原组人物、穿搭和场景，可在生产设置中单独替换'
      : '已载入电商工坊并锁定应用该提示词资产');
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
    handleClearAssets,
    toggleFavorite,
    deleteAsset,
    handleBatchDelete,
    handleDeduplicate,
    handleExportJsonBackup,
    handleImportJsonBackup,
    handleApplyToWorkshop,
    handleSaveEdit,
    handleSaveTagEdit,
  };
}
