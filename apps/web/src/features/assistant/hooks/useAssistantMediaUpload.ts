import { useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { isImageFile, isVideoFile } from '@/lib/mediaUpload';
import { extractVideoThumbnail, fileToDataUrl } from '@/lib/mediaHelper';
import { useFileDropZone } from '@/lib/useFileDropZone';
import { useBlobUrl } from '@/lib/useBlobUrl';
import { SHORTCUT_REPEAT_GUARD_MS } from '@/lib/constants/timing';
import { formatUserError } from '@beike/domain/upstreamErrors';
import {
  LEGACY_OFFICE_EXT_RE,
  PLAIN_TEXT_EXT_RE,
  SUPPORTED_DOC_FORMATS,
  isDocumentFile,
  truncateDocText,
} from '@/features/assistant/assistantConstants';
import type { MediaAttachment } from '@/store/useAppStore';

interface UseAssistantMediaUploadOptions {
  isAssistantOpen: boolean;
  addAssistantAttachment: (attachment: MediaAttachment) => void;
  showToast: (msg: string) => void;
}

export function useAssistantMediaUpload({
  isAssistantOpen,
  addAssistantAttachment,
  showToast,
}: UseAssistantMediaUploadOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastPasteTimestampRef = useRef<number>(0);
  const blobUrl = useBlobUrl();

  // 上传文件处理 (图片 + 视频 + 文档)
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        if (LEGACY_OFFICE_EXT_RE.test(file.name)) {
          showToast(`⚠️ ${file.name}: 请另存为 .docx / .pptx 后再上传`);
          continue;
        }
        if (isImageFile(file)) {
          const url = await fileToDataUrl(file);
          addAssistantAttachment({
            type: 'image',
            url,
            name: file.name,
            size: file.size,
            mime: file.type || undefined,
          });
        } else if (isVideoFile(file)) {
          const thumb = await extractVideoThumbnail(file);
          const url = blobUrl.create(file);
          addAssistantAttachment({
            type: 'video',
            url,
            thumbnailUrl: thumb || undefined,
            name: file.name,
            size: file.size,
            mime: file.type,
          });
        } else if (isDocumentFile(file)) {
          try {
            let extractedText = '';
            let truncated = false;
            const lower = file.name.toLowerCase();

            if (
              PLAIN_TEXT_EXT_RE.test(lower) ||
              file.type.startsWith('text/') ||
              file.type === 'application/json'
            ) {
              const raw = await file.text();
              const t = truncateDocText(raw);
              extractedText = t.text;
              truncated = t.truncated;
            } else {
              const form = new FormData();
              form.append('file', file);
              const res = await apiFetch('/api/assistant/extract-document', {
                method: 'POST',
                body: form,
              });
              const data = await res.json();
              if (!data.success || !data.text) {
                showToast(`❌ ${file.name}: ${data.error || '文档解析失败'}`);
                continue;
              }
              extractedText = data.text;
              truncated = Boolean(data.truncated);
            }

            if (!extractedText.trim()) {
              showToast(`❌ ${file.name}: 未能提取到可读文本`);
              continue;
            }

            addAssistantAttachment({
              type: 'document',
              url: '',
              name: file.name,
              size: file.size,
              mime: file.type || undefined,
              extractedText,
            });
            showToast(
              truncated
                ? `📄 已挂载 ${file.name}（文本已截断）`
                : `📄 已挂载文档 ${file.name}`
            );
          } catch (err: any) {
            showToast(`❌ ${file.name}: ${formatUserError(err, '文档上传失败')}`);
          }
        } else {
          showToast(`⚠️ 暂不支持「${file.name}」。文档请用：${SUPPORTED_DOC_FORMATS}`);
        }
      }
    },
    [addAssistantAttachment, blobUrl, showToast]
  );

  const ingestAssistantFiles = useCallback(
    (files: File[]) => {
      void handleFiles(files);
    },
    [handleFiles]
  );

  const { dropZoneProps } = useFileDropZone({
    onFiles: ingestAssistantFiles,
    disabled: !isAssistantOpen,
  });

  // 🌟 剪贴板粘贴上传处理 (支持 Ctrl+V / Cmd+V 粘贴截图与图片文件，严格防冒泡与防重复)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const now = Date.now();
    if (now - lastPasteTimestampRef.current < SHORTCUT_REPEAT_GUARD_MS) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    const imageFiles: File[] = [];
    const seenSignatures = new Set<string>();

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const sig = `${file.name}-${file.size}-${file.type}`;
            if (!seenSignatures.has(sig)) {
              seenSignatures.add(sig);
              imageFiles.push(file);
            }
          }
        }
      }
    }

    // 仅在 items 无法提取到图片时，才回退扫描 files
    if (imageFiles.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const file = clipboardData.files[i];
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          const sig = `${file.name}-${file.size}-${file.type}`;
          if (!seenSignatures.has(sig)) {
            seenSignatures.add(sig);
            imageFiles.push(file);
          }
        }
      }
    }

    if (imageFiles.length > 0) {
      lastPasteTimestampRef.current = now;
      e.preventDefault();
      e.stopPropagation();
      await handleFiles(imageFiles);
      showToast(`🖼️ 已从剪贴板粘贴 ${imageFiles.length} 张图片！`);
    }
  };

  return {
    fileInputRef,
    handleFiles,
    handlePaste,
    dropZoneProps,
  };
}
