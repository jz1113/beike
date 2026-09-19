import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CanvasMaterialIcon, CanvasDrawingIcon, CanvasVideoIcon } from '@/shared/icons';

export function CanvasNodeMenu({ x, y, onSelect, onClose }: { x: number; y: number; onSelect: (type: 'file' | 'drawing' | 'video-generation') => void; onClose: () => void }) {
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
  return createPortal(<div ref={menu} role="menu" aria-label="添加节点" onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} className="fixed z-[100] w-44 rounded-2xl bg-white border border-slate-200 p-2 text-slate-700 shadow-lg" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 184)), top: Math.max(8, Math.min(y, window.innerHeight - 150)) }}>
    <p className="px-3 py-1.5 text-[11px] text-slate-500">添加节点</p>
    <button type="button" role="menuitem" onClick={() => onSelect('file')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs hover:bg-indigo-50 focus-visible:bg-indigo-50 focus-visible:outline-none"><CanvasMaterialIcon />素材上传</button>
    <button type="button" role="menuitem" onClick={() => onSelect('drawing')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs hover:bg-indigo-50 focus-visible:bg-indigo-50 focus-visible:outline-none"><CanvasDrawingIcon />绘图</button>
    <button type="button" role="menuitem" onClick={() => onSelect('video-generation')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs hover:bg-indigo-50"><CanvasVideoIcon />视频生成</button>
  </div>, document.body);
}
