import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react';
import { RichPromptInput, type RichPromptInputRef } from '@client/shared/prompt-bar/RichPromptInput';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { mediaReferenceSlots } from '@client/shared/media/videoReferences';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';

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
  const slots = mediaReferenceSlots(references);
  const choices = slots
    .filter(item => item.name.includes(mention?.query || ''));
  const insert = (name: string) => {
    const index = slots.findIndex(item => item.name === name);
    if (index < 0) return;
    input.current?.insertMention({id: `canvas-ref-${index}`, name, url: references[index]});
    setMention(null);
  };
  useImperativeHandle(ref, () => ({insertReference: (index: number) => { if (slots[index]) insert(slots[index].name); }}));
  return <div ref={root} className="relative mt-3 mb-3 min-h-20" onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget)) setMention(null);}}>
    <RichPromptInput ariaLabel="生成提示词" ref={input} value={value} onChange={onChange} allSubjects={[]} quickRefImages={references}
      placeholder="描述主体、动作与画面。输入 @ 引用素材…" variant="composer"
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
        {isVideoMediaUrl(item.url) ? <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-100">▶</span> : <img src={proxyMediaUrl(item.url, {thumb: true, width: 80})} alt="" className="h-8 w-8 rounded object-cover" />}{item.name}
      </button>)}
      {!choices.length && <p className="px-2 py-3 text-xs text-slate-500">{references.length ? '没有匹配的参考图片' : '先添加参考图片，再用 @ 引用'}</p>}
    </div>}
  </div>;
});
