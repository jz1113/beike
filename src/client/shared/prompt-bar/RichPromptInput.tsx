import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { densityComposerInputMaxH, densityComposerText } from '@client/shared/ui/layoutClasses';
import type { SubjectItem } from './promptBarConstants';
import { resolveSubjectByMention } from './promptMentions';
import {
  createMentionNode,
  createSkillNode,
  deleteAdjacentMention,
  extractTextFromDOM,
  insertPastedTextWithMentions,
  renderTextToDOM,
  resolveEditorInsertionRange,
} from './promptMentionDom';
import type { RichPromptInputProps, RichPromptInputRef } from './richPromptInputTypes';
import { extractPromptMentions } from '@shared/domain/prompts/prompt-engine/mentions';

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
    const promptMentionsCount = extractPromptMentions(value).length;
    const renderedPillsCount = editor.querySelectorAll('.inline-mention-pill').length;
    const skillMatches = value.match(/#\[skill:[^\]]+\]/g) || [];
    const renderedSkillsCount = editor.querySelectorAll('.inline-skill-pill').length;
    const hasUnrenderedMention = promptMentionsCount > renderedPillsCount || skillMatches.length > renderedSkillsCount;

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
    insertAtSymbol: () => {
      const editor = editorRef.current;
      if (!editor) return;
      const { range, sel } = resolveEditorInsertionRange(editor);
      if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
        const textBefore = range.startContainer.textContent?.slice(0, range.startOffset) || '';
        const existingAt = textBefore.match(/@([a-zA-Z0-9_\u4e00-\u9fa5.-]*)$/);
        if (existingAt) {
          onTriggerAtMenu?.(extractTextFromDOM(editor).length, existingAt[1]);
          return;
        }
      }
      const atNode = document.createTextNode('@');
      range.deleteContents();
      range.insertNode(atNode);
      const nextRange = document.createRange();
      nextRange.setStartAfter(atNode);
      nextRange.collapse(true);
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(nextRange);
      }
      const newText = extractTextFromDOM(editor);
      lastSyncedValueRef.current = newText;
      onChange(newText);
      onTriggerAtMenu?.(newText.length, '');
    },
    insertMention: (subject: SubjectItem) => {
      const editor = editorRef.current;
      if (!editor) return;
      const resolved = resolveEditorInsertionRange(editor);
      const { sel } = resolved;
      let { range } = resolved;

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
    },
    insertSkill: (skillName: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.focus();
      // 如果已存在开头的技能胶囊，先清理掉原有的技能胶囊
      const currentSkillPill = editor.querySelector('.inline-skill-pill');
      if (currentSkillPill) {
        currentSkillPill.remove();
      }

      const pill = createSkillNode(skillName);
      // 插入在最前面
      if (editor.firstChild) {
        editor.insertBefore(pill, editor.firstChild);
      } else {
        editor.appendChild(pill);
      }

      // 在胶囊后追加一个空格节点（若没有的话）
      const nextSibling = pill.nextSibling;
      let targetNode: Node = pill;
      if (!nextSibling || nextSibling.nodeType !== Node.TEXT_NODE) {
        const spaceNode = document.createTextNode('\u00A0');
        pill.after(spaceNode);
        targetNode = spaceNode;
      }

      // 将光标移动到胶囊之后
      const range = document.createRange();
      range.setStartAfter(targetNode);
      range.collapse(true);
      const sel = window.getSelection();
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

  const handleDeleteAdjacentMention = (backward: boolean): boolean => {
    const editor = editorRef.current;
    if (!editor || isComposingRef.current) return false;
    const deleted = deleteAdjacentMention(editor, backward);
    if (deleted) {
      const newText = extractTextFromDOM(editor);
      lastSyncedValueRef.current = newText;
      onChange(newText);
      onCloseAtMenu?.();
      return true;
    }
    return false;
  };

  // beforeinput also covers virtual keyboards and native editing commands.
  useEffect(() => {
    const editor = editorRef.current;
    const beforeInput = (event: InputEvent) => {
      if (!event.cancelable || event.isComposing) return;
      if ((event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') && handleDeleteAdjacentMention(event.inputType === 'deleteContentBackward')) event.preventDefault();
    };
    editor?.addEventListener('beforeinput', beforeInput);
    return () => editor?.removeEventListener('beforeinput', beforeInput);
  });

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || isComposingRef.current) return;
    if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'Backspace' || e.key === 'Delete') && handleDeleteAdjacentMention(e.key === 'Backspace')) {
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
    const pastedFiles: File[] = [];
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
    }
    if (pastedFiles.length > 0 && onPasteFiles) {
      e.preventDefault();
      e.stopPropagation();
      onPasteFiles(pastedFiles);
      return;
    }

    e.preventDefault();
    const pastedText = e.clipboardData.getData('text/plain');
    if (!pastedText) return;

    const editor = editorRef.current;
    if (!editor) return;

    const newText = insertPastedTextWithMentions(editor, pastedText, getSubjectByTag);
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
  const editorText = singleLine ? 'text-xs sm:text-[13.5px]' : isComposer ? densityComposerText : 'text-[14px] sm:text-[15px] md:text-[16px] xl:text-[17px]';
  const placeholderText = singleLine ? 'empty:before:text-xs sm:empty:before:text-[13.5px]' : 'empty:before:text-[14px] sm:empty:before:text-[14px] md:empty:before:text-[14.5px]';

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
        data-placeholder={placeholder || ''}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        className={`rich-mention-contenteditable flex-1 min-w-[120px] w-full ${editorMaxH} overflow-x-hidden overflow-y-auto scrollbar-none no-scrollbar bg-transparent border-0 ring-0 text-slate-900 dark:text-slate-100 ${editorText} leading-relaxed outline-none font-normal p-0 select-text whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 dark:empty:before:text-slate-400 ${placeholderText} empty:before:pointer-events-none ${singleLine ? 'self-center pt-0' : isComposer ? 'self-start pt-0' : 'self-start pt-0.5'}`}
      />
    </div>
  );
});

RichPromptInput.displayName = 'RichPromptInput';
