import { useState, useRef, useEffect, useCallback, useMemo, type RefObject } from 'react';
import { useFileDropZone } from '@/lib/useFileDropZone';
import {
  isImageFile,
  isImageOrVideoFile,
  isVideoFile,
  processDroppedMediaFiles,
  readImageFileAsDataUrl,
  readVideoPreviewUrl,
  type RefMediaKind,
} from '@/lib/mediaUpload';
import {
  registerRefMedia,
  resolveRefMediaFile,
  resolveRefMediaKind,
  unregisterRefMedia,
} from '@/lib/refMediaRegistry';
import type { SubjectItem } from '../data/promptBarConstants';
import { buildPromptBarSubjects } from '../utils/promptBarSubmit';
import type { RichPromptInputRef } from '../components/prompt-bar/RichPromptInput';
import type { QuickGenMode } from '@beike/shared/depthVideo';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 智能将主体引用 (@name) 注入到提示词输入框中 (自动聚合在前置主体胶囊列表中) */
function insertMentionsIntoPrompt(currentPrompt: string, newMentionNames: string[]): string {
  if (newMentionNames.length === 0) return currentPrompt;

  // 过滤掉 prompt 中已经存在的精确 mention (避免 @1 与 @10 混淆)
  const namesToAdd = newMentionNames.filter((name) => {
    const reg = new RegExp(`(?:^|\\s)@${escapeRegExp(name)}(?:\\s|$|[，。,.!！?？])`);
    return !reg.test(currentPrompt);
  });

  if (namesToAdd.length === 0) return currentPrompt;

  const tagsString = namesToAdd.map((n) => `@${n}`).join(' ') + ' ';

  const trimmed = currentPrompt.trim();
  if (!trimmed) {
    return tagsString;
  }

  // 检查开头是否已有一串 @mention
  const leadingMentionsMatch = currentPrompt.match(/^(\s*(?:@(?:[^\s，。,.!！?？]+)\s*)+)/);
  if (leadingMentionsMatch) {
    const leadingPart = leadingMentionsMatch[1].trimEnd();
    const restPart = currentPrompt.slice(leadingMentionsMatch[0].length).trimStart();
    return `${leadingPart} ${tagsString}${restPart}`;
  }

  // 如果原本没有前置 mention，则将新主体放在最开头
  return `${tagsString}${currentPrompt.trimStart()}`;
}

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
      if (atMenuRef.current && !atMenuRef.current.contains(e.target as Node)) {
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
    extraSubjects.forEach((s) => map.set(s.name, s));
    base.forEach((s) => {
      if (!map.has(s.name)) {
        map.set(s.name, s);
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
    },
    [
      addQuickRefImage,
      bumpRefMediaVersion,
      isDepthMode,
      setRefImageNames,
      setQuickRefImages,
    ],
  );

  const addRefMedia = useCallback(
    (url: string, origName: string, file: File) => {
      addMultipleRefMedia([{ previewUrl: url, origName, file }]);
    },
    [addMultipleRefMedia],
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
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const selected = isDepthMode ? [files[0]] : Array.from(files);

    Promise.all(
      selected.map(async (file) => {
        const origName = file.name.replace(/\.[^/.]+$/, '').trim() || file.name;
        if (isVideoFile(file)) {
          const previewUrl = await readVideoPreviewUrl(file);
          return { previewUrl, origName, file };
        }
        const previewUrl = await readImageFileAsDataUrl(file);
        return { previewUrl, origName, file };
      }),
    )
      .then((items) => {
        addMultipleRefMedia(items);
      })
      .catch((err) => {
        console.error('无法读取上传的文件:', err);
        showToast('无法读取上传的文件');
      });

    e.target.value = '';
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
      const insertTag = `@${subject.name} `;
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
      const toProcess = isDepthMode ? [filtered[0]] : filtered;
      const collected: Array<{ previewUrl: string; origName: string; file: File }> = [];

      void processDroppedMediaFiles(
        toProcess,
        (url, origName, file) => {
          collected.push({ previewUrl: url, origName, file });
        },
        { onAllSkipped: rejectDrop, onError: (msg) => showToast(msg) },
      )
        .then(() => {
          if (collected.length > 0) {
            addMultipleRefMedia(collected);
          }
        })
        .catch(() => showToast('无法读取拖入的文件'));
    },
    [acceptDropFile, addMultipleRefMedia, isDepthMode, rejectDrop, showToast],
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
      const targetSub = allSubjects.find((s) => s.url === url) || allSubjects[index];
      const targetName = targetSub?.name;

      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
      removeQuickRefImage(index);
      if (url) {
        unregisterRefMedia(url);
        bumpRefMediaVersion();
        setRefImageNames((prev) => {
          const next = { ...prev };
          delete next[url];
          return next;
        });
      }

      // 同步从输入框中移除对应的 @mention 胶囊
      if (targetName) {
        const reg = new RegExp(`@${escapeRegExp(targetName)}(\\s+|$)`, 'g');
        setQuickPrompt(quickPrompt.replace(reg, '').replace(/\s{2,}/g, ' ').trimStart());
      }

      if (quickRefImages.length <= 1) {
        setIsExpandedRefImages(false);
      }
    },
    [allSubjects, bumpRefMediaVersion, quickPrompt, quickRefImages, removeQuickRefImage, setQuickPrompt],
  );

  const handleClearAllRefImages = useCallback(() => {
    quickRefImages.forEach((url) => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
      unregisterRefMedia(url);
    });

    // 清空全部素材时，同步清理输入框中的所有主体胶囊，保留纯文本描述
    let next = quickPrompt;
    allSubjects.forEach((sub) => {
      if (!sub?.name) return;
      const reg = new RegExp(`@${escapeRegExp(sub.name)}(\\s+|$)`, 'g');
      next = next.replace(reg, '');
    });
    setQuickPrompt(next.replace(/\s{2,}/g, ' ').trim());

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
    handleMouseEnterRefImages,
    handleMouseLeaveRefImages,
    handleFileUpload,
    handleCreateSubject,
    handleSelectSubject,
    handleRemoveRefImage,
    handleClearAllRefImages,
    clearComposerMedia,
    dropZoneProps,
    handlePasteFiles,
  };
}
