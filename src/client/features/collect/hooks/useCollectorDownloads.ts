import { useEffect, useRef, useState } from 'react';

type ExportOperation = (signal: AbortSignal) => Promise<void>;

/** Abort pending downloads on close, and claim each action before React re-renders. */
export function useCollectorDownloads(isOpen: boolean, showToast: (message: string) => void) {
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const controllers = useRef(new Map<'zip' | 'video', AbortController>());
  const openRef = useRef(isOpen);

  useEffect(() => {
    openRef.current = isOpen;
    if (!isOpen) {
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear();
      setIsDownloadingZip(false);
      setIsDownloadingVideo(false);
    }
    return () => {
      openRef.current = false;
      for (const controller of controllers.current.values()) controller.abort();
    };
  }, [isOpen]);

  const run = async (kind: 'zip' | 'video', operation: ExportOperation) => {
    if (!openRef.current) return;
    if (controllers.current.has(kind)) { showToast('已有素材正在下载，请等待完成'); return; }
    const controller = new AbortController();
    const setLoading = kind === 'zip' ? setIsDownloadingZip : setIsDownloadingVideo;
    controllers.current.set(kind, controller);
    setLoading(true);
    try { await operation(controller.signal); }
    finally {
      if (controllers.current.get(kind) === controller) {
        controllers.current.delete(kind);
        if (openRef.current) setLoading(false);
      }
    }
  };
  return { isDownloadingZip, isDownloadingVideo, runZipDownload: (operation: ExportOperation) => run('zip', operation), runVideoDownload: (operation: ExportOperation) => run('video', operation) };
}
