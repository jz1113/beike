import { useState, useEffect, useCallback } from 'react';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';

/**
 * 资产中心 UI 交互状态（Toast、复制反馈、卡片更多操作菜单、图片放大灯箱）
 */
export function useLibraryUiState() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { setSafeTimeout } = useSafeTimeout();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setSafeTimeout(() => setToastMsg(null), 2500);
  }, [setSafeTimeout]);

  // 监听点击外部关闭卡片菜单
  useEffect(() => {
    if (!openCardMenuId) return;
    const close = () => setOpenCardMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openCardMenuId]);

  // 监听 Esc 键关闭图片放大模态框
  useEffect(() => {
    if (!zoomImageUrl) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomImageUrl(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomImageUrl]);

  return {
    copiedId,
    setCopiedId,
    toastMsg,
    showToast,
    showMoreMenu,
    setShowMoreMenu,
    openCardMenuId,
    setOpenCardMenuId,
    zoomImageUrl,
    setZoomImageUrl,
  };
}
