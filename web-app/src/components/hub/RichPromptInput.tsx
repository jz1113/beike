'use client';
import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Sparkles } from 'lucide-react';

export interface SubjectItem {
  id: string;
  name: string;
  url: string;
}

export interface RichPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  allSubjects: SubjectItem[];
  quickRefImages: string[];
  onTriggerAtMenu?: (pos: number) => void;
  onCleanPrompt?: () => void;
  showCleanButton?: boolean;
}

export interface RichPromptInputRef {
  focus: () => void;
  getSelectionStart: () => number;
  insertMention: (subject: SubjectItem) => void;
}

export const RichPromptInput = forwardRef<RichPromptInputRef, RichPromptInputProps>(({
  value,
  onChange,
  onKeyDown,
  placeholder,
  allSubjects,
  quickRefImages,
  onTriggerAtMenu,
  onCleanPrompt,
  showCleanButton
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef<boolean>(false);
  const lastSyncedValueRef = useRef<string>('');

  // 查找匹配的主体 (支持 insp_1, 图片1, 真实原名, {{Mixed 1}} 等)
  const getSubjectByTag = useCallback((tag: string): SubjectItem | null => {
    const clean = tag.replace(/^@/, '').replace(/[{}]/g, '').trim();
    if (!clean) return null;

    // 1. 精准匹配名称或 ID
    const found = allSubjects.find(s => s.name.toLowerCase() === clean.toLowerCase() || s.id === clean);
    if (found) return found;

    // 2. 匹配 insp_1, insp_2, 图片1, Mixed 1, 1, 2 等数字编号
    const numMatch = clean.match(/(?:insp_|图片|Mixed\s*)?(\d+)/i);
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1;
      if (quickRefImages[idx]) {
        return {
          id: `ref-${idx}`,
          name: `insp_${idx + 1}`,
          url: quickRefImages[idx]
        };
      }
      if (allSubjects[idx]) {
        return allSubjects[idx];
      }
    }
    return null;
  }, [allSubjects, quickRefImages]);

  // 创建即梦同款内联微缩图胶囊 DOM 节点 (严格与文字平行居中对齐)
  const createMentionNode = useCallback((subject: SubjectItem): HTMLElement => {
    const pill = document.createElement('span');
    pill.contentEditable = 'false';
    pill.setAttribute('data-mention-id', subject.id);
    pill.setAttribute('data-mention-name', subject.name);
    pill.className = 'inline-mention-pill inline-flex items-center gap-1 mx-1 px-1.5 py-0 h-[20px] rounded-md bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold border border-slate-300/80 shadow-2xs select-none align-middle relative -top-[1.5px] cursor-default';

    // 微型缩略图
    const img = document.createElement('img');
    img.src = subject.url;
    img.alt = '';
    img.className = 'w-3.5 h-3.5 rounded-xs object-cover border border-slate-300/80 bg-white inline-block flex-shrink-0';
    pill.appendChild(img);

    // 标号或名称
    const label = document.createElement('span');
    const numMatch = subject.name.match(/^insp_(\d+)$/i);
    const displayName = numMatch ? numMatch[1] : subject.name;
    label.textContent = displayName;
    label.className = 'font-bold text-slate-900 font-mono text-[11px] leading-none pr-0.5';
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
          text += `@${mentionName} `;
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
    container.innerHTML = '';
    if (!str) return;

    const regex = /(@(?:insp_\d+|图片\d+|[a-zA-Z0-9_\u4e00-\u9fa5\.\-]+)|\{\{\s*(?:Mixed|Image|图)?\s*\d+\s*\}\})/gi;
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

  // 外部 value 变化时的单向同步 (避免正在输入时光标跳动)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const currentDOMText = extractTextFromDOM(editor);
    if (value !== currentDOMText && value !== lastSyncedValueRef.current) {
      renderTextToDOM(value, editor);
      lastSyncedValueRef.current = value;
    }
  }, [value, extractTextFromDOM, renderTextToDOM]);

  // 暴露给父组件的控制句柄
  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
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

      // 若光标前以 @ 结尾，则自动替换掉该 @ 字符
      if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
        const textNode = range.startContainer as Text;
        const textBefore = textNode.textContent?.slice(0, range.startOffset) || '';
        if (textBefore.endsWith('@')) {
          textNode.textContent = textBefore.slice(0, -1) + (textNode.textContent?.slice(range.startOffset) || '');
          range.setStart(textNode, textBefore.length - 1);
          range.setEnd(textNode, textBefore.length - 1);
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

  const handleInput = () => {
    if (isComposingRef.current || !editorRef.current) return;
    const newText = extractTextFromDOM(editorRef.current);
    lastSyncedValueRef.current = newText;
    onChange(newText);

    // 检查光标前是否刚刚输入了 @
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const text = range.startContainer.textContent || '';
        const offset = range.startOffset;
        if (text.slice(0, offset).endsWith('@') && onTriggerAtMenu) {
          onTriggerAtMenu(offset);
        }
      }
    }
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // 退格键删除内联胶囊
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          const container = range.startContainer;
          const offset = range.startOffset;

          if (container.nodeType === Node.ELEMENT_NODE) {
            const el = container as HTMLElement;
            const prevChild = el.childNodes[offset - 1];
            if (prevChild && (prevChild as HTMLElement).classList?.contains('inline-mention-pill')) {
              e.preventDefault();
              prevChild.remove();
              if (editorRef.current) {
                const newText = extractTextFromDOM(editorRef.current);
                lastSyncedValueRef.current = newText;
                onChange(newText);
              }
              return;
            }
          } else if (container.nodeType === Node.TEXT_NODE && offset === 0) {
            const prevSibling = container.previousSibling;
            if (prevSibling && (prevSibling as HTMLElement).classList?.contains('inline-mention-pill')) {
              e.preventDefault();
              prevSibling.remove();
              if (editorRef.current) {
                const newText = extractTextFromDOM(editorRef.current);
                lastSyncedValueRef.current = newText;
                onChange(newText);
              }
              return;
            }
          }
        }
      }
    }

    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
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
    const regex = /(@(?:insp_\d+|图片\d+|[a-zA-Z0-9_\u4e00-\u9fa5\.\-]+)|\{\{\s*(?:Mixed|Image|图)?\s*\d+\s*\}\})/gi;
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

  return (
    <div className="relative w-full flex-1 flex items-center min-h-[40px] gap-2">
      {/* 🌟 即梦同款：原生富文本内联图片主体输入区 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          handleInput();
        }}
        onKeyDown={handleKeyDownInternal}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        className="rich-mention-contenteditable flex-1 min-w-[140px] max-h-40 overflow-y-auto bg-transparent border-0 text-slate-900 text-xs sm:text-sm leading-relaxed outline-none font-normal p-0 select-text whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none self-center"
      />

      {/* 🌟 智能排版净化浮标 */}
      {showCleanButton && onCleanPrompt && (
        <button
          type="button"
          onClick={onCleanPrompt}
          className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center gap-1 border border-indigo-200/80 shadow-2xs transition-all cursor-pointer flex-shrink-0 animate-fade-in self-center"
          title="点击自动去除 {{Mixed}} 占位符与 **Markdown** 标头，转换为大模型标准自然语言"
        >
          <Sparkles className="w-3 h-3 text-indigo-600" />
          <span>净化排版</span>
        </button>
      )}
    </div>
  );
});

RichPromptInput.displayName = 'RichPromptInput';
