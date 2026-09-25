import { useState, useCallback, useEffect, useRef } from 'react';
import { useSafeTimeout } from '@/shared/hooks/useSafeTimeout';
import {
  getCachedAssetsSync,
  getCategoryAssetLibrary,
  invalidateGlobalAssetCache,
  subscribeAssetInvalidation,
} from '@/shared/api/assetLibraryCache';
import { isNonHumanPlaceholderAsset } from '../utils/assetPromptConstants';

export interface UseAssetListOptions {
  activeSubTab: 'full_prompt' | 'persona' | 'outfit' | 'scene' | 'action';
  showToast: (msg: string) => void;
  setCopiedId: (id: string | null) => void;
}

/**
 * 资产列表加载、缓存同步与批量多选管理 Hook
 */
export function useAssetList({
  activeSubTab,
  showToast,
  setCopiedId,
}: UseAssetListOptions) {
  const activeTabRef = useRef(activeSubTab);
  activeTabRef.current = activeSubTab;
  const loadIdRef = useRef(0);
  const { setSafeTimeout } = useSafeTimeout();
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<any[]>(() => getCachedAssetsSync(activeSubTab).filter((item) => !isNonHumanPlaceholderAsset(item, activeSubTab)));
  const [totalCount, setTotalCount] = useState(() => getCachedAssetsSync(activeSubTab).filter((item) => !isNonHumanPlaceholderAsset(item, activeSubTab)).length);

  const [loadError, setLoadError] = useState('');

  // 批量管理与选中状态
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 加载当前类型的资产列表（全局 SWR 缓存）
  const fetchAssets = useCallback(
    async (forceReload = false) => {
      if (forceReload) invalidateGlobalAssetCache();
      const loadId = ++loadIdRef.current;
      setLoadError('');
      setIsLoading(true);

      try {
        await getCategoryAssetLibrary(activeSubTab, forceReload);
        if (activeTabRef.current !== activeSubTab || loadIdRef.current !== loadId) return;
        const list = getCachedAssetsSync(activeSubTab).filter((item) => !isNonHumanPlaceholderAsset(item, activeSubTab));
        setItems(list);
        setTotalCount(list.length);
      } catch (err) {
        if (activeTabRef.current !== activeSubTab || loadIdRef.current !== loadId) return;
        const message = err instanceof Error ? err.message : '请重试';
        setLoadError(message);
        showToast(`资产加载失败：${message}`);
      } finally {
        if (activeTabRef.current === activeSubTab && loadIdRef.current === loadId) setIsLoading(false);
      }
    },
    [activeSubTab, showToast]
  );

  const refreshAssets = useCallback(() => {
    void fetchAssets(true);
  }, [fetchAssets]);

  // Cached rows can render immediately, but failure must not masquerade as an empty library.
  useEffect(() => {
    const list = getCachedAssetsSync(activeSubTab).filter((item) => !isNonHumanPlaceholderAsset(item, activeSubTab));
    setItems(list); setTotalCount(list.length);
    void fetchAssets(false);
    const unsubscribe = subscribeAssetInvalidation(() => { void fetchAssets(false); });
    return () => { ++loadIdRef.current; unsubscribe(); };
  }, [activeSubTab, fetchAssets]);

  // 切换分类时重置批量勾选
  useEffect(() => {
    setSelectedIds([]);
  }, [activeSubTab]);

  // 切换单项选择
  const toggleSelectItem = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // 全选/取消全选
  const handleToggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((it) => it.id));
    }
  };

  // 一键复制提示词片段
  const handleCopyPrompt = (text: string, id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      showToast('📋 已复制提示词片段到剪贴板');
      setSafeTimeout(() => setCopiedId(null), 2000);
    }).catch(() => showToast('复制失败，请检查剪贴板权限后重试'));
  };

  return {
    loadError,
    isLoading,
    setIsLoading,
    items,
    setItems,
    totalCount,
    setTotalCount,
    isBatchMode,
    setIsBatchMode,
    selectedIds,
    setSelectedIds,
    fetchAssets,
    refreshAssets,
    toggleSelectItem,
    handleToggleSelectAll,
    handleCopyPrompt,
  };
}
