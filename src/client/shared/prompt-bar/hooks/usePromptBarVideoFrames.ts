import { useRef, type ChangeEvent } from 'react';
import { useAppStore } from '@client/store';
import { readFileAsDataUrl } from '@client/shared/api/mediaUpload';

interface UsePromptBarVideoFramesOptions {
  showToast: (message: string) => void;
  setQuickVideoFirstFrame: (frame: string | null) => void;
  setQuickVideoLastFrame: (frame: string | null) => void;
  addQuickVideoMultiFrame: (frame: string) => void;
}

export function usePromptBarVideoFrames({
  showToast,
  setQuickVideoFirstFrame,
  setQuickVideoLastFrame,
  addQuickVideoMultiFrame,
}: UsePromptBarVideoFramesOptions) {
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const multiFrameInputRef = useRef<HTMLInputElement>(null);

  const uploadFrames = (event: ChangeEvent<HTMLInputElement>, apply: (url: string) => void) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    void useAppStore.getState().readPromptAttachments(async () => {
      const urls = await Promise.all(files.map(readFileAsDataUrl));
      urls.forEach(apply);
    }).catch(() => showToast('无法读取参考帧，请重新选择图片'));
  };

  return {
    firstFrameInputRef,
    lastFrameInputRef,
    multiFrameInputRef,
    handleUploadFirstFrame: (event: ChangeEvent<HTMLInputElement>) => uploadFrames(event, setQuickVideoFirstFrame),
    handleUploadLastFrame: (event: ChangeEvent<HTMLInputElement>) => uploadFrames(event, setQuickVideoLastFrame),
    handleUploadMultiFrame: (event: ChangeEvent<HTMLInputElement>) => uploadFrames(event, addQuickVideoMultiFrame),
  };
}
