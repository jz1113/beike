import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { densityComposerInputMaxH, densityComposerText } from '@client/shared/ui/layoutClasses';
import type { SubjectItem } from './promptBarConstants';
import { resolveSubjectByMention } from './promptMentions';
import { createMentionNode, extractTextFromDOM, renderTextToDOM } from './promptMentionDom';
import type { RichPromptInputProps, RichPromptInputRef } from './richPromptInputTypes';

export type { SubjectItem, RichPromptInputProps, RichPromptInputRef } from './richPromptInputTypes';
export { resolveSubjectByMention } from './promptMentions';

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
      /@(?:insp_\d+|图片\d+|视频\d+|主体\d*|模特\d*|[a-zA-Z0-9_\u4e00-\u9fa5.-]+)/.test(editor.textContent || '') &&
      editor.querySelectorAll('.inline-mention-pill').length < (value.match(/@/g)?.length || 0);

    if (value !== lastSyncedValueRef.current || value !== currentDOMText || hasUnrenderedMention) {
      renderTextToDOM(value, editor, getSubjectByTag);
      lastSyncedValueRef.current = value;
    }
  }, [value, allSubjects, quickRefImages, getSubjectByTag]);

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
        const atMatch = textBefore.match(/@([a-zA-Z0-9_\u4e00-\u9fa5.-]*)$/);
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
        const atMatch = textBefore.match(/@([a-zA-Z0-9_\u4e00-\u9fa5.-]*)$/);
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
    const regex = /(@(?:insp_\d+|图片\d+|视频\d+|主体\d*|模特\d*|[a-zA-Z0-9_\u4e00-\u9fa5.-]+)|\{\{\s*(?:Mixed|Image|图)?\s*\d+\s*\}\})/gi;
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
