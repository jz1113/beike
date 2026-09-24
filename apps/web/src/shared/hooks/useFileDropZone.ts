import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';

/** HTML5 文件拖放 zone。 */
export interface UseFileDropZoneOptions {
  onFiles: (files: File[]) => void;
  accept?: (file: File) => boolean;
  disabled?: boolean;
  /** 拖放未包含匹配文件时回调（如 URL 文本拖入） */
  onDropWithoutFiles?: (e: DragEvent) => void;
  /** 有文件但全部被 accept 过滤时回调 */
  onReject?: (files: File[]) => void;
}

export function useFileDropZone({
  onFiles,
  accept,
  disabled = false,
  onDropWithoutFiles,
  onReject,
}: UseFileDropZoneOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const filterFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (!accept) return arr;
      return arr.filter(accept);
    },
    [accept],
  );

  const resetDrag = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  }, []);

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      dragDepthRef.current += 1;
      setIsDragging(true);
    },
    [disabled],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      dragDepthRef.current -= 1;
      if (dragDepthRef.current <= 0) resetDrag();
    },
    [disabled, resetDrag],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resetDrag();
      if (disabled) return;
      const rawFiles = e.dataTransfer.files;
      if (rawFiles?.length) {
        const all = Array.from(rawFiles);
        const filtered = filterFiles(rawFiles);
        if (filtered.length) {
          onFiles(filtered);
          return;
        }
        onReject?.(all);
        return;
      }
      onDropWithoutFiles?.(e);
    },
    [disabled, filterFiles, onFiles, onDropWithoutFiles, onReject, resetDrag],
  );

  return {
    isDragging,
    dropZoneProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}

/**
 * 防止浏览器在 dragover 时打开文件；不在 window drop 拦截，避免吞掉子 zone。
 * 桌面端还需 `dragDropEnabled: false`（见文件顶部注释）。
 */
export function usePreventBrowserFileOpen() {
  useEffect(() => {
    const onDragOver = (e: Event) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', onDragOver);
    return () => window.removeEventListener('dragover', onDragOver);
  }, []);
}
