import { createContext, useContext, useCallback, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignLeft, AudioLines, Bold, Box, Check, ChevronRight, Copy, FileText, GitCompare,
  Italic, List, ListOrdered, Maximize2, Minimize2, Minus,
  Palette, Pilcrow, Table2, Upload, Video, WandSparkles,
} from 'lucide-react';
import type { CanvasNode, CanvasPortType, CanvasQuickNodeType } from '../../model/types';
import './canvasRichText.css';

export type { CanvasQuickNodeType } from '../../model/types';

export const CanvasPromptPanContext = createContext<(x: number, y: number) => void>(() => {});

/** Keep the editor below its node and make room at the bottom of the viewport. */
export function CanvasDrawingEditor({ anchor, panelRef, preferredWidth = 720, ...props }: HTMLAttributes<HTMLDivElement> & {
  anchor: RefObject<HTMLDivElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
  preferredWidth?: number;
}) {
  const panCanvas = useContext(CanvasPromptPanContext);
  const internalPanel = useRef<HTMLDivElement>(null);
  const panel = panelRef ?? internalPanel;
  const [placement, setPlacement] = useState<{ center: number; top: number; width: number }>();
  const position = useCallback(() => {
    const root = anchor.current;
    const viewport = root?.closest('[data-testid="canvas-viewport"]')?.getBoundingClientRect();
    const node = (root?.querySelector('[data-testid="drawing-preview"]') ?? root)?.getBoundingClientRect();
    if (!viewport?.width || !viewport.height || !node || !panel.current) {
      setPlacement(undefined);
      return;
    }
    const top = node.bottom + 14;
    const center = node.left + node.width / 2;
    const width = Math.min(preferredWidth, Math.max(1, viewport.width - 32));
    if (root?.closest('[data-node-selected="true"]')) {
      const overflow = top + panel.current.offsetHeight - (viewport.bottom - 16);
      const roomAboveNode = node.top - (viewport.top + 72);
      const distance = Math.min(Math.ceil(overflow), Math.floor(roomAboveNode));
      const minCenter = viewport.left + 16 + width / 2;
      const maxCenter = viewport.right - 16 - width / 2;
      const shiftX = Math.max(minCenter, Math.min(maxCenter, center)) - center;
      if (Math.abs(shiftX) > 0.5 || distance > 0) panCanvas(shiftX, -Math.max(0, distance));
    }
    setPlacement(previous =>
      previous?.center === center && previous.top === top && previous.width === width
        ? previous : { center, top, width },
    );
  }, [anchor, panel, panCanvas, preferredWidth]);
  useLayoutEffect(position);
  useLayoutEffect(() => {
    const root = anchor.current;
    const observer = new ResizeObserver(position);
    for (const element of [panel.current, root?.querySelector('[data-testid="drawing-preview"]') ?? root, root?.closest('[data-testid="canvas-viewport"]')]) {
      if (element) observer.observe(element);
    }
    const world = root?.closest('[data-native-canvas-world]');
    const transformObserver = new MutationObserver(position);
    if (world) transformObserver.observe(world, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', position);
    return () => {
      observer.disconnect();
      transformObserver.disconnect();
      window.removeEventListener('resize', position);
    };
  }, [anchor, panel, position]);
  return createPortal(
    <div {...props} data-canvas-node-editor ref={panel} style={{
      position: 'fixed', zIndex: 45, visibility: placement ? 'visible' : 'hidden',
      width: placement?.width ?? preferredWidth,
      left: placement && placement.center - placement.width / 2,
      top: placement?.top,
    }} />,
    document.body,
  );
}

/** Persist only editor formatting; never restore executable or externally loaded markup. */
function cleanTextHtml(html: string) {
  const source = new DOMParser().parseFromString(html, 'text/html');
  const output = document.createElement('div');
  const allowed = new Set(['P', 'DIV', 'BR', 'H1', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'HR', 'SPAN', 'FONT']);
  const copy = (node: Node, parent: HTMLElement) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.textContent || '')); return; }
    if (!(node instanceof HTMLElement) || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) return;
    const target = allowed.has(node.tagName) ? document.createElement(node.tagName === 'FONT' ? 'span' : node.tagName.toLowerCase()) : parent;
    if (target !== parent) {
      const color = node.style.color || node.getAttribute('color');
      if (color && CSS.supports('color', color)) target.style.color = color;
      if (node.style.fontWeight === 'bold' || Number(node.style.fontWeight) >= 600) target.style.fontWeight = 'bold';
      if (node.style.fontStyle === 'italic') target.style.fontStyle = 'italic';
      parent.append(target);
    }
    node.childNodes.forEach(child => copy(child, target));
  };
  source.body.childNodes.forEach(child => copy(child, output));
  return output.innerHTML;
}

function plainTextHtml(text: string) {
  const root = document.createElement('div');
  for (const line of text.split('\n')) {
    const p = document.createElement('p');
    p.textContent = line;
    if (!line) p.append(document.createElement('br'));
    root.append(p);
  }
  return root.innerHTML;
}

const TEXT_BG_OPTIONS = [
  { value: '', swatch: '#202022', label: '默认' },
  { value: '#372626', swatch: '#964243', label: '深红' },
  { value: '#33281D', swatch: '#834915', label: '棕色' },
  { value: '#363323', swatch: '#8F8030', label: '橄榄' },
  { value: '#253027', swatch: '#3D7344', label: '绿色' },
  { value: '#233033', swatch: '#337282', label: '青色' },
  { value: '#222933', swatch: '#2B5284', label: '蓝色' },
  { value: '#312434', swatch: '#763886', label: '紫色' },
] as const;

const TEXT_PIN_OPTIONS = [
  { color: '#F0606B', label: '红色' },
  { color: '#F4A14B', label: '橙色' },
  { color: '#EDC63D', label: '黄色' },
  { color: '#4FC978', label: '绿色' },
  { color: '#4EA8FF', label: '蓝色' },
  { color: '#A55CF0', label: '紫色' },
] as const;

function HeadingIcon({ level }: { level: 1 | 2 | 3 }) {
  const numPath =
    level === 1
      ? 'M19 18v-8l-2 2'
      : level === 2
        ? 'M17 12a2 2 0 1 1 4 0c0 .591 -.417 1.318 -.816 1.858l-3.184 4.143l4 0'
        : 'M19 14a2 2 0 1 0 -2 -2M17 16a2 2 0 1 0 2 -2';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={numPath} />
      <path d="M4 6v12M12 6v12M11 18h2M3 18h2M4 12h8M3 6h2M11 6h2" />
    </svg>
  );
}

function PinTagIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2.4 8.85 8.85 2.4A1.6 1.6 0 0 1 10 2h3.2A.8.8 0 0 1 14 2.8V6a1.6 1.6 0 0 1-.4 1.15L7.15 13.6a1.2 1.2 0 0 1-1.7 0L2.4 10.55a1.2 1.2 0 0 1 0-1.7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="11.15" cy="4.85" r="0.85" fill="currentColor" />
    </svg>
  );
}

export function CanvasRichTextEditor({node, selected, busy, onChange, onMessage, referenceStyle = false}: {
  node: CanvasNode; referenceStyle?: boolean; selected: boolean; busy: boolean; onChange: (patch: Partial<CanvasNode>) => void; onMessage: (message: string) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const [editing, setEditing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [popover, setPopover] = useState<'bg' | 'pin' | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({ p: true });
  const lastHtml = useRef('');
  const renderedEditor = useRef<HTMLDivElement | null>(null);
  const locked = Boolean(node.layerLocked || busy);
  const syncActiveState = useCallback(() => {
    const root = editor.current;
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode)) {
      setActive({ p: true });
      return;
    }
    const anchorEl = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode?.parentElement;
    const inRoot = (selector: string) => {
      const found = anchorEl?.closest(selector);
      return Boolean(found && root.contains(found));
    };
    const blockCmd = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
    const isH1 = inRoot('h1') || blockCmd === 'h1';
    const isH2 = inRoot('h2') || blockCmd === 'h2';
    const isH3 = inRoot('h3') || blockCmd === 'h3';
    const isUl = inRoot('ul') || document.queryCommandState('insertUnorderedList');
    const isOl = inRoot('ol') || document.queryCommandState('insertOrderedList');
    setActive({
      h1: isH1,
      h2: isH2,
      h3: isH3,
      p: !isH1 && !isH2 && !isH3,
      bold: inRoot('strong, b') || document.queryCommandState('bold'),
      italic: inRoot('em, i') || document.queryCommandState('italic'),
      insertUnorderedList: isUl,
      insertOrderedList: isOl,
    });
  }, []);
  const save = () => {
    if (!editor.current) return;
    const html = cleanTextHtml(editor.current.innerHTML);
    lastHtml.current = html;
    onChange({ textHtml: html, content: editor.current.innerText.replace(/\n{3,}/g, '\n\n') });
    syncActiveState();
  };
  useLayoutEffect(() => {
    const html = node.textHtml ? cleanTextHtml(node.textHtml) : plainTextHtml(node.content || '');
    if (editor.current && (editor.current !== renderedEditor.current || html !== lastHtml.current)) {
      renderedEditor.current = editor.current;
      editor.current.innerHTML = html;
      lastHtml.current = html;
      range.current = null;
    }
  }, [node.textHtml, node.content, fullscreen]);
  useEffect(() => {
    const remember = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !editor.current?.contains(selection.anchorNode) || !editor.current.contains(selection.focusNode)) return;
      range.current = selection.getRangeAt(0).cloneRange();
      syncActiveState();
    };
    document.addEventListener('selectionchange', remember);
    return () => document.removeEventListener('selectionchange', remember);
  }, [syncActiveState]);
  useEffect(() => {
    if (!selected || locked) {
      setEditing(false);
      setPopover(null);
    }
  }, [selected, locked]);
  useEffect(() => {
    if (!popover) return;
    const onOutside = (e: PointerEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) setPopover(null);
    };
    document.addEventListener('pointerdown', onOutside, true);
    return () => document.removeEventListener('pointerdown', onOutside, true);
  }, [popover]);
  useEffect(() => {
    if (!selected || editing || fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c')) return;
      if (window.getSelection()?.toString().trim()) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const text = (editor.current?.innerText || node.content || '').trim();
      if (!text) return;
      e.preventDefault();
      navigator.clipboard?.writeText(text).then(() => onMessage('已复制文本'), () => undefined);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [selected, editing, fullscreen, node.content, onMessage]);
  const focusEditorAtEnd = (root: HTMLDivElement) => {
    root.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.selectNodeContents(root);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    range.current = r.cloneRange();
  };
  const command = (name: string, value?: string) => {
    const root = editor.current;
    if (!root || locked) return;
    setEditing(true);
    const saved = range.current?.cloneRange();
    root.contentEditable = 'true';
    root.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (saved && root.contains(saved.commonAncestorContainer)) {
      selection?.removeAllRanges();
      selection?.addRange(saved);
    } else {
      focusEditorAtEnd(root);
    }
    if (name === 'insertHorizontalRule') {
      if (selection?.rangeCount) {
        const cur = selection.getRangeAt(0);
        if (root.contains(cur.startContainer)) {
          cur.collapse(false);
          selection.removeAllRanges();
          selection.addRange(cur);
        }
      }
      const inserted = document.execCommand('insertHTML', false, '<hr><p><br></p>');
      if (!inserted || !root.querySelector('hr')) {
        const hr = document.createElement('hr');
        const p = document.createElement('p');
        p.append(document.createElement('br'));
        root.append(hr, p);
        const r = document.createRange();
        r.setStart(p, 0);
        r.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(r);
      }
    } else if (name === 'formatBlock') {
      const nextTag = (value && value !== 'p' && active[value] ? 'p' : (value || 'p')).toLowerCase();
      document.execCommand('formatBlock', false, nextTag);
      const anchorNode = selection?.anchorNode;
      const anchorEl = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement;
      const inTarget = anchorEl?.closest(nextTag);
      if (!inTarget || !root.contains(inTarget)) {
        const block = anchorEl?.closest('p, h1, h2, h3, div');
        const nextEl = document.createElement(nextTag);
        if (block && block !== root && root.contains(block)) {
          while (block.firstChild) nextEl.append(block.firstChild);
          if (!nextEl.firstChild) nextEl.append(document.createElement('br'));
          block.replaceWith(nextEl);
        } else {
          nextEl.append(document.createElement('br'));
          root.replaceChildren(nextEl);
        }
        const r = document.createRange();
        r.selectNodeContents(nextEl);
        r.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(r);
      }
    } else {
      document.execCommand(name, false, value);
    }
    save();
    if (selection?.rangeCount) range.current = selection.getRangeAt(0).cloneRange();
  };
  const blockActions = [
    { label: '标题 1', icon: <HeadingIcon level={1} />, command: 'formatBlock', value: 'h1' },
    { label: '标题 2', icon: <HeadingIcon level={2} />, command: 'formatBlock', value: 'h2' },
    { label: '标题 3', icon: <HeadingIcon level={3} />, command: 'formatBlock', value: 'h3' },
    { label: '正文', icon: <Pilcrow size={18} />, command: 'formatBlock', value: 'p' },
  ];
  const inlineActions = [
    { label: '粗体', icon: <Bold size={18} />, command: 'bold' },
    { label: '斜体', icon: <Italic size={18} />, command: 'italic' },
    { label: '无序列表', icon: <List size={18} />, command: 'insertUnorderedList' },
    { label: '有序列表', icon: <ListOrdered size={18} />, command: 'insertOrderedList' },
    { label: '分割线', icon: <Minus size={18} />, command: 'insertHorizontalRule' },
  ];
  const activeBgSwatch = TEXT_BG_OPTIONS.find(opt => opt.value === (node.textBackground || ''))?.swatch || node.textBackground || '#ffffff';
  const showFormatTools = !referenceStyle || editing || fullscreen;
  const activePins = node.colorPins || [];
  const activePinNames = activePins.map(color => TEXT_PIN_OPTIONS.find(p => p.color.toLowerCase() === color.toLowerCase())?.label || color);
  const pinTooltip = activePinNames.length > 0 ? `已添加：${activePinNames.join('、')}` : '添加标签';
  const hasRichStructure = Boolean(node.textHtml && /<(hr|ul|ol|h1|h2|h3)\b/i.test(node.textHtml));
  const btnClass = (isActive = false) =>
    `text-node-rich-toolbar-btn h-10 w-10 p-2 inline-flex shrink-0 items-center justify-center rounded-full text-xs cursor-pointer disabled:opacity-40 disabled:pointer-events-none ${
      isActive ? 'text-node-rich-toolbar-btn--active' : ''
    }`;
  const groupClass = 'flex items-center gap-[2px]';
  const dividerEl = <span data-toolbar-divider="" className="w-px h-[18px] mx-2 shrink-0 self-center bg-black/10 dark:bg-white/10" />;
  const handleCopyAll = () => {
    const text = (editor.current?.innerText || node.content || '').replace(/\n{3,}/g, '\n\n').trim();
    navigator.clipboard.writeText(text).then(
      () => onMessage('已复制文本'),
      () => onMessage('复制失败，请选中文字复制'),
    );
  };
  const toolbarEl = (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="文本格式"
      data-canvas-pin-toolbar=""
      data-tapnow-float-toolbar=""
      className={`text-node-rich-toolbar ${
        fullscreen
          ? 'relative'
          : 'canvas-node-toolbar absolute left-1/2 bottom-full mb-9 -translate-x-1/2 z-[120] shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)]'
      } pointer-events-auto inline-flex h-12 items-center gap-1 rounded-full border border-zinc-200 dark:border-white/10 bg-[#f6f6f6] dark:bg-[#262626]/80 p-1 whitespace-nowrap select-none`}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {referenceStyle ? (
        <div className={`${groupClass} relative`}>
          <button
            type="button"
            aria-label="背景颜色"
            data-tip="背景颜色"
            data-popover-open={popover === 'bg' ? 'true' : undefined}
            disabled={locked}
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
            onClick={() => setPopover(current => current === 'bg' ? null : 'bg')}
            className={btnClass(popover === 'bg')}
          >
            <span
              className="h-5 w-5 rounded-full border border-zinc-300 dark:border-white/30"
              style={{ backgroundColor: node.textBackground ? activeBgSwatch : '#ffffff' }}
            />
          </button>
          {popover === 'bg' && (
            <div
              role="menu"
              aria-label="背景颜色选项"
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
              className="text-node-color-palette absolute left-1/2 top-full z-[140] mt-2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1e] px-2.5 py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
            >
              {TEXT_BG_OPTIONS.map(option => {
                const isSelected = (node.textBackground || '') === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    data-tip={option.label}
                    aria-label={`背景色 ${option.label}`}
                    onMouseDown={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChange({ textBackground: option.value || undefined });
                      setPopover(null);
                    }}
                    className={`relative flex h-6 w-6 items-center justify-center rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                      isSelected ? 'scale-110 border-white ring-2 ring-white/80' : 'border-black/15 dark:border-white/20'
                    }`}
                    style={{ backgroundColor: option.value ? option.swatch : '#f4f4f5' }}
                  >
                    {option.value === '' && <span className="pointer-events-none h-[1.5px] w-4 rotate-45 rounded-full bg-black/45 dark:bg-white/60" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <input type="color" aria-label="文字颜色" defaultValue={node.textColor || '#334155'} disabled={locked} onInput={e=>command('foreColor',e.currentTarget.value)} onChange={e=>command('foreColor',e.currentTarget.value)} className="h-6 w-6 cursor-pointer overflow-hidden rounded-full border-0 bg-transparent"/>
      )}
      {showFormatTools && (
        <>
          {dividerEl}
          <div className={groupClass}>
            {blockActions.map(action => {
              const isAct = !!active[action.value || action.command];
              return (
                <button
                  type="button"
                  key={action.label}
                  aria-label={action.label}
                  data-tip={action.label}
                  aria-pressed={isAct}
                  disabled={locked}
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); command(action.command, action.value); }}
                  className={btnClass(isAct)}
                >
                  {action.icon}
                </button>
              );
            })}
          </div>
          {dividerEl}
          <div className={groupClass}>
            {inlineActions.map(action => {
              const isAct = action.command === 'insertHorizontalRule' ? false : !!active[action.command];
              return (
                <button
                  type="button"
                  key={action.label}
                  aria-label={action.label}
                  data-tip={action.label}
                  aria-pressed={action.command === 'insertHorizontalRule' ? undefined : isAct}
                  disabled={locked}
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); command(action.command); }}
                  className={btnClass(isAct)}
                >
                  {action.icon}
                </button>
              );
            })}
          </div>
        </>
      )}
      {dividerEl}
      <div className={groupClass}>
        {referenceStyle && (
          <div className="relative flex items-center" data-canvas-pin-ui="root">
            <button
              type="button"
              aria-label="添加标签"
              data-tip={pinTooltip}
              data-popover-open={popover === 'pin' ? 'true' : undefined}
              disabled={locked}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
              onClick={() => setPopover(current => current === 'pin' ? null : 'pin')}
              className={btnClass(popover === 'pin')}
            >
              <PinTagIcon />
              {activePins.length > 0 && (
                <span
                  className="absolute right-1.5 bottom-1.5 h-2 w-2 rounded-full border border-black/20 dark:border-white/40"
                  style={{ backgroundColor: activePins[0] }}
                />
              )}
            </button>
            {popover === 'pin' && (
              <div
                role="toolbar"
                aria-label="标签选择"
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                className="absolute left-1/2 top-full z-[140] mt-2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1e] px-2.5 py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
              >
                <button
                  type="button"
                  data-tip="全部清空"
                  aria-label="全部清空"
                  disabled={activePins.length === 0}
                  onClick={() => onChange({ colorPins: [] })}
                  className="relative flex h-6 w-6 items-center justify-center rounded-full border border-zinc-300 dark:border-white/20 text-zinc-500 dark:text-zinc-300 hover:scale-110 transition-transform disabled:opacity-35 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3.2 8.7 8.7 3.2A1.2 1.2 0 0 1 9.55 2.85H12.2A.8.8 0 0 1 13 3.65v2.65a1.2 1.2 0 0 1-.35.85L7.3 12.8a1 1 0 0 1-1.4 0L3.2 10.1a1 1 0 0 1 0-1.4Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
                    <path d="m4.15 4.15 7.7 7.7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                  </svg>
                </button>
                {TEXT_PIN_OPTIONS.map(({ color, label }) => {
                  const pinned = activePins.some(item => item.toLowerCase() === color.toLowerCase());
                  return (
                    <button
                      key={color}
                      type="button"
                      data-tip={pinned ? `移除“${label}”` : `添加“${label}”`}
                      aria-label={pinned ? `移除“${label}”` : `添加“${label}”`}
                      aria-pressed={pinned}
                      onClick={() => {
                        const next = pinned
                          ? activePins.filter(item => item.toLowerCase() !== color.toLowerCase())
                          : [...activePins, color];
                        onChange({ colorPins: next });
                      }}
                      className={`flex h-6 w-6 items-center justify-center rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                        pinned ? 'scale-110 ring-2 ring-white/80 border-white' : 'border-black/15 dark:border-white/25'
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {pinned && <Check size={12} className="text-white drop-shadow" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <button type="button" aria-label="复制全部" data-tip="复制全部" className={btnClass(false)} onClick={handleCopyAll}><Copy size={18}/></button>
        {referenceStyle ? <>
          <button type="button" aria-label={fullscreen?'退出全屏':'全屏'} data-tip={fullscreen?'退出全屏':'全屏'}
            onMouseDown={e => {
              e.preventDefault();
              e.stopPropagation();
              const next = !fullscreen;
              setFullscreen(next);
              setEditing(true);
              requestAnimationFrame(() => { if (editor.current) focusEditorAtEnd(editor.current); });
            }}
            className={btnClass(false)}>{fullscreen?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>
        </> : <button type="button" aria-label="切换文本大小" data-tip="切换大小" disabled={locked} onClick={()=>onChange(node.width>400?{width:300,height:280}:{width:520,height:400})} className={btnClass(false)}><Maximize2 size={18}/></button>}
      </div>
    </div>
  );
  if (!fullscreen) {
    return <>
      {selected && toolbarEl}
      <div
        data-testid="drawing-preview"
        onDoubleClick={() => {
          if (!locked) {
            setEditing(true);
            requestAnimationFrame(() => {
              if (editor.current) {
                focusEditorAtEnd(editor.current);
                syncActiveState();
              }
            });
          }
        }}
        className={`relative overflow-hidden rounded-[18px] border ${selected ? 'border-zinc-400 dark:border-white/45' : 'border-zinc-200 dark:border-white/[.08]'} bg-white px-4 py-3.5 text-zinc-800 dark:bg-[#1f1f1f] dark:text-zinc-100`}
        style={{height:node.height,color:node.textColor,backgroundColor:referenceStyle && node.textBackground ? node.textBackground : undefined}}
      >
        {(node.colorPins?.length ?? 0) > 0 && (
          <div className="pointer-events-none absolute right-2.5 top-2.5 z-10 flex items-center gap-1">
            {node.colorPins!.map(pin => (
              <span key={pin} className="h-2.5 w-2.5 rounded-full border border-white/40 shadow-sm" style={{ backgroundColor: pin }} />
            ))}
          </div>
        )}
        {!node.content?.trim() && !hasRichStructure && !editing && <span className="pointer-events-none absolute text-sm text-slate-400 dark:text-zinc-500">双击开始编辑...</span>}
        <div ref={editor} role="textbox" aria-label="文本内容" aria-multiline="true" aria-readonly={!editing || locked} contentEditable={editing && !locked} suppressContentEditableWarning className="canvas-rich-text h-full overflow-auto break-words text-sm leading-6 outline-none" onInput={save} onMouseDown={e=>{if(editing)e.stopPropagation();}} onKeyDown={e=>{if(editing)e.stopPropagation();if(e.key==='Escape'){setEditing(false);editor.current?.blur();}}} onWheel={e=>e.stopPropagation()} onPaste={e=>{if(!editing || locked)return;e.preventDefault();command('insertText',e.clipboardData.getData('text/plain'));}} onDrop={e=>e.preventDefault()} />
      </div>
    </>;
  }
  return <>
    <div data-testid="drawing-preview" style={{height:node.height,visibility:'hidden'}} />
    {createPortal(
      <div role="dialog" aria-modal="true" aria-label="全屏文本编辑" data-text-node-fullscreen-overlay="true"
        className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 p-8"
        onMouseDown={event => { event.stopPropagation(); if (event.button === 0 && event.target === event.currentTarget) setFullscreen(false); }}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setFullscreen(false); }}>
        <div data-text-node-fullscreen-ui="true"
          className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
          style={{ width: 'min(1024px, calc(100vw - 64px))', height: 'min(900px, calc(100vh - 64px))', backgroundColor: referenceStyle && node.textBackground ? node.textBackground : undefined }}
          onMouseDown={event => event.stopPropagation()}>
          <div className="flex flex-wrap items-center justify-end gap-2 border-b border-zinc-200 px-3 py-2 dark:border-white/10">
            {toolbarEl}
          </div>
          <div data-scrollable="true" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" style={{ overscrollBehavior: 'contain' }}
            onClick={() => { if (!locked) { setEditing(true); editor.current?.focus(); } }}>
            <div ref={editor} role="textbox" aria-label="全屏文本正文" aria-multiline="true" aria-readonly={locked} contentEditable={!locked} suppressContentEditableWarning
              className="canvas-rich-text mx-auto min-h-full w-full max-w-[800px] bg-transparent p-6 outline-none" style={{ color: node.textColor }}
              onInput={save} onMouseDown={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setFullscreen(false); }}
              onWheel={e => e.stopPropagation()} onPaste={e => { if (locked) return; e.preventDefault(); command('insertText', e.clipboardData.getData('text/plain')); }} onDrop={e => e.preventDefault()} />
          </div>
        </div>
      </div>,
      document.body,
    )}
  </>;
}

interface Entry {
  id: string;
  label: string;
  Icon: typeof Video;
  type: CanvasQuickNodeType;
  description?: string;
  accepts?: readonly CanvasPortType[];
}

const visual = ['image', 'any'] as const;
const context = ['prompt', 'image', 'video', 'audio', 'any'] as const;
const upload: Entry = { id: 'input-image', type: 'file', label: '上传', Icon: Upload, description: '支持图片、视频和音频' };
const textEntry: Entry = { id: 'text-node', type: 'prompt', label: '文本', Icon: AlignLeft, description: '编写脚本、文案与提示词', accepts: context };
const scriptParseEntry: Entry = { id: 'script-parse', type: 'script-parse', label: '脚本解析', Icon: FileText, description: '把剧本拆成镜头、资产与双轨提示词', accepts: context };
const tableEditorEntry: Entry = { id: 'table-editor-node', type: 'table-editor-node', label: '表格编辑', Icon: Table2, description: '用表格整理结构化内容', accepts: context };
const imageGenEntry: Entry = { id: 'gen-image', type: 'image-generation', label: '绘画', Icon: Palette, description: '使用模型生成或编辑图片', accepts: context };
const videoGenEntry: Entry = { id: 'gen-video', type: 'video-generation', label: '视频', Icon: Video, description: '使用模型生成动态画面', accepts: context };
const threeDEntry: Entry = { id: 'gen-3d', type: 'gen-3d', label: '3D', Icon: Box, description: '生成 3D 物体或世界，并全屏预览', accepts: context };
const audioEntry: Entry = { id: 'gen-music', type: 'audio', label: '音频', Icon: AudioLines, description: '生成语音、音乐与音效', accepts: context };
const promptSkillEntry: Entry = { id: 'video-prompt-optimizer', type: 'video-prompt-optimizer', label: '视频提示词优化', Icon: WandSparkles, description: '调用大模型与专属 Skill 优化提示词并对比前后差异', accepts: context };
const coverPromptEntry: Entry = { id: 'cover-prompt-writer', type: 'cover-prompt-writer', label: '封面提示词撰写', Icon: WandSparkles, description: '根据手机商品图撰写封面标题与绘图提示词', accepts: ['prompt', ...visual] };
const compareEntry: Entry = { id: 'image-compare', type: 'compare', label: '对比', Icon: GitCompare, description: '用分割滑杆对照两张图片的差异', accepts: visual };

const textConnectionEntries: Entry[] = [
  textEntry,
  promptSkillEntry,
  scriptParseEntry,
  tableEditorEntry,
  imageGenEntry,
  videoGenEntry,
  threeDEntry,
  audioEntry,
];
const imageConnectionEntries: Entry[] = [
  textEntry,
  promptSkillEntry,
  imageGenEntry,
  videoGenEntry,
  audioEntry,
  compareEntry,
];
const promptSkillConnectionEntries: Entry[] = [videoGenEntry, imageGenEntry, textEntry, audioEntry];
const scriptParseConnectionEntries: Entry[] = [textEntry, promptSkillEntry, imageGenEntry, videoGenEntry];
const tableConnectionEntries: Entry[] = [textEntry, promptSkillEntry, scriptParseEntry, imageGenEntry, videoGenEntry];
const common: Entry[] = [upload, textEntry, promptSkillEntry, imageGenEntry, videoGenEntry, threeDEntry, audioEntry, compareEntry];

function resolveMenuEntries(sourcePortType?: CanvasPortType, sourceNode?: CanvasNode): Entry[] {
  if (!sourcePortType) return common;
  if (sourceNode?.studioSubType === 'video-prompt-optimizer') return promptSkillConnectionEntries;
  if (sourceNode?.studioSubType === 'script-parse') return scriptParseConnectionEntries;
  if (sourceNode?.studioSubType === 'table-editor-node') return tableConnectionEntries;
  if (sourcePortType === 'prompt' || sourceNode?.type === 'prompt' || sourceNode?.type === 'note') {
    return textConnectionEntries;
  }
  return imageConnectionEntries;
}

interface CanvasNodeMenuProps {
  x: number;
  y: number;
  onSelect: (type: CanvasQuickNodeType) => void;
  onClose: () => void;
  sourcePortType?: CanvasPortType;
  sourceNodeTitle?: string;
  sourceNode?: CanvasNode;
  direction?: 'output' | 'input';
}

export function CanvasNodeMenu({ x, y, onSelect, onClose, sourcePortType, sourceNode }: CanvasNodeMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    menu.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      previous?.focus({ preventScroll: true });
    };
  }, [onClose]);

  const [skillPosition, setSkillPosition] = useState<{ left: number; top: number }>();
  const openSkills = (button: HTMLButtonElement) => {
    const row = button.getBoundingClientRect();
    const panel = menu.current?.getBoundingClientRect() ?? row;
    const right = panel.right - 8;
    setSkillPosition({
      left: right + 216 <= window.innerWidth ? right : Math.max(8, panel.left - 208),
      top: Math.max(8, Math.min(row.top, window.innerHeight - 112)),
    });
  };
  const entries = resolveMenuEntries(sourcePortType, sourceNode);
  const entryButton = 'group flex min-h-[46px] w-full items-center gap-3 rounded-[12px] px-2.5 py-1.5 text-left text-[13px] font-semibold text-zinc-800 transition-colors hover:bg-black/[0.05] focus-visible:bg-black/[0.05] focus-visible:outline-none dark:text-[#f4f4f5] dark:hover:bg-white/[0.08] dark:focus-visible:bg-white/[0.08] disabled:opacity-50';

  return createPortal(
    <div ref={menu} tabIndex={-1} role="dialog" aria-label="添加节点"
      data-command-menu={!sourcePortType ? 'true' : undefined}
      data-connection-drop-menu={sourcePortType ? 'true' : undefined}
      data-testid="canvas-context-command-menu"
      onMouseDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onWheelCapture={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
          if (!buttons.length) return;
          event.preventDefault();
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) :
            (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}
      className="canvas-node-menu fixed z-[200] w-[232px] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-[16px] border border-black/10 bg-white p-1.5 text-zinc-800 shadow-[0_20px_50px_rgba(0,0,0,0.45)] outline-none dark:border-white/[0.08] dark:bg-[#1b1b1e] dark:text-[#f4f4f5] dark:shadow-[0_24px_60px_rgba(0,0,0,0.72)]"
      style={{ left: Math.max(8, Math.min(x, window.innerWidth - 244)), top: Math.max(8, Math.min(y, window.innerHeight - 460)), maxHeight: 'min(560px, calc(100dvh - 16px))' }}>
      <div role="menu" aria-label="节点类型" className="space-y-0.5">
        {entries.map(({ id, type, label, description, Icon }) => id === promptSkillEntry.id ? (
          <button key={id} role="menuitem" type="button" className={entryButton}
            aria-haspopup="menu" aria-expanded={Boolean(skillPosition)}
            onMouseEnter={event => openSkills(event.currentTarget)} onClick={event => openSkills(event.currentTarget)}>
            <span className="grid size-8 shrink-0 place-items-center"><Icon size={16} /></span>
            <span className="flex-1">提示词 Skill</span><ChevronRight size={14} />
          </button>
        ) : (
          <button key={id} role="menuitem" type="button" title={description || label}
            data-testid={`canvas-context-menu-item-${type}`} className={entryButton} onMouseEnter={() => setSkillPosition(undefined)} onClick={() => onSelect(type)}>
            <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-black/[0.05] text-zinc-700 transition-colors group-hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-zinc-200 dark:group-hover:bg-white/[0.1]"><Icon size={16} strokeWidth={1.75} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate leading-tight">{label}</span>
              {description && <span className="mt-0.5 hidden truncate text-[11px] font-normal leading-tight text-zinc-500 group-hover:block group-focus-visible:block dark:text-zinc-400">{description}</span>}
            </span>
          </button>
        ))}
      </div>
      {skillPosition && (
        <div role="menu" aria-label="提示词 Skill" style={skillPosition}
          className="fixed w-[216px] rounded-[14px] border border-black/10 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#202022]">
          {[promptSkillEntry, coverPromptEntry].filter(entry => !sourcePortType || entry.accepts?.includes(sourcePortType)).map(({ id, type, label, description, Icon }) => (
            <button key={id} role="menuitem" type="button" title={description}
              data-testid={`canvas-context-menu-item-${type}`} className={entryButton} onClick={() => onSelect(type)}>
              <Icon size={16} />{label}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
