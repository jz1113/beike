import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { IMAGE_RATIO_ITEMS } from '@client/shared/prompt-bar/promptBarConstants';
import { CanvasVideoPopover } from './CanvasVideoPopover';

type Config = { aspect: string; quality: string; count: number };
const qualities = [{ id: 'high', label: '高画质' }, { id: 'medium', label: '标准画质' }, { id: 'low', label: '低画质' }];

export function CanvasImageControls({ config, onChange }: { config: Config; onChange: (patch: Partial<Config>) => void }) {
  const [open, setOpen] = useState<'aspect' | 'quality' | 'count' | null>(null);
  const aspect = useRef<HTMLButtonElement>(null);
  const quality = useRef<HTMLButtonElement>(null);
  const count = useRef<HTMLButtonElement>(null);
  const anchors = useMemo(() => ({ aspect, quality, count }), []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!(event.target as Element).closest('[data-image-control]')) setOpen(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(null); anchors[open].current?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape, true); };
  }, [open, anchors]);
  const choose = (patch: Partial<Config>) => { onChange(patch); if (open) anchors[open].current?.focus(); setOpen(null); };
  const controls = [
    { id: 'aspect' as const, label: '图片比例', value: config.aspect === 'smart' ? '自适应' : config.aspect },
    { id: 'quality' as const, label: '图片画质', value: qualities.find(item => item.id === config.quality)?.label || '标准画质' },
    { id: 'count' as const, label: '绘图张数', value: `${config.count} 张` },
  ];
  return <>
    {controls.map(({ id, label, value }) => <button key={id} ref={anchors[id]} type="button" data-image-control aria-label={label} aria-haspopup="dialog" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)} className={`flex h-8 items-center whitespace-nowrap rounded-md px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-slate-400 ${open === id ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}>
      {value}
    </button>)}
    {open && <CanvasVideoPopover key={open} anchor={anchors[open]} width={open === 'aspect' ? 312 : open === 'quality' ? 144 : 176}><div data-image-control role="dialog" aria-label={controls.find(item => item.id === open)?.label} className={open === 'aspect' ? 'p-3' : 'p-1.5'} onKeyDown={event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1) + items.length) % items.length]?.focus();
    }}>
      {open === 'aspect' && <p className="mb-3 px-1 text-[11px] font-medium text-slate-500">画面比例</p>}
      {open === 'aspect' ? <div className="grid grid-cols-5 gap-1.5">{['smart', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'].map(id => IMAGE_RATIO_ITEMS.find(item => item.id === id)!).map(item => {
        const [w, h] = item.id.includes(':') ? item.id.split(':').map(Number) : [1, 1];
        return <button key={item.id} type="button" autoFocus={config.aspect === item.id} aria-pressed={config.aspect === item.id} onClick={() => choose({ aspect: item.id })} className={`flex h-16 flex-col items-center justify-center gap-2 rounded-lg border text-[11px] focus-visible:outline-2 focus-visible:outline-slate-400 ${config.aspect === item.id ? 'border-slate-700 bg-slate-100 text-slate-900' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
          <span className="flex h-5 items-center"><span className={`rounded-[2px] border border-current ${item.id === 'smart' ? 'border-dashed' : ''}`} style={{ width: 20 * w / Math.max(w, h), height: 20 * h / Math.max(w, h) }} /></span>{item.id === 'smart' ? '自适应' : item.label}
        </button>;
      })}</div> : open === 'quality' ? <div className="space-y-1">{qualities.map(item => <button key={item.id} type="button" autoFocus={config.quality === item.id} aria-pressed={config.quality === item.id} onClick={() => choose({ quality: item.id })} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs focus-visible:outline-2 focus-visible:outline-slate-400 ${config.quality === item.id ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>{item.label}{config.quality === item.id && <Check size={14} />}</button>)}</div> : <div className="flex gap-1">{[1, 2, 4].map(value => <button key={value} type="button" autoFocus={config.count === value} aria-pressed={config.count === value} onClick={() => choose({ count: value })} className={`flex-1 rounded-full py-2 text-xs focus-visible:outline-2 focus-visible:outline-slate-400 ${config.count === value ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>{value} 张</button>)}</div>}
    </div></CanvasVideoPopover>}
  </>;
}
