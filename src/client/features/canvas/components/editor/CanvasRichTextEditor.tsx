import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bold, Copy, Italic, List, ListOrdered, Minus, Maximize2, Pilcrow } from 'lucide-react';
import type { CanvasNode } from '../../model/types';
import { cleanTextHtml, plainTextHtml } from './canvasRichText';
import './canvasRichText.css';

export function CanvasRichTextEditor({node, selected, busy, onChange, onMessage}: {
  node: CanvasNode; selected: boolean; busy: boolean; onChange: (patch: Partial<CanvasNode>) => void; onMessage: (message: string) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const lastHtml = useRef('');
  const locked = Boolean(node.layerLocked || busy);
  const save = () => {
    if (!editor.current) return;
    const html = cleanTextHtml(editor.current.innerHTML);
    lastHtml.current = html;
    onChange({ textHtml: html, content: editor.current.innerText.replace(/\n{3,}/g, '\n\n') });
  };
  useLayoutEffect(() => {
    const html = node.textHtml ? cleanTextHtml(node.textHtml) : plainTextHtml(node.content || '');
    if (editor.current && html !== lastHtml.current) {
      editor.current.innerHTML = html;
      lastHtml.current = html;
      range.current = null;
    }
  }, [node.textHtml, node.content]);
  useEffect(() => {
    const remember = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !editor.current?.contains(selection.anchorNode) || !editor.current.contains(selection.focusNode)) return;
      range.current = selection.getRangeAt(0).cloneRange();
      const block = document.queryCommandValue('formatBlock').toLowerCase();
      setActive({ bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), insertUnorderedList: document.queryCommandState('insertUnorderedList'), insertOrderedList: document.queryCommandState('insertOrderedList'), p: block === 'p' || block === 'div', h1: block === 'h1', h2: block === 'h2', h3: block === 'h3' });
    };
    document.addEventListener('selectionchange', remember);
    return () => document.removeEventListener('selectionchange', remember);
  }, []);
  useEffect(() => { if (!selected || locked) setEditing(false); }, [selected, locked]);
  const command = (name: string, value?: string) => {
    const root = editor.current;
    if (!root || locked) return;
    setEditing(true);
    // Enable synchronously so the browser command applies on the first toolbar click.
    const saved = range.current?.cloneRange();
    root.contentEditable = 'true'; root.focus();
    const selection = window.getSelection();
    const target = saved && root.contains(saved.commonAncestorContainer) ? saved : document.createRange();
    if (target !== saved) target.selectNodeContents(root);
    selection?.removeAllRanges(); selection?.addRange(target);
    document.execCommand(name, false, value);
    save();
    if (selection?.rangeCount) range.current = selection.getRangeAt(0).cloneRange();
  };
  const actions = [
    {label:'正文段落', icon:<Pilcrow size={14}/>, command:'formatBlock', value:'p'},
    ...['h1','h2','h3'].map((value,index)=>({label:['一级标题','二级标题','三级标题'][index],icon:value.toUpperCase(),command:'formatBlock',value})),
    {label:'粗体',icon:<Bold size={14}/>,command:'bold'}, {label:'斜体',icon:<Italic size={14}/>,command:'italic'},
    {label:'无序列表',icon:<List size={14}/>,command:'insertUnorderedList'}, {label:'有序列表',icon:<ListOrdered size={14}/>,command:'insertOrderedList'},
    {label:'分隔线',icon:<Minus size={14}/>,command:'insertHorizontalRule'},
  ];
  return <>
    {selected && <div role="toolbar" aria-label="文本格式" className="absolute -top-20 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1B1B1E] px-2 py-1.5 shadow-sm dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] text-slate-700 dark:text-[#C7C7CC]" onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
      <input type="color" aria-label="文字颜色" title="选中文字后设置颜色" defaultValue={node.textColor || '#334155'} disabled={locked} onInput={e=>command('foreColor',e.currentTarget.value)} onChange={e=>command('foreColor',e.currentTarget.value)} className="h-6 w-6 cursor-pointer overflow-hidden rounded-full border-0 bg-transparent"/>
      {actions.map(action=><button type="button" key={action.label} aria-label={action.label} title={action.label} aria-pressed={action.command==='insertHorizontalRule'?undefined:!!active[action.value || action.command]} disabled={locked} onMouseDown={e=>e.preventDefault()} onClick={()=>command(action.command,action.value)} className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 transition-colors ${active[action.value || action.command] ? 'bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{action.icon}</button>)}
      <button type="button" aria-label="复制文本" title="复制文本" className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors" onClick={()=>{navigator.clipboard.writeText(editor.current?.innerText || '').then(()=>onMessage('已复制文本'),()=>onMessage('复制失败，请选中文字复制'));}}><Copy size={14}/></button>
      <button type="button" aria-label="切换文本大小" title="展开 / 收起" disabled={locked} onClick={()=>onChange(node.width>400?{width:300,height:280}:{width:520,height:400})} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"><Maximize2 size={14}/></button>
    </div>}
    <div data-testid="drawing-preview" onDoubleClick={()=>{if(!locked){setEditing(true);requestAnimationFrame(()=>editor.current?.focus());}}} className="relative overflow-hidden rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-[#1B1B1E] p-4 shadow-sm dark:shadow-none text-slate-800 dark:text-slate-200" style={{height:node.height,color:node.textColor || '#334155'}}>
      {!node.content?.trim() && !editing && <span className="pointer-events-none absolute text-sm text-slate-400 dark:text-slate-500">双击开始编辑…</span>}
      <div ref={editor} role="textbox" aria-label="文本内容" aria-multiline="true" aria-readonly={!editing || locked} contentEditable={editing && !locked} suppressContentEditableWarning className="canvas-rich-text h-full overflow-auto break-words text-sm leading-7 outline-none" onInput={save} onMouseDown={e=>{if(editing)e.stopPropagation();}} onKeyDown={e=>{if(editing)e.stopPropagation();if(e.key==='Escape'){setEditing(false);editor.current?.blur();}}} onWheel={e=>e.stopPropagation()} onPaste={e=>{e.preventDefault();command('insertText',e.clipboardData.getData('text/plain'));}} onDrop={e=>e.preventDefault()} />
    </div>
  </>;
}
