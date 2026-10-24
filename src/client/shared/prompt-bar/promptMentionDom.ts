import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import type { SubjectItem } from './promptBarConstants';
import { formatSubjectMention, PROMPT_MENTION_REGEX } from '@shared/domain/prompts/prompt-engine/mentions';
import { getRefMediaIdentity } from '@client/shared/media/refMediaRegistry';

export const SKILL_MENTION_REGEX = /#\[skill:([^\]]+)\]/gi;

export function createSkillNode(skillName: string): HTMLElement {
  const pill = document.createElement('span');
  pill.contentEditable = 'false';
  pill.setAttribute('data-skill-name', skillName);
  pill.className =
    'inline-skill-pill inline-flex items-center gap-1 mr-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-800 dark:bg-white/10 dark:hover:bg-white/15 dark:text-slate-100 dark:border-white/15 text-xs font-semibold border border-slate-200 shadow-2xs select-none align-middle relative -top-[1px] cursor-default transition-colors';

  const label = document.createElement('span');
  label.textContent = skillName;
  label.className = 'font-medium text-slate-900 dark:text-slate-100 text-xs leading-none';
  pill.appendChild(label);
  return pill;
}

export function createMentionNode(subject: SubjectItem): HTMLElement {
  const pill = document.createElement('span');
  pill.contentEditable = 'false';
  pill.setAttribute('data-mention-id', subject.id);
  pill.setAttribute('data-mention-media-id', getRefMediaIdentity(subject.url));
  pill.setAttribute('data-mention-name', subject.name);
  pill.className =
    'inline-mention-pill inline-flex items-center gap-1 mx-1 px-1.5 py-0 h-[20px] rounded-md bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold border border-slate-300/80 shadow-2xs select-none align-middle relative -top-[1.5px] cursor-default';

  if (isVideoMediaUrl(subject.url)) {
    const icon = document.createElement('span');
    icon.textContent = '▶';
    icon.setAttribute('aria-hidden', 'true');
    pill.appendChild(icon);
  } else {
    const img = document.createElement('img');
    img.src = subject.url;
    img.alt = '';
    img.className = 'w-3.5 h-3.5 rounded-xs object-cover border border-slate-300/80 bg-white inline-block flex-shrink-0';
    pill.appendChild(img);
  }

  const label = document.createElement('span');
  label.textContent = subject.name;
  label.className = 'font-bold text-slate-900 font-mono text-[11px] leading-none pr-0.5 truncate max-w-[120px]';
  pill.appendChild(label);
  return pill;
}

export function extractTextFromDOM(container: HTMLElement): string {
  let text = '';
  const traverse = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.hasAttribute('data-skill-name')) {
        text += `#[skill:${el.getAttribute('data-skill-name')}]`;
      } else if (el.hasAttribute('data-mention-name')) {
        text += formatSubjectMention(el.getAttribute('data-mention-media-id') || '', el.getAttribute('data-mention-name') || '');
      } else if (el.tagName === 'BR') {
        text += '\n';
      } else if (el.tagName === 'DIV' || el.tagName === 'P') {
        if (text.length > 0 && !text.endsWith('\n')) text += '\n';
        el.childNodes.forEach(traverse);
      } else {
        el.childNodes.forEach(traverse);
      }
    }
  };
  container.childNodes.forEach(traverse);
  return text.replace(/\u00A0/g, ' ');
}

export function renderTextToDOM(
  str: string,
  container: HTMLElement,
  getSubjectByTag: (tag: string) => SubjectItem | null,
) {
  container.replaceChildren();
  if (!str) return;

  // 综合匹配技能 token #[skill:xxx] 与 主体 token @...
  const combinedRegex = new RegExp(`(#\\[skill:[^\\]]+\\])|(?:${PROMPT_MENTION_REGEX.source})`, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = combinedRegex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(str.slice(lastIndex, match.index)));
    }
    const token = match[0];
    if (token.startsWith('#[skill:') && token.endsWith(']')) {
      const skillName = token.slice(8, -1);
      container.appendChild(createSkillNode(skillName));
    } else {
      const sub = getSubjectByTag(token);
      container.appendChild(sub ? createMentionNode(sub) : document.createTextNode(token));
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < str.length) {
    container.appendChild(document.createTextNode(str.slice(lastIndex)));
  }
}

export function resolveEditorInsertionRange(editor: HTMLElement): { range: Range; sel: Selection | null } {
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
  if (range.collapsed && range.startContainer.nodeType !== Node.TEXT_NODE && range.startOffset > 0) {
    const prevChild = range.startContainer.childNodes[range.startOffset - 1];
    if (prevChild && prevChild.nodeType === Node.TEXT_NODE) {
      const len = prevChild.textContent?.length || 0;
      range.setStart(prevChild, len);
      range.setEnd(prevChild, len);
    }
  }
  return { range, sel };
}

export function deleteAdjacentMention(editor: HTMLElement, backward: boolean): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
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
    if (
      adjacent instanceof HTMLElement &&
      (adjacent.classList.contains('inline-mention-pill') || adjacent.classList.contains('inline-skill-pill'))
    ) {
      const deletion = range.cloneRange();
      if (backward) deletion.setStartBefore(adjacent);
      else deletion.setEndAfter(adjacent);
      deletion.deleteContents();
      deletion.collapse(true);
      selection.removeAllRanges();
      selection.addRange(deletion);
      return true;
    }
    if (adjacent.nodeType !== Node.TEXT_NODE || !/^[\u00a0\u200b\ufeff]*$/.test(adjacent.textContent || '')) return false;
    const next: Node | null = backward ? adjacent.previousSibling : adjacent.nextSibling;
    container = adjacent.parentNode!;
    adjacent = next;
  }
}

export function insertPastedTextWithMentions(
  editor: HTMLElement,
  pastedText: string,
  getSubjectByTag: (tag: string) => SubjectItem | null,
): string {
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

  const regex = new RegExp(PROMPT_MENTION_REGEX.source, 'gi');
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

  return extractTextFromDOM(editor);
}


