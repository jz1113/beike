import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { densityComposerInputMaxH, densityComposerText } from '@/shared/ui/layoutClasses';
import type { SubjectItem } from '../../data/promptBarConstants';

export type { SubjectItem };

export interface RichPromptInputProps {
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPasteFiles?: (files: File[]) => void;
  placeholder?: string;
  allSubjects: SubjectItem[];
  quickRefImages: string[];
  onTriggerAtMenu?: (pos: number, query?: string) => void;
  onCloseAtMenu?: () => void;
  variant?: 'default' | 'composer';
  expanded?: boolean;
  singleLine?: boolean;
}

export interface RichPromptInputRef {
  focus: () => void;
  getSelectionStart: () => number;
  insertMention: (subject: SubjectItem) => void;
  setCursorToEnd: () => void;
}

/** 🌟 核心主体与提及解析器 (支持 @主体、@主体1、图片原名、去除后缀、数字标号、{{Mixed 1}} 等全方位识别) */
export function resolveSubjectByMention(
  mention: string,
  allSubjects: SubjectItem[],
  quickRefImages: string[] = []
): SubjectItem | null {
  if (!mention) return null;
  const clean = mention.replace(/^@/, '').replace(/[{}]/g, '').trim();
  if (!clean) return null;

  const cleanLower = clean.toLowerCase();
  const cleanNoExt = clean.replace(/\.[^/.]+$/, '').toLowerCase();
  const cleanNormalized = clean.replace(/[\s_\-.]+/g, '').toLowerCase();

  // 1. 特殊全局关键词：@主体 / @模特 / @参考图 / @主图 / @商品图 -> 默认对应第 1 个主体
  if (['主体', '模特', '参考图', '商品图', '主图', '人物', '商品', '图片', '图'].includes(cleanLower)) {
    if (allSubjects.length > 0) return allSubjects[0];
    if (quickRefImages.length > 0) {
      return { id: 'ref-0', name: '主体', url: quickRefImages[0] };
    }
  }

  // 2. 序号别名：@主体1, @主体2, @模特1, @图片1, @图1, @insp_1, @insp1, {{Mixed 1}}
  const seqMatch =
    clean.match(/^(?:主体|模特|参考图|商品图|主图|图片|图|insp_|insp|image|img|mixed\s*)(\d+)$/i) ||
    clean.match(/^(\d+)$/);
  if (seqMatch) {
    const idx = parseInt(seqMatch[1], 10) - 1;
    if (idx >= 0) {
      if (allSubjects[idx]) return allSubjects[idx];
      if (quickRefImages[idx]) {
        return {
          id: `ref-${idx}`,
          name: `insp_${idx + 1}`,
          url: quickRefImages[idx],
        };
      }
    }
  }

  // 3. 精准匹配名称或 ID (支持原名、带文件后缀或去除后缀)
  for (const s of allSubjects) {
    const sNameLower = s.name.toLowerCase();
    const sNameNoExt = s.name.replace(/\.[^/.]+$/, '').toLowerCase();
    const sNameNormalized = s.name.replace(/[\s_\-.]+/g, '').toLowerCase();

    if (
      s.id === clean ||
      sNameLower === cleanLower ||
      sNameNoExt === cleanNoExt ||
      sNameNoExt === cleanLower ||
      sNameLower === cleanNoExt ||
      sNameNormalized === cleanNormalized
    ) {
      return s;
    }
  }

  // 4. 模糊包含匹配 (例如文件名叫 "白色法式衬衫-模特图.png"，用户输入 "@白衬衫" 或 "@白色法式衬衫")
  if (clean.length >= 2) {
    for (const s of allSubjects) {
      const sNameNoExt = s.name.replace(/\.[^/.]+$/, '').toLowerCase();
      if (sNameNoExt.includes(cleanNoExt) || cleanNoExt.includes(sNameNoExt)) {
        return s;
      }
    }
  }

  return null;
}

export const RichPromptInput = forwardRef<RichPromptInputRef, RichPromptInputProps>(({
  ariaLabel = '提示词',
  value,
  onChange,
  onKeyDown,
  onPasteFiles,
  placeholder,
  allSubjects,
  quickRefImages,
  onTriggerAtMenu,
  onCloseAtMenu,
  variant = 'default',
  expanded = false,
  singleLine = false,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef<boolean>(false);
  const lastSyncedValueRef = useRef<string>('');

  // 查找匹配的主体
  const getSubjectByTag = useCallback((tag: string): SubjectItem | null => {
    return resolveSubjectByMention(tag, allSubjects, quickRefImages);
  }, [allSubjects, quickRefImages]);

  // 创建即梦同款内联微缩图胶囊 DOM 节点 (严格与文字平行居中对齐)
  const createMentionNode = useCallback((subject: SubjectItem): HTMLElement => {
    const pill = document.createElement('span');
    pill.contentEditable = 'false';
    pill.setAttribute('data-mention-id', subject.id);
    pill.setAttribute('data-mention-name', subject.name);
    pill.className =
      'inline-mention-pill inline-flex items-center gap-1 mx-1 px-1.5 py-0 h-[20px] rounded-md bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold border border-slate-300/80 shadow-2xs select-none align-middle relative -top-[1.5px] cursor-default';

    // 微型缩略图
    const img = document.createElement('img');
    img.src = subject.url;
    img.alt = '';
    img.className =
      'w-3.5 h-3.5 rounded-xs object-cover border border-slate-300/80 bg-white inline-block flex-shrink-0';
    pill.appendChild(img);

    // 标号或名称
    const label = document.createElement('span');
    label.textContent = subject.name;
    label.className = 'font-bold text-slate-900 font-mono text-[11px] leading-none pr-0.5 truncate max-w-[120px]';
    pill.appendChild(label);

    return pill;
  }, []);

  // 从 DOM 中提取标准字符串文本 (将内联胶囊节点还原为 @name 格式)
  const extractTextFromDOM = useCallback((container: HTMLElement): string => {
    let text = '';
    const traverse = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.hasAttribute('data-mention-name')) {
          const mentionName = el.getAttribute('data-mention-name');
          text += `@${mentionName}`;
        } else if (el.tagName === 'BR') {
          text += '\n';
        } else if (el.tagName === 'DIV' || el.tagName === 'P') {
          if (text.length > 0 && !text.endsWith('\n')) {
            text += '\n';
          }
          el.childNodes.forEach(traverse);
        } else {
          el.childNodes.forEach(traverse);
        }
      }
    };
    container.childNodes.forEach(traverse);
    return text.replace(/\u00A0/g, ' ');
  }, []);

  // 将纯文本/多模态文本渲染进 contentEditable DOM (即梦同款内联展示)
  const renderTextToDOM = useCallback((str: string, container: HTMLElement) => {
    // 安全：使用 replaceChildren 替代 innerHTML = ''，明确清空子树（避免历史 SVG/HTML 残留）
    container.replaceChildren();
    if (!str) return;

    const regex = /(@(?:insp_\d+|图片\d+|主体\d*|模特\d*|[a-zA-Z0-9_\u4e00-\u9fa5.-]+)|\{\{\s*(?:Mixed|Image|图)?\s*\d+\s*\}\})/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(str)) !== null) {
      const matchStart = match.index;
      const matchText = match[0];

      // 前置普通文本
      if (matchStart > lastIndex) {
        const textChunk = str.slice(lastIndex, matchStart);
        container.appendChild(document.createTextNode(textChunk));
      }

      // 匹配主体并创建内联胶囊
      const sub = getSubjectByTag(matchText);
      if (sub) {
        const pill = createMentionNode(sub);
        container.appendChild(pill);
      } else {
        container.appendChild(document.createTextNode(matchText));
      }

      lastIndex = matchStart + matchText.length;
    }

    // 剩余文本
    if (lastIndex < str.length) {
      const remaining = str.slice(lastIndex);
      container.appendChild(document.createTextNode(remaining));
    }
  }, [createMentionNode, getSubjectByTag]);

  // 外部 value 变化或主体列表更新时的单向同步 (避免正在输入时光标跳动)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Local edits already updated the DOM and selection. Never rebuild it on echo.
    if (document.activeElement === editor && value === lastSyncedValueRef.current) return;

    if (!value) {
      editor.replaceChildren();
      lastSyncedValueRef.current = '';
      return;
    }

    const currentDOMText = extractTextFromDOM(editor);
    // 当值改变，或者当前 DOM 尚未正确渲染胶囊（例如刚加载完主体列表）时，进行重绘
    const hasUnrenderedMention =
      /@(?:insp_\d+|图片\d+|主体\d*|模特\d*|[a-zA-Z0-9_\u4e00-\u9fa5.-]+)/.test(editor.textContent || '') &&
      editor.querySelectorAll('.inline-mention-pill').length < (value.match(/@/g)?.length || 0);

    if (value !== lastSyncedValueRef.current || value !== currentDOMText || hasUnrenderedMention) {
      renderTextToDOM(value, editor);
      lastSyncedValueRef.current = value;
    }
  }, [value, allSubjects, quickRefImages, extractTextFromDOM, renderTextToDOM]);

  // 暴露给父组件的控制句柄
  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    setCursorToEnd: () => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    },
    getSelectionStart: () => {
      const editor = editorRef.current;
      if (!editor) return 0;
      const text = extractTextFromDOM(editor);
      return text.length;
    },
    insertMention: (subject: SubjectItem) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.focus();
      const sel = window.getSelection();
      let range: Range;

      if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
      } else {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
      }

      // 若光标前以 @[query] 结尾，则自动替换掉该 @ 部分
      if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
        const textNode = range.startContainer as Text;
        const textBefore = textNode.textContent?.slice(0, range.startOffset) || '';
        const atMatch = textBefore.match(/@([a-zA-Z0-9_\u4e00-\u9fa5.\-]*)$/);
        if (atMatch) {
          const matchStart = textBefore.length - atMatch[0].length;
          const textAfter = textNode.textContent?.slice(range.startOffset) || '';
          textNode.textContent = textBefore.slice(0, matchStart) + textAfter;
          range.setStart(textNode, matchStart);
          range.setEnd(textNode, matchStart);
        }
      }

      // 创建并插入即梦同款内联图片微标胶囊
      const pill = createMentionNode(subject);
      range.deleteContents();
      range.insertNode(pill);

      // 在胶囊后追加一个空格节点，方便继续打字
      const spaceNode = document.createTextNode('\u00A0');
      pill.after(spaceNode);

      // 将光标定位至空格之后
      range = document.createRange();
      range.setStartAfter(spaceNode);
      range.collapse(true);
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }

      const newText = extractTextFromDOM(editor);
      lastSyncedValueRef.current = newText;
      onChange(newText);
    }
  }));

  const checkMentionAtCursor = () => {
    if (isComposingRef.current || !editorRef.current) return;
    const sel = window.getSelection();
    let isAtMatch = false;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const text = range.startContainer.textContent || '';
        const offset = range.startOffset;
        const textBefore = text.slice(0, offset);
        const atMatch = textBefore.match(/@([a-zA-Z0-9_\u4e00-\u9fa5.\-]*)$/);
        if (atMatch && onTriggerAtMenu) {
          isAtMatch = true;
          onTriggerAtMenu(offset, atMatch[1]);
        }
      }
    }
    // 🌟 当光标前没有 @ 模式时（如删除了 @），自动关闭 @ 弹层
    if (!isAtMatch && onCloseAtMenu) {
      onCloseAtMenu();
    }
  };

  const handleInput = () => {
    if (isComposingRef.current || !editorRef.current) return;
    const newText = extractTextFromDOM(editorRef.current);
    lastSyncedValueRef.current = newText;
    onChange(newText);

    checkMentionAtCursor();
  };

  // WebKit can leave the caret in the NBSP/empty text nodes beside a
  // non-editable pill. Delete the pill and its caret spacer atomically.
  const deleteAdjacentMention = (backward: boolean): boolean => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || isComposingRef.current) return false;
    const range = selection.getRangeAt(0);
    if (!range.collapsed || !editor.contains(range.startContainer)) return false;
    let container = range.startContainer;
    const offset = range.startOffset;
    let adjacent: Node | null;
    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent || '';
      const remaining = backward ? text.slice(0, offset) : text.slice(offset);
      if (!/^[\u00a0\u200b\ufeff]*$/.test(remaining)) return false;
      adjacent = backward ? container.previousSibling : container.nextSibling;
    } else {
      adjacent = container.childNodes[offset - (backward ? 1 : 0)] || null;
    }
    while (true) {
      if (!adjacent) {
        if (container === editor || !container.parentNode) return false;
        adjacent = backward ? container.previousSibling : container.nextSibling;
        container = container.parentNode;
        continue;
      }
      if (adjacent instanceof HTMLElement && adjacent.classList.contains('inline-mention-pill')) {
        const deletion = range.cloneRange();
        if (backward) deletion.setStartBefore(adjacent);
        else deletion.setEndAfter(adjacent);
        deletion.deleteContents();
        deletion.collapse(true);
        selection.removeAllRanges(); selection.addRange(deletion);
        const newText = extractTextFromDOM(editor);
        lastSyncedValueRef.current = newText;
        onChange(newText);
        onCloseAtMenu?.();
        return true;
      }
      if (adjacent.nodeType !== Node.TEXT_NODE || !/^[\u00a0\u200b\ufeff]*$/.test(adjacent.textContent || '')) return false;
      const next: Node | null = backward ? adjacent.previousSibling : adjacent.nextSibling;
      container = adjacent.parentNode!;
      adjacent = next;
    }
  };

  // beforeinput also covers virtual keyboards and native editing commands.
  useEffect(() => {
    const editor = editorRef.current;
    const beforeInput = (event: InputEvent) => {
      if (!event.cancelable || event.isComposing) return;
      if ((event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') && deleteAdjacentMention(event.inputType === 'deleteContentBackward')) event.preventDefault();
    };
    editor?.addEventListener('beforeinput', beforeInput);
    return () => editor?.removeEventListener('beforeinput', beforeInput);
  });

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || isComposingRef.current) return;
    if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'Backspace' || e.key === 'Delete') && deleteAdjacentMention(e.key === 'Backspace')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.key === 'Escape') {
      if (onCloseAtMenu) {
        onCloseAtMenu();
      }
    }

    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    const imageFiles: File[] = [];
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
    }
    if (imageFiles.length > 0 && onPasteFiles) {
      e.preventDefault();
      e.stopPropagation();
      onPasteFiles(imageFiles);
      return;
    }

    e.preventDefault();
    const pastedText = e.clipboardData.getData('text/plain');
    if (!pastedText) return;

    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const sel = window.getSelection();
    let range: Range;

    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }

    range.deleteContents();

    // 解析粘贴文本并逐个插入文本或胶囊
    const regex = /(@(?:insp_\d+|图片\d+|主体\d*|模特\d*|[a-zA-Z0-9_\u4e00-\u9fa5.-]+)|\{\{\s*(?:Mixed|Image|图)?\s*\d+\s*\}\})/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let lastInsertedNode: Node | null = null;

    while ((match = regex.exec(pastedText)) !== null) {
      const matchStart = match.index;
      const matchText = match[0];

      if (matchStart > lastIndex) {
        const textNode = document.createTextNode(pastedText.slice(lastIndex, matchStart));
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        lastInsertedNode = textNode;
      }

      const sub = getSubjectByTag(matchText);
      if (sub) {
        const pill = createMentionNode(sub);
        range.insertNode(pill);
        range.setStartAfter(pill);
        const spaceNode = document.createTextNode('\u00A0');
        range.insertNode(spaceNode);
        range.setStartAfter(spaceNode);
        lastInsertedNode = spaceNode;
      } else {
        const tagNode = document.createTextNode(matchText);
        range.insertNode(tagNode);
        range.setStartAfter(tagNode);
        lastInsertedNode = tagNode;
      }

      lastIndex = matchStart + matchText.length;
    }

    if (lastIndex < pastedText.length) {
      const remainingNode = document.createTextNode(pastedText.slice(lastIndex));
      range.insertNode(remainingNode);
      range.setStartAfter(remainingNode);
      lastInsertedNode = remainingNode;
    }

    if (lastInsertedNode && sel) {
      range = document.createRange();
      range.setStartAfter(lastInsertedNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    const newText = extractTextFromDOM(editor);
    lastSyncedValueRef.current = newText;
    onChange(newText);
  };

  const isComposer = variant === 'composer';
  const wrapperMinH = singleLine
    ? 'min-h-[24px] sm:min-h-[26px]'
    : isComposer
      ? (expanded ? 'min-h-[72px] sm:min-h-[80px]' : 'min-h-[52px] sm:min-h-[60px]')
      : 'min-h-[44px] sm:min-h-[50px] md:min-h-[58px] xl:min-h-[68px]';
  const editorMaxH = singleLine
    ? 'max-h-[26px]'
    : isComposer
      ? densityComposerInputMaxH
      : 'max-h-48 xl:max-h-64';
  const editorText = singleLine
    ? 'text-xs sm:text-[13.5px]'
    : isComposer
      ? densityComposerText
      : 'text-[14px] sm:text-[15px] md:text-[16px] xl:text-[17px]';
  const placeholderText = singleLine
    ? 'empty:before:text-xs sm:empty:before:text-[13.5px]'
    : isComposer
      ? 'empty:before:text-[14px] sm:empty:before:text-[14px] md:empty:before:text-[14.5px]'
      : 'empty:before:text-[14px] sm:empty:before:text-[14px] md:empty:before:text-[14.5px]';

  return (
    <div
      className={`relative w-full flex-1 flex ${singleLine ? 'items-center pt-0' : 'items-start pt-0.5'} ${wrapperMinH} gap-2 xl:gap-3 transition-[min-height] duration-200 ease-out overflow-x-hidden scrollbar-none no-scrollbar`}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        suppressContentEditableWarning
        onInput={handleInput}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          handleInput();
        }}
        onKeyDown={handleKeyDownInternal}
        onKeyUp={checkMentionAtCursor}
        onClick={checkMentionAtCursor}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        className={`rich-mention-contenteditable flex-1 min-w-[120px] w-full ${editorMaxH} overflow-x-hidden overflow-y-auto scrollbar-none no-scrollbar bg-transparent border-0 ring-0 text-slate-900 ${editorText} leading-relaxed outline-none font-normal p-0 select-text whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 ${placeholderText} empty:before:pointer-events-none ${singleLine ? 'self-center pt-0' : isComposer ? 'self-start pt-0' : 'self-start pt-0.5'}`}
      />
    </div>
  );
});

RichPromptInput.displayName = 'RichPromptInput';
