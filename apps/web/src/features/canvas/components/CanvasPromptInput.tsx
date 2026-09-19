import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react';
import { RichPromptInput, type RichPromptInputRef } from '@/shared/prompt-bar/RichPromptInput';
import { proxyMediaUrl } from '@/shared/api/apiClient';

export interface CanvasPromptInputRef { insertReference: (index: number) => void }
export const CanvasPromptInput = forwardRef<CanvasPromptInputRef, {value: string; references: string[]; onChange: (value: string) => void; onSubmit: () => void}>(function CanvasPromptInput({value, references, onChange, onSubmit}: {
  value: string; references: string[]; onChange: (value: string) => void; onSubmit: () => void;
}, ref) {
  const input = useRef<RichPromptInputRef>(null);
  const root = useRef<HTMLDivElement>(null);
  const [menuTop, setMenuTop] = useState(28);
  const listId = useId();
  const [mention, setMention] = useState<{query: string} | null>(null);
  const [active, setActive] = useState(0);
  const choices = references.map((url, index) => ({url, name: `图片${index + 1}`}))
    .filter(item => item.name.includes(mention?.query || ''));
  const insert = (name: string) => {
    const index = references.findIndex((_, index) => `图片${index + 1}` === name);
    if (index < 0) return;
    input.current?.insertMention({id: `canvas-ref-${index}`, name, url: references[index]});
    setMention(null);
  };
  useImperativeHandle(ref, () => ({insertReference: (index: number) => insert(`图片${index + 1}`)}));
  return <div ref={root} className="relative mt-5 mb-4 min-h-32" onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget)) setMention(null);}}>
    <RichPromptInput ariaLabel="绘图提示词" ref={input} value={value} onChange={onChange} allSubjects={[]} quickRefImages={references}
      placeholder="输入提示词，@ 引用参考图片…" variant="composer"
      onTriggerAtMenu={(_, query = '') => {
        const container = root.current;
        const selection = window.getSelection();
        if (container && selection?.rangeCount && container.contains(selection.anchorNode)) {
          const rect = container.getBoundingClientRect();
          const caret = selection.getRangeAt(0).getBoundingClientRect?.();
          const scale = container.offsetHeight ? rect.height / container.offsetHeight : 1;
          setMenuTop(caret && caret.height && scale > 0 ? (caret.bottom - rect.top) / scale + 8 : 28);
        }
        setMention({query}); setActive(0);
      }} onCloseAtMenu={() => setMention(null)}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (mention) {
          if (event.key === 'Escape') {event.preventDefault(); setMention(null); return;}
          if (choices.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault(); setActive(current => (current + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length); return;
          }
          if (choices.length && ['Enter', 'Tab'].includes(event.key)) {event.preventDefault(); insert(choices[Math.min(active, choices.length - 1)].name); return;}
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {event.preventDefault(); onSubmit();}
      }} />
    {mention && <div id={listId} role="listbox" aria-label="引用参考图片" style={{top: menuTop}} className="absolute left-0 z-40 max-h-56 w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg" onMouseDown={event => event.preventDefault()}>
      {choices.map((item, index) => <button key={item.name} id={`${listId}-${index}`} type="button" role="option" aria-selected={index === Math.min(active, choices.length - 1)} onMouseEnter={() => setActive(index)} onClick={() => insert(item.name)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${index === Math.min(active, choices.length - 1) ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600'}`}>
        <img src={proxyMediaUrl(item.url, {thumb: true, width: 80})} alt="" className="h-8 w-8 rounded object-cover" />{item.name}
      </button>)}
      {!choices.length && <p className="px-2 py-3 text-xs text-slate-500">{references.length ? '没有匹配的参考图片' : '先添加参考图片，再用 @ 引用'}</p>}
    </div>}
  </div>;
});
