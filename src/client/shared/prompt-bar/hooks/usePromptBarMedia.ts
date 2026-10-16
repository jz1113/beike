import { useState, useRef, useEffect, useCallback, useMemo, type RefObject } from 'react';
import { useFileDropZone } from '@client/shared/hooks/useFileDropZone';
import {
  isImageFile,
  isImageOrVideoFile,
  isVideoFile,
  type RefMediaKind,
} from '@client/shared/api/mediaUpload';
import { isAgentAttachmentFile, loadPromptBarUploads } from '../agentAttachments';
import {
  getRefMediaIdentity,
  registerRefMedia,
  resolveRefMediaFile,
  resolveRefMediaKind,
} from '@client/shared/media/refMediaRegistry';
import type { SubjectItem } from '@client/shared/prompt-bar/promptBarConstants';
import { buildPromptBarSubjects } from '@client/shared/prompt-bar/promptBarSubmit';
import type { RichPromptInputRef } from '@client/shared/prompt-bar/RichPromptInput';
import type { QuickGenMode } from '@shared/domain/media/depthVideo';
import { removePromptReferences, serializeSubjectMention } from '../promptSubjectReferences';

interface UsePromptBarMediaOptions {
  quickGenMode: QuickGenMode;
  isDepthMode: boolean;
  quickPrompt: string;
  setQuickPrompt: (prompt: string) => void;
  quickRefImages: string[];
  setQuickRefImages: (images: string[]) => void;
  addQuickRefImage: (image: string) => void;
  removeQuickRefImage: (index: number) => void;
  setQuickVideoFirstFrame: (frame: string | null) => void;
  setQuickVideoLastFrame: (frame: string | null) => void;
  setQuickVideoMultiFrames: (frames: string[]) => void;
  images?: Array<{ url: string; type?: string; prompt?: string; id?: string }>;
  showToast: (msg: string) => void;
  richInputRef: RefObject<RichPromptInputRef | null>;
  extraSubjects?: SubjectItem[];
}

export function usePromptBarMedia({
  quickGenMode,
  isDepthMode,
  quickPrompt,
  setQuickPrompt,
  quickRefImages,
  setQuickRefImages,
  addQuickRefImage,
  removeQuickRefImage,
  setQuickVideoFirstFrame,
  setQuickVideoLastFrame,
  setQuickVideoMultiFrames,
  images,
  showToast,
  richInputRef,
  extraSubjects,
}: UsePromptBarMediaOptions) {
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [isExpandedRefImages, setIsExpandedRefImages] = useState(false);
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atMenuTrigger, setAtMenuTrigger] = useState<'input' | 'button' | null>(null);
  const [atMenuQuery, setAtMenuQuery] = useState('');
  const [activeSubjects, setActiveSubjects] = useState<SubjectItem[]>([]);
  const [customSubjects, setCustomSubjects] = useState<SubjectItem[]>([]);
  const [refImageNames, setRefImageNames] = useState<Record<string, string>>({});
  const [refMediaVersion, setRefMediaVersion] = useState(0);

  const bumpRefMediaVersion = useCallback(() => setRefMediaVersion((v) => v + 1), []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createSubjectInputRef = useRef<HTMLInputElement>(null);
  const refImagesContainerRef = useRef<HTMLDivElement>(null);
  const atMenuRef = useRef<HTMLDivElement>(null);
  const atMenuButtonRef = useRef<HTMLDivElement>(null);
  const hoverRefImagesTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 清理悬停定时器
  useEffect(() => {
    return () => {
      if (hoverRefImagesTimeout.current) clearTimeout(hoverRefImagesTimeout.current);
    };
  }, []);

  // 点击外部或按 ESC 键时关闭 @ 菜单
  useEffect(() => {
    if (!showAtMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (!atMenuRef.current?.contains(e.target as Node) && !atMenuButtonRef.current?.contains(e.target as Node)) {
        setShowAtMenu(false);
        setAtMenuTrigger(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAtMenu(false);
        setAtMenuTrigger(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAtMenu]);

  const handleMouseEnterRefImages = useCallback(() => {
    if (hoverRefImagesTimeout.current) {
      clearTimeout(hoverRefImagesTimeout.current);
      hoverRefImagesTimeout.current = null;
    }
  }, []);

  const handleMouseLeaveRefImages = useCallback(() => {
    if (hoverRefImagesTimeout.current) {
      clearTimeout(hoverRefImagesTimeout.current);
      hoverRefImagesTimeout.current = null;
    }
  }, []);

  // 聚合所有可用主体（优先保留导入文件原名，原名不可用时按序号命名，融合画板等额外主体）
  const allSubjects = useMemo(() => {
    const base = buildPromptBarSubjects({
      customSubjects,
      quickRefImages,
      refImageNames,
      images,
    });
    if (!extraSubjects || extraSubjects.length === 0) return base;
    const map = new Map<string, SubjectItem>();
    // 画板主体优先保留
    extraSubjects.forEach((s) => map.set(s.url, s));
    base.forEach((s) => {
      if (!map.has(s.url)) {
        map.set(s.url, s);
      }
    });
    return Array.from(map.values());
  }, [customSubjects, quickRefImages, refImageNames, images, extraSubjects]);

  const clearComposerMedia = useCallback(() => {
    bumpRefMediaVersion();
    setQuickPrompt('');
    setQuickRefImages([]);
    setRefImageNames({});
    setActiveSubjects([]);
    setCustomSubjects([]);
    setQuickVideoFirstFrame(null);
    setQuickVideoLastFrame(null);
    setQuickVideoMultiFrames([]);
    setIsExpandedRefImages(false);
  }, [
    bumpRefMediaVersion,
    setQuickPrompt,
    setQuickRefImages,
    setQuickVideoFirstFrame,
    setQuickVideoLastFrame,
    setQuickVideoMultiFrames,
  ]);

  const addMultipleRefMedia = useCallback(
    (items: Array<{ previewUrl: string; origName: string; file: File }>) => {
      if (items.length === 0) return;

      if (isDepthMode) {
        const first = items[0];
        registerRefMedia(first.previewUrl, first.file, first.origName);
        bumpRefMediaVersion();
        setRefImageNames({ [first.previewUrl]: first.origName });
        setQuickRefImages([first.previewUrl]);
        return;
      }

      const newNamesMap: Record<string, string> = {};
      const newMentionNames: string[] = [];

      let currentTotal = quickRefImages.length;
      items.forEach((item) => {
        registerRefMedia(item.previewUrl, item.file, item.origName);
        newNamesMap[item.previewUrl] = item.origName;

        currentTotal += 1;
        const cleanName = item.origName.replace(/\.[^/.]+$/, '').trim();
        // 优先使用导入文件原名；若原名不可用则使用序号
        const subjectName = cleanName || `${currentTotal}`;
        newMentionNames.push(subjectName);
      });

      bumpRefMediaVersion();
      setRefImageNames((prev) => ({ ...prev, ...newNamesMap }));
      // 逐个追加至 quickRefImages
      items.forEach((item) => addQuickRefImage(item.previewUrl));

      if (quickGenMode !== 'agent') {
        const mentionTokens = items.map((item, idx) => {
          const sub: SubjectItem = {
            id: getRefMediaIdentity(item.previewUrl),
            name: newMentionNames[idx] || `${currentTotal - items.length + idx + 1}`,
            url: item.previewUrl,
          };
          return serializeSubjectMention(sub);
        });
        if (mentionTokens.length > 0) {
          const mentionStr = mentionTokens.join(' ') + ' ';
          const trimmed = quickPrompt.trim();
          setQuickPrompt(trimmed ? `${trimmed} ${mentionStr}` : mentionStr);
        }
      }
    },
    [isDepthMode, quickGenMode, quickPrompt, quickRefImages.length, bumpRefMediaVersion, setQuickRefImages, addQuickRefImage, setQuickPrompt],
  );

  const resolveMediaFile = useCallback(
    (url: string) => resolveRefMediaFile(url),
    [refMediaVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const resolveMediaKind = useCallback(
    (url: string): RefMediaKind | undefined => resolveRefMediaKind(url),
    [refMediaVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const refMediaFile = quickRefImages[0] ? resolveRefMediaFile(quickRefImages[0]) ?? null : null;

  // 上传文件处理 (参考图/参考视频素材，保留原始文件名，并批量将主体标号写入输入框)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    e.target.value = '';
    if (!list?.length) return;
    const selected = isDepthMode ? [list[0]] : Array.from(list);
    void loadPromptBarUploads(selected, quickGenMode === 'agent')
      .then(({ media, agentUrls }) => {
        if (media.length) addMultipleRefMedia(media);
        agentUrls.forEach((url) => addQuickRefImage(url));
      })
      .catch(() => showToast('无法读取上传的文件'));
  };

  // 创建新主体
  const handleCreateSubject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const origName = file.name.replace(/\.[^/.]+$/, '').trim() || file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        const url = event.target.result;
        const newSub: SubjectItem = {
          id: `custom-${Date.now()}`,
          name: origName,
          url,
        };
        setRefImageNames((prev) => ({ ...prev, [url]: origName }));
        setCustomSubjects((prev) => [newSub, ...prev]);
        handleSelectSubject(newSub);
        setIsExpandedRefImages(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 选中某个主体并在光标所在精确位置插入 @主体名
  const handleSelectSubject = (subject: SubjectItem) => {
    setActiveSubjects((prev) => {
      if (prev.some((s) => s.id === subject.id || s.url === subject.url)) {
        return prev;
      }
      return [...prev, subject];
    });

    if (!quickRefImages.includes(subject.url)) {
      addQuickRefImage(subject.url);
      setIsExpandedRefImages(true);
    }

    if (richInputRef.current) {
      richInputRef.current.insertMention(subject);
    } else {
      const insertTag = `${serializeSubjectMention(subject)} `;
      const curr = quickPrompt;
      if (cursorPosition !== null && cursorPosition >= 0 && cursorPosition <= curr.length) {
        const prefix = curr.slice(0, cursorPosition);
        const suffix = curr.slice(cursorPosition);
        const updated = (prefix.endsWith('@') ? prefix.slice(0, -1) : prefix) + insertTag + suffix;
        setQuickPrompt(updated);
      } else {
        const updated = curr.endsWith('@')
          ? curr.slice(0, -1) + insertTag
          : curr
            ? curr + ' ' + insertTag
            : insertTag;
        setQuickPrompt(updated);
      }
    }
    setCursorPosition(null);
    setShowAtMenu(false);
    setAtMenuTrigger(null);
  };

  // 拖拽上传支持
  const rejectDrop = useCallback(() => {
    if (quickGenMode === 'depth-image') {
      showToast('请上传 JPG/PNG/WebP 图片');
      return;
    }
    if (quickGenMode === 'depth-video') {
      showToast('请上传 MP4/MOV/WebM 视频');
      return;
    }
    showToast('无法识别拖入的文件，请使用 JPG/PNG/WebP 等图片或 MP4/MOV 视频');
  }, [quickGenMode, showToast]);

  const acceptDropFile = useCallback(
    (file: File) => {
      if (quickGenMode === 'depth-image') return isImageFile(file);
      if (quickGenMode === 'depth-video') return isVideoFile(file);
      if (quickGenMode === 'agent' && isAgentAttachmentFile(file)) return true;
      return isImageOrVideoFile(file);
    },
    [quickGenMode],
  );

  const ingestMediaFiles = useCallback(
    (files: File[]) => {
      const filtered = files.filter(acceptDropFile);
      if (filtered.length === 0) {
        rejectDrop();
        return;
      }
      const selected = isDepthMode ? [filtered[0]] : filtered;
      void loadPromptBarUploads(selected, quickGenMode === 'agent')
        .then(({ media, agentUrls }) => {
          if (media.length) addMultipleRefMedia(media);
          agentUrls.forEach((url) => addQuickRefImage(url));
          if (!media.length && !agentUrls.length) rejectDrop();
        })
        .catch(() => showToast('无法读取拖入的文件'));
    },
    [acceptDropFile, addMultipleRefMedia, addQuickRefImage, isDepthMode, quickGenMode, rejectDrop, showToast],
  );

  const { dropZoneProps } = useFileDropZone({
    onFiles: ingestMediaFiles,
    accept: acceptDropFile,
    onReject: rejectDrop,
  });

  const handlePasteFiles = (files: File[]) => {
    ingestMediaFiles(files);
  };

  const handleRemoveRefImage = useCallback(
    (index: number) => {
      const url = quickRefImages[index];
      if (!url) return;
      const nextPrompt = removePromptReferences(quickPrompt, quickRefImages, new Set([url]), allSubjects);
      // Files and URLs are shared with historical and queued tasks; registry cleanup owns their lifetime.
      removeQuickRefImage(index);
      setQuickPrompt(nextPrompt);
      setActiveSubjects(prev => prev.filter(subject => subject.url !== url));
      setRefImageNames(prev => { const next = { ...prev }; delete next[url]; return next; });

      if (quickRefImages.length <= 1) {
        setIsExpandedRefImages(false);
      }
    },
    [allSubjects, quickPrompt, quickRefImages, removeQuickRefImage, setQuickPrompt],
  );

  const handleClearAllRefImages = useCallback(() => {
    setQuickPrompt(removePromptReferences(quickPrompt, quickRefImages, new Set(quickRefImages), allSubjects));

    setQuickRefImages([]);
    setRefImageNames({});
    setActiveSubjects([]);
    bumpRefMediaVersion();
    setIsExpandedRefImages(false);
  }, [allSubjects, bumpRefMediaVersion, quickPrompt, quickRefImages, setQuickPrompt, setQuickRefImages]);

  return {
    cursorPosition,
    setCursorPosition,
    isExpandedRefImages,
    setIsExpandedRefImages,
    showAtMenu,
    setShowAtMenu,
    atMenuTrigger,
    setAtMenuTrigger,
    atMenuQuery,
    setAtMenuQuery,
    activeSubjects,
    setActiveSubjects,
    customSubjects,
    allSubjects,
    refMediaFile,
    resolveMediaFile,
    resolveMediaKind,
    fileInputRef,
    createSubjectInputRef,
    refImagesContainerRef,
    atMenuRef,
    atMenuButtonRef,
    handleMouseEnterRefImages,
    handleMouseLeaveRefImages,
    handleFileUpload,
    handleCreateSubject,
    handleSelectSubject,
    handleRemoveRefImage,
    handleClearAllRefImages,
    addRefImage: addQuickRefImage,
    addQuickRefImage,
    clearComposerMedia,
    dropZoneProps,
    handlePasteFiles,
  };
}
