import type { SubjectItem } from './promptBarConstants';

export function createMentionNode(subject: SubjectItem): HTMLElement {
  const pill = document.createElement('span');
  pill.contentEditable = 'false';
  pill.setAttribute('data-mention-id', subject.id);
  pill.setAttribute('data-mention-name', subject.name);
  pill.className =
    'inline-mention-pill inline-flex items-center gap-1 mx-1 px-1.5 py-0 h-[20px] rounded-md bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold border border-slate-300/80 shadow-2xs select-none align-middle relative -top-[1.5px] cursor-default';

  const img = document.createElement('img');
  img.src = subject.url;
  img.alt = '';
  img.className =
    'w-3.5 h-3.5 rounded-xs object-cover border border-slate-300/80 bg-white inline-block flex-shrink-0';
  pill.appendChild(img);

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
      if (el.hasAttribute('data-mention-name')) {
        text += `@${el.getAttribute('data-mention-name')}`;
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
  const regex = /(@(?:insp_\d+|图片\d+|主体\d*|模特\d*|[a-zA-Z0-9_\u4e00-\u9fa5.-]+)|\{\{\s*(?:Mixed|Image|图)?\s*\d+\s*\}\})/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(str.slice(lastIndex, match.index)));
    }
    const sub = getSubjectByTag(match[0]);
    container.appendChild(sub ? createMentionNode(sub) : document.createTextNode(match[0]));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < str.length) {
    container.appendChild(document.createTextNode(str.slice(lastIndex)));
  }
}
