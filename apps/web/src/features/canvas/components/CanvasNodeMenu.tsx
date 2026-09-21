import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Video } from 'lucide-react';
import { CanvasMaterialIcon } from '@/shared/icons';

export type CanvasQuickNodeType = 'file' | 'image-generation' | 'video-generation';

export function CanvasNodeMenu({ x, y, onSelect, onClose }: { x: number; y: number; onSelect: (type: CanvasQuickNodeType) => void; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    menu.current?.querySelector('button')?.focus();
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === 'Tab') onClose(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      previous?.focus();
    };
  }, [onClose]);
  return createPortal(<div ref={menu} role="menu" aria-label="新建节点" onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} className="fixed z-[100] w-52 rounded-2xl bg-white/96 p-2.5 text-slate-700 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl" style={{ left: Math.max(12, Math.min(x, window.innerWidth - 220)), top: Math.max(12, Math.min(y, window.innerHeight - 310)) }}>
    <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold tracking-wide text-slate-400">在这里新建</p>
    <button type="button" role="menuitem" onClick={() => onSelect('image-generation')} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium hover:bg-violet-50 hover:text-violet-700 focus-visible:bg-violet-50 focus-visible:outline-none"><ImagePlus className="h-4 w-4 text-violet-500" />图片生成</button>
    <button type="button" role="menuitem" onClick={() => onSelect('video-generation')} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium hover:bg-cyan-50 hover:text-cyan-700 focus-visible:bg-cyan-50 focus-visible:outline-none"><Video className="h-4 w-4 text-cyan-500" />视频生成</button>
    <div className="my-1.5 h-px bg-slate-100" />
    <button type="button" role="menuitem" onClick={() => onSelect('file')} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium hover:bg-emerald-50 hover:text-emerald-700 focus-visible:bg-emerald-50 focus-visible:outline-none"><CanvasMaterialIcon />导入素材</button>
  </div>, document.body);
}
