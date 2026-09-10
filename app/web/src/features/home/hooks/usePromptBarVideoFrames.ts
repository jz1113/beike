import { useRef } from 'react';

interface UsePromptBarVideoFramesOptions {
  setQuickVideoFirstFrame: (frame: string | null) => void;
  setQuickVideoLastFrame: (frame: string | null) => void;
  addQuickVideoMultiFrame: (frame: string) => void;
}

export function usePromptBarVideoFrames({
  setQuickVideoFirstFrame,
  setQuickVideoLastFrame,
  addQuickVideoMultiFrame,
}: UsePromptBarVideoFramesOptions) {
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const multiFrameInputRef = useRef<HTMLInputElement>(null);

  const handleUploadFirstFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setQuickVideoFirstFrame(event.target.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadLastFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setQuickVideoLastFrame(event.target.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadMultiFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          addQuickVideoMultiFrame(event.target.result);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  return {
    firstFrameInputRef,
    lastFrameInputRef,
    multiFrameInputRef,
    handleUploadFirstFrame,
    handleUploadLastFrame,
    handleUploadMultiFrame,
  };
}
