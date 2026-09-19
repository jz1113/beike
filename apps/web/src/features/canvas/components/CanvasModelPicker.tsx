import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { ModelIcon } from '@/shared/ui/ModelIcons';

interface Model { id: string; name: string }

export function CanvasModelPicker({ models, value, onChange, disabled = false }: {
  models: Model[]; value: string; onChange: (id: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{left: number; top?: number; bottom?: number; width: number; height: number}>({left: 8, top: 8, width: 208, height: 360});
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = models.find(model => model.id === value);
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(208, window.innerWidth - 16);
      const above = rect.top - 16;
      const below = window.innerHeight - rect.bottom - 16;
      const up = above >= Math.min(360, below);
      const height = Math.max(80, Math.min(360, up ? above : below));
      setPosition({left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), ...(up ? {bottom: window.innerHeight - rect.top + 8} : {top: rect.bottom + 8}), width, height});
    };
    place();
    (popup.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') || popup.current?.querySelector<HTMLButtonElement>('[data-model-choice]'))?.focus();
    const outside = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);};
  }, [open]);

  return <>
    <button ref={trigger} type="button" aria-label="绘图模型" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
      onClick={() => {setOpen(!open);}}
      className="flex max-w-[220px] items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-50">
      <span aria-hidden="true"><ModelIcon modelId={value} className="h-4 w-4" /></span>
      <span className="truncate" title={current?.name}>{current?.name || (value ? '模型已停用，请重新选择' : '选择绘图模型')}</span>
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && createPortal(<div ref={popup} id={id} role="dialog" aria-label="选择绘图模型" className="fixed z-[200] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl" style={{left:position.left, top:position.top, bottom:position.bottom, width:position.width, maxHeight:position.height}}
      onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') {event.preventDefault(); close();}
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const choices = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[data-model-choice]') || []);
          const index = choices.indexOf(document.activeElement as HTMLButtonElement);
          choices[(index + (event.key === 'ArrowDown' ? 1 : choices.length - 1) + choices.length) % choices.length]?.focus();
        }
        if (event.key === 'Tab') {
          const items = Array.from(popup.current?.querySelectorAll<HTMLElement>('button') || []);
          if (event.shiftKey && document.activeElement === items[0]) {event.preventDefault(); items.at(-1)?.focus();}
          else if (!event.shiftKey && document.activeElement === items.at(-1)) {event.preventDefault(); items[0]?.focus();}
        }
      }}>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain">
        {models.map(model => <button key={model.id} type="button" data-model-choice aria-pressed={model.id === value} onClick={() => {onChange(model.id); close();}}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300 ${model.id === value ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'}`}>
          <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center"><ModelIcon modelId={model.id} className="h-3.5 w-3.5" /></span>
          <span className="min-w-0 flex-1 truncate text-xs font-normal" title={model.name}>{model.name}</span>
          {model.id === value && <Check className="h-3 w-3 shrink-0" />}
        </button>)}
        {!models.length && <p className="px-3 py-6 text-center text-xs text-slate-500">请先在设置中配置并启用模型</p>}
      </div>
    </div>, document.body)}
  </>;
}
