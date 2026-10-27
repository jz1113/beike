import { useEffect, useRef, type RefObject, type ChangeEvent } from 'react';
import { Download, MoreHorizontal, RefreshCw, Sparkles, Upload } from 'lucide-react';

export interface AssetLibraryMoreMenuProps {
  showMoreMenu: boolean;
  setShowMoreMenu: (v: boolean) => void;
  importJsonRef: RefObject<HTMLInputElement | null>;
  onImportJsonBackup: (e: ChangeEvent<HTMLInputElement>) => void;
  onExportJsonBackup: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  onOpenSkills?: () => void;
}

export function AssetLibraryMoreMenu({ showMoreMenu, setShowMoreMenu, importJsonRef, onImportJsonBackup, onExportJsonBackup, onRefresh, isLoading, onOpenSkills }: AssetLibraryMoreMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!showMoreMenu) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setShowMoreMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setShowMoreMenu(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [showMoreMenu, setShowMoreMenu]);
  const item = 'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-white/5';
  return <div ref={root} className="relative">
    <button ref={button} type="button" onClick={() => setShowMoreMenu(!showMoreMenu)} aria-label="更多素材操作" title="更多素材操作" aria-expanded={showMoreMenu} className="asset-library-more"><MoreHorizontal size={16} /></button>
    {showMoreMenu && <div aria-label="素材备份与维护" className="absolute right-0 top-11 z-50 w-60 rounded-2xl border border-slate-200 bg-white py-2 text-slate-700 shadow-xl dark:border-white/10 dark:bg-[#1B1B1E] dark:text-slate-300">
      <button type="button" className={item} disabled={isLoading} onClick={() => { setShowMoreMenu(false); onRefresh(); }}><RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />{isLoading ? '正在刷新…' : '刷新素材'}</button>
      {onOpenSkills && <button type="button" className={item} onClick={() => { setShowMoreMenu(false); onOpenSkills(); }}><Sparkles size={14} />管理创作技能</button>}
      <div className="mx-3 my-1 border-t border-slate-100 dark:border-white/10" />
      <button type="button" className={item} onClick={() => { setShowMoreMenu(false); onExportJsonBackup(); }}><Download size={14} />导出素材备份</button>
      <button type="button" className={item} onClick={() => { setShowMoreMenu(false); importJsonRef.current?.click(); }}><Upload size={14} />恢复素材备份</button>
      <p className="px-4 py-1 text-[10px] leading-5 text-slate-500">备份含学习素材记录，不含技能版本和原图。</p>
    </div>}
    <input ref={importJsonRef} type="file" accept=".json" className="hidden" onChange={onImportJsonBackup} />
  </div>;
}
