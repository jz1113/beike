import { useState, useCallback, useEffect, useRef } from 'react';
import { useSafeTimeout } from '@/shared/hooks/useSafeTimeout';
import {
  getCachedAssetsSync,
  getCategoryAssetLibrary,
  invalidateGlobalAssetCache,
  isAssetLibraryLoaded,
} from '../utils/assetLibraryCache';
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
  const [isLoading, setIsLoading] = useState(() => !isAssetLibraryLoaded());
  const [items, setItems] = useState<any[]>(() => getCachedAssetsSync(activeSubTab).filter((item) => !isNonHumanPlaceholderAsset(item, activeSubTab)));
  const [totalCount, setTotalCount] = useState(() => getCachedAssetsSync(activeSubTab).filter((item) => !isNonHumanPlaceholderAsset(item, activeSubTab)).length);

  // 批量管理与选中状态
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 加载当前类型的资产列表（全局 SWR 缓存）
  const fetchAssets = useCallback(
    async (forceReload = false) => {
      const loadId = ++loadIdRef.current;
      if (forceReload) {
        invalidateGlobalAssetCache();
        setIsLoading(true);
      }

      try {
        await getCategoryAssetLibrary(activeSubTab, forceReload);
        if (activeTabRef.current !== activeSubTab || loadIdRef.current !== loadId) return;
        const list = getCachedAssetsSync(activeSubTab).filter((item) => !isNonHumanPlaceholderAsset(item, activeSubTab));
        setItems(list);
        setTotalCount(list.length);
      } catch (err) {
        showToast(`资产加载失败：${err instanceof Error ? err.message : '请重试'}`);
      } finally {
        if (activeTabRef.current === activeSubTab && loadIdRef.current === loadId) setIsLoading(false);
      }
    },
    [activeSubTab, showToast]
  );

  const refreshAssets = useCallback(() => {
    void fetchAssets(true);
  }, [fetchAssets]);

  // Tab 切换时：0ms 瞬间本地秒开，静默刷新
  useEffect(() => {
    let isMounted = true;
    const list = getCachedAssetsSync(activeSubTab).filter((item) => !isNonHumanPlaceholderAsset(item, activeSubTab));
    setItems(list);
    setTotalCount(list.length);

    if (isAssetLibraryLoaded()) {
      getCategoryAssetLibrary(activeSubTab, false)
        .then(() => {
          if (!isMounted) return;
          const freshList = getCachedAssetsSync(activeSubTab).filter((item) => !isNonHumanPlaceholderAsset(item, activeSubTab));
          setItems(freshList);
          setTotalCount(freshList.length);
        })
        .catch(() => {});
    } else {
      void fetchAssets(false);
    }

    return () => {
      isMounted = false;
    };
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
