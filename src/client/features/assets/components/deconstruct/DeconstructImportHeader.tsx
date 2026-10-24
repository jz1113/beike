import { FolderOpen, Link2, Sparkles, X } from 'lucide-react';

export function DeconstructImportHeader({ mode, onModeChange, onClose, disabled = false }: {
  mode: 'xhs' | 'local';
  onModeChange: (mode: 'xhs' | 'local') => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="shrink-0 rounded-t-3xl border-b border-slate-100 bg-white px-5 py-3.5 sm:px-6 dark:border-white/10 dark:bg-[#18191c]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 id="deconstruct-import-title" className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">导入参考图组</h3>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">每 4 张自动成组</span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">自动提取图片并按 4 张一组编排分镜，后台静默反推入库</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-xl bg-slate-100/80 p-1 dark:bg-white/[0.06] border border-slate-200/60 dark:border-white/[0.08]" role="tablist" aria-label="图集导入方式">
            {([{ id: 'xhs', label: '小红书链接', icon: Link2 }, { id: 'local', label: '本地图片 / 文件夹', icon: FolderOpen }] as const).map(tab => (
              <button key={tab.id} type="button" role="tab" aria-selected={mode === tab.id}
                onClick={() => onModeChange(tab.id)}
                disabled={disabled}
                className={`deconstruct-source-tab flex min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:cursor-default ${mode === tab.id
                  ? 'bg-white text-slate-900 shadow-2xs dark:text-slate-100 dark:bg-[#25262B]' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-400'}`}>
                <tab.icon className="h-3.5 w-3.5 shrink-0" />
                {tab.id === 'local' ? <><span className="sm:hidden">本地导入</span><span className="hidden sm:inline">{tab.label}</span></> : tab.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label={disabled ? '收起图集导入，任务继续运行' : '关闭图集导入'}
            title={disabled ? '收起面板，已启动的后台任务继续运行' : '关闭'}
            className="deconstruct-icon-button grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
