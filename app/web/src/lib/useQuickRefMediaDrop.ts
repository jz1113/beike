import { useCallback, useState } from 'react';
import { useFileDropZone } from '@/lib/useFileDropZone';
import { isImageOrVideoFile, processDroppedMediaFiles } from '@/lib/mediaUpload';
import { registerRefMedia } from '@/lib/refMediaRegistry';
import { useAppStore } from '@/store/useAppStore';
import { useSafeTimeout } from '@/lib/useSafeTimeout';

const REJECT_MSG = '无法识别拖入的文件，请使用 JPG/PNG/WebP 等图片或 MP4/MOV 视频';

/** 页面级拖拽上传参考素材（首页 / 生成工作区共用） */
export function useQuickRefMediaDrop() {
  const addQuickRefImage = useAppStore((s) => s.addQuickRefImage);
  const { setSafeTimeout } = useSafeTimeout();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setSafeTimeout(() => setToastMsg(null), 2500);
  }, [setSafeTimeout]);

  const rejectDrop = useCallback(() => {
    showToast(REJECT_MSG);
  }, [showToast]);

  const ingestPageMediaFiles = useCallback(
    (files: File[]) => {
      void processDroppedMediaFiles(
        files,
        (url, origName, file) => {
          registerRefMedia(url, file, origName);
          addQuickRefImage(url);
        },
        {
          onAllSkipped: rejectDrop,
          onError: (msg) => showToast(msg),
        },
      ).catch(() => showToast('无法读取拖入的文件'));
    },
    [addQuickRefImage, rejectDrop, showToast],
  );

  const { dropZoneProps } = useFileDropZone({
    onFiles: ingestPageMediaFiles,
    accept: isImageOrVideoFile,
    onReject: rejectDrop,
  });

  return { dropZoneProps, toastMsg };
}
