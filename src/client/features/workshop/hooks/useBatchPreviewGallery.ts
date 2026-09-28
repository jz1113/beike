import { useState, useCallback } from 'react';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';

export interface PreviewGalleryState {
  images: string[];
  currentIndex: number;
  title?: string;
}

/**
 * 批量工作台大图与多图画廊预览 Hook
 */
export function useBatchPreviewGallery() {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewGallery, setPreviewGallery] = useState<PreviewGalleryState | null>(null);

  const openGalleryPreview = useCallback((images: string[], initialIndex = 0, title?: string) => {
    const validImages = (images || []).filter(Boolean);
    if (validImages.length === 0) return;
    const safeIdx = Math.max(0, Math.min(initialIndex, validImages.length - 1));
    setPreviewGallery({ images: validImages, currentIndex: safeIdx, title });
    setPreviewImageUrl(validImages[safeIdx] || null);
  }, []);

  const closeGalleryPreview = useCallback(() => {
    setPreviewGallery(null);
    setPreviewImageUrl(null);
  }, []);

  const setGalleryIndex = useCallback((newIdx: number) => {
    setPreviewGallery(prev => {
      if (!prev) return null;
      const total = prev.images.length;
      if (total === 0) return prev;
      const validIdx = (newIdx + total) % total;
      setPreviewImageUrl(prev.images[validIdx] || null);
      return { ...prev, currentIndex: validIdx };
    });
  }, []);

  const handleSetPreviewImageUrl = useCallback((url: string | null) => {
    setPreviewImageUrl(url);
    if (url) {
      setPreviewGallery({ images: [url], currentIndex: 0 });
    } else {
      setPreviewGallery(null);
    }
  }, []);

  return {
    previewImageUrl,
    setPreviewImageUrl,
    previewGallery,
    openGalleryPreview,
    closeGalleryPreview,
    setGalleryIndex,
    handleSetPreviewImageUrl,
  };
}

/**
 * 批量工作台 Toast 提示 Hook
 */
export function useBatchToast() {
  const { setSafeTimeout } = useSafeTimeout();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setSafeTimeout(() => setToastMsg(null), 3500);
  }, [setSafeTimeout]);

  return {
    toastMsg,
    showToast,
  };
}
