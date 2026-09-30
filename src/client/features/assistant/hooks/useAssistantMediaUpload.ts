import { useRef, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { isImageFile, isVideoFile, readImageFileAsDataUrl } from '@client/shared/api/mediaUpload';
import { extractVideoThumbnail } from '@client/shared/media/mediaHelper';
import { useFileDropZone } from '@client/shared/hooks/useFileDropZone';
import { useBlobUrl } from '@client/shared/hooks/useBlobUrl';
import { SHORTCUT_REPEAT_GUARD_MS } from '@client/shared/constants/timing';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import {
  LEGACY_OFFICE_EXT_RE,
  PLAIN_TEXT_EXT_RE,
  SUPPORTED_DOC_FORMATS,
  isDocumentFile,
  truncateDocText,
} from '@client/features/assistant/utils/assistantConstants';
import { useAppStore, type MediaAttachment } from '@client/store';

interface UseAssistantMediaUploadOptions {
  isAssistantOpen: boolean;
  sessionId: string;
  addAssistantAttachment: (attachment: MediaAttachment) => void;
  showToast: (msg: string) => void;
}

export function useAssistantMediaUpload({
  isAssistantOpen,
  sessionId,
  addAssistantAttachment,
  showToast,
}: UseAssistantMediaUploadOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastPasteTimestampRef = useRef(0);
  const mountedRef = useRef(true);
  const pendingCountsRef = useRef(new Map<string, number>());
  const controllersRef = useRef(new Set<AbortController>());
  const [isUploading, setIsUploading] = useState(false);
  const { create: createBlobUrl } = useBlobUrl();

  useEffect(() => {
    mountedRef.current = true;
    const controllers = controllersRef.current;
    return () => {
      mountedRef.current = false;
      controllers.forEach(controller => controller.abort());
    };
  }, []);

  useEffect(() => {
    const controllers = controllersRef.current;
    setIsUploading((pendingCountsRef.current.get(sessionId) || 0) > 0);
    return () => controllers.forEach(controller => controller.abort());
  }, [sessionId]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const controller = new AbortController();
    controllersRef.current.add(controller);
    const isCurrent = () => mountedRef.current && !controller.signal.aborted
      && useAppStore.getState().currentAssistantSessionId === sessionId;
    pendingCountsRef.current.set(sessionId, (pendingCountsRef.current.get(sessionId) || 0) + 1);
    setIsUploading(true);
    let processed = 0;
    const failures: string[] = [];
    const truncatedDocuments: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!isCurrent()) break;
        try {
          if (LEGACY_OFFICE_EXT_RE.test(file.name)) {
            failures.push(`${file.name}: 请另存为 .docx / .pptx 后再上传`);
            continue;
          }
          let attachment: MediaAttachment;
          if (isImageFile(file)) {
            const url = await readImageFileAsDataUrl(file);
            attachment = { type: 'image', url, name: file.name, size: file.size, mime: file.type || undefined };
          } else if (isVideoFile(file)) {
            const thumbnailUrl = await extractVideoThumbnail(file);
            if (!isCurrent()) break;
            attachment = { type: 'video', url: createBlobUrl(file), thumbnailUrl: thumbnailUrl || undefined,
              name: file.name, size: file.size, mime: file.type || undefined };
          } else if (isDocumentFile(file)) {
            let extractedText: string;
            let truncated: boolean;
            if (PLAIN_TEXT_EXT_RE.test(file.name) || file.type.startsWith('text/') || file.type === 'application/json') {
              const text = truncateDocText(await file.text());
              extractedText = text.text;
              truncated = text.truncated;
            } else {
              const form = new FormData();
              form.append('file', file);
              const response = await apiFetch('/api/assistant/extract-document', {
                method: 'POST', body: form, signal: controller.signal,
              });
              const data = await response.json();
              if (!response.ok || !data.success || typeof data.text !== 'string') {
                throw new Error(data.error || '文档解析失败');
              }
              extractedText = data.text;
              truncated = Boolean(data.truncated);
            }
            if (!extractedText.trim()) throw new Error('未能提取到可读文本');
            attachment = { type: 'document', url: '', name: file.name, size: file.size,
              mime: file.type || undefined, extractedText };
            if (truncated) truncatedDocuments.push(file.name);
          } else {
            failures.push(`暂不支持「${file.name}」。文档请用：${SUPPORTED_DOC_FORMATS}`);
            continue;
          }
          if (!isCurrent()) break;
          addAssistantAttachment(attachment);
          processed += 1;
        } catch (error) {
          if (isCurrent()) failures.push(`${file.name}: ${formatUserError(error, '附件读取失败')}`);
        }
      }
      if (isCurrent()) {
        const details = failures.slice(0, 3).join('；');
        const remaining = failures.length > 3 ? `；另有 ${failures.length - 3} 个失败附件` : '';
        const truncated = truncatedDocuments.length ? `（${truncatedDocuments.length} 个文档文本已截断）` : '';
        if (failures.length) showToast(`⚠️ 已添加 ${processed} 个附件${truncated}，${failures.length} 个未添加：${details}${remaining}`);
        else if (processed) showToast(`已添加 ${processed} 个附件${truncated}`);
      }
      return processed;
    } finally {
      controllersRef.current.delete(controller);
      const pending = (pendingCountsRef.current.get(sessionId) || 1) - 1;
      if (pending > 0) pendingCountsRef.current.set(sessionId, pending);
      else pendingCountsRef.current.delete(sessionId);
      if (mountedRef.current) setIsUploading((pendingCountsRef.current.get(useAppStore.getState().currentAssistantSessionId) || 0) > 0);
    }
  }, [sessionId, addAssistantAttachment, createBlobUrl, showToast]);

  const { dropZoneProps, isDragging } = useFileDropZone({
    onFiles: files => { void handleFiles(files); },
    disabled: !isAssistantOpen,
  });

  const handlePaste = async (e: React.ClipboardEvent) => {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items || [])) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    if (!files.length) files.push(...Array.from(e.clipboardData.files || []));
    if (!files.length) return;

    // Only debounce file pastes. A text paste immediately after a screenshot must remain usable.
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastPasteTimestampRef.current < SHORTCUT_REPEAT_GUARD_MS) return;
    lastPasteTimestampRef.current = now;
    await handleFiles(files);
  };

  return { fileInputRef, handleFiles, handlePaste, dropZoneProps, isUploading, isDragging };
}
