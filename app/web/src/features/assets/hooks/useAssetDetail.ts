import { useState, useEffect, useCallback } from 'react';
import { fetchAssetDetail } from '../assetLibraryCache';

export interface UseAssetDetailOptions {
  activeSubTab: 'full_prompt' | 'persona' | 'outfit' | 'scene' | 'action';
}

/**
 * 资产卡片详情与图片索引、详情按需补全 Hook
 */
export function useAssetDetail({ activeSubTab }: UseAssetDetailOptions) {
  const [detailItem, setDetailItem] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailActiveImageIndex, setDetailActiveImageIndex] = useState<number>(0);

  const openDetailItem = useCallback((item: Record<string, unknown>) => {
    setDetailItem(item);
    setDetailActiveImageIndex(
      typeof item.sourceImageIndex === 'number' ? Math.max(0, item.sourceImageIndex - 1) : 0
    );
  }, []);

  // 点击资产详情时，若无完整生图提示词，自动补拉全量字段
  useEffect(() => {
    if (!detailItem?.id) return;
    const needsFullPrompt =
      activeSubTab === 'full_prompt' &&
      !String(detailItem.reversePromptZh || detailItem.reversePrompt || '').trim();
    const needsReversePrompt =
      activeSubTab !== 'full_prompt' &&
      !String(detailItem.reversePrompt || detailItem.description || '').trim();
    if (!needsFullPrompt && !needsReversePrompt) return;

    let cancelled = false;
    setDetailLoading(true);
    fetchAssetDetail(activeSubTab, String(detailItem.id))
      .then((full) => {
        if (cancelled || !full) return;
        setDetailItem((prev: Record<string, unknown> | null) =>
          prev?.id === full.id ? { ...prev, ...full } : prev
        );
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailItem?.id, activeSubTab]);

  return {
    detailItem,
    setDetailItem,
    detailLoading,
    setDetailLoading,
    detailActiveImageIndex,
    setDetailActiveImageIndex,
    openDetailItem,
  };
}
