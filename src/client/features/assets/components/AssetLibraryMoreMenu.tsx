import { type RefObject, type ChangeEvent } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface AssetLibraryMoreMenuProps {
  showMoreMenu: boolean;
  setShowMoreMenu: (v: boolean) => void;
  importJsonRef: RefObject<HTMLInputElement | null>;
  onImportJsonBackup: (e: ChangeEvent<HTMLInputElement>) => void;
  onExportJsonBackup: () => void;
  onDeduplicate: () => void;
  onOpenPromptSpec: () => void;
  onClearAssets: (scope: 'current' | 'all') => void;
}

export function AssetLibraryMoreMenu({
  showMoreMenu,
  setShowMoreMenu,
  importJsonRef,
  onImportJsonBackup,
  onExportJsonBackup,
  onDeduplicate,
  onOpenPromptSpec,
  onClearAssets,
}: AssetLibraryMoreMenuProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowMoreMenu(!showMoreMenu)}
        className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200/60 dark:border-white/10 transition-colors cursor-pointer h-9 w-9 flex items-center justify-center"
        title="更多工具与设置"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {showMoreMenu && (
        <div
          onMouseLeave={() => setShowMoreMenu(false)}
          className="absolute right-0 top-11 z-50 w-52 bg-white dark:bg-[#1B1B1E] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] py-1.5 text-xs text-slate-700 dark:text-[#C7C7CC] animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3.5 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            数据导入与导出
          </div>
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false);
              importJsonRef.current?.click();
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.06] hover:text-slate-950 dark:hover:text-white font-medium transition-colors cursor-pointer"
          >
            <span>导入恢复备份 (JSON)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false);
              onExportJsonBackup();
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.06] hover:text-slate-950 dark:hover:text-white font-medium transition-colors cursor-pointer"
          >
            <span>导出资产备份 (JSON)</span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-white/10" />

          <div className="px-3.5 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            资产维护与规范
          </div>
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false);
              onDeduplicate();
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.06] hover:text-slate-950 dark:hover:text-white font-medium transition-colors cursor-pointer"
          >
            <span>智能提纯与去重分类</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false);
              onOpenPromptSpec();
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.06] hover:text-slate-950 dark:hover:text-white font-medium transition-colors cursor-pointer"
          >
            <span>反推提示词规范说明</span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-white/10" />

          <div className="px-3.5 py-1 text-[10px] font-bold text-rose-400 uppercase tracking-wider">
            危险重置与清理
          </div>
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false);
              onClearAssets('current');
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-medium transition-colors cursor-pointer"
          >
            <span>清空当前分类资产</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false);
              onClearAssets('all');
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-left hover:bg-rose-50 text-rose-700 font-medium transition-colors cursor-pointer"
          >
            <span>清空全部数据库数据</span>
          </button>
        </div>
      )}

      <input
        ref={importJsonRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={onImportJsonBackup}
      />
    </div>
  );
}
