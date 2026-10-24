import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderInput, Trash2, X } from 'lucide-react';

export function PromptAssetContextMenu({ x, y, count, canMove, onMove, onDelete, onClear, onClose }: {
  x: number;
  y: number;
  count: number;
  canMove: boolean;
  onMove: () => void;
  onDelete: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => ref.current?.querySelector('button')?.focus());
    const dismiss = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClear(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [onClose, onClear]);
  return createPortal(<div ref={ref} role="menu" aria-label={`${count}项资产操作`} data-prompt-library-context
    className="fixed z-[135] min-w-44 rounded-xl border border-slate-200 bg-white/95 p-1.5 text-xs shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-[#1B1C20]/95"
    style={{ left: Math.max(8, Math.min(x, window.innerWidth - 196)), top: Math.max(8, Math.min(y, window.innerHeight - 150)) }}>
    <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">已选 {count} 项</div>
    {canMove && <button type="button" role="menuitem" onClick={onMove}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 dark:text-slate-200 dark:hover:bg-white/[0.08] dark:hover:text-indigo-300">
      <FolderInput className="h-3.5 w-3.5" />移动到分类
    </button>}
    <button type="button" role="menuitem" onClick={onDelete}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">
      <Trash2 className="h-3.5 w-3.5" />删除所选资产
    </button>
    <button type="button" role="menuitem" onClick={onClear}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
      <X className="h-3.5 w-3.5" />取消选择
    </button>
  </div>, document.body);
}
