import { useState, useEffect, useCallback, useRef } from 'react';
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
  const fetchedEmptyIds = useRef(new Set<string>());

  const openDetailItem = useCallback((item: Record<string, unknown>) => {
    setDetailItem(item);
    setDetailActiveImageIndex(
      typeof item.sourceImageIndex === 'number' ? Math.max(0, item.sourceImageIndex - 1) : 0
    );
    const hasPrompt = String(item.reversePromptZh || item.reversePrompt || item.description || '').trim();
    setDetailLoading(!hasPrompt && !fetchedEmptyIds.current.has(String(item.id || '')));
  }, []);

  useEffect(() => {
    if (!detailItem?.id) return;
    const id = String(detailItem.id);
    const needsFullPrompt =
      activeSubTab === 'full_prompt' &&
      !String(detailItem.reversePromptZh || detailItem.reversePrompt || '').trim();
    const needsReversePrompt =
      activeSubTab !== 'full_prompt' &&
      !String(detailItem.reversePrompt || detailItem.description || '').trim();
    if (!needsFullPrompt && !needsReversePrompt) {
      setDetailLoading(false);
      return;
    }
    if (fetchedEmptyIds.current.has(id)) {
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    fetchAssetDetail(activeSubTab, id)
      .then((full) => {
        if (cancelled || !full) return;
        const prompt = String(full.reversePromptZh || full.reversePrompt || full.description || '').trim();
        if (!prompt) fetchedEmptyIds.current.add(id);
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
