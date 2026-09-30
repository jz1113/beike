import { FolderOpen, Link2, Sparkles, X } from 'lucide-react';

export function DeconstructImportHeader({ mode, onModeChange, onClose, disabled = false }: {
  mode: 'xhs' | 'local';
  onModeChange: (mode: 'xhs' | 'local') => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="shrink-0 border-b border-slate-100 bg-white px-5 pb-4 pt-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 id="deconstruct-import-title" className="text-base font-semibold tracking-tight text-slate-900">导入参考图集</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">提炼场景、人物、穿搭与分镜，沉淀为提示词资产</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={disabled ? '收起图集导入，任务继续运行' : '关闭图集导入'}
          title={disabled ? '收起面板，已启动的后台任务继续运行' : '关闭'}
          className="deconstruct-icon-button grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full items-center rounded-xl bg-slate-100/80 p-1 sm:w-auto" role="tablist" aria-label="图集导入方式">
        {([{ id: 'xhs', label: '小红书链接', icon: Link2 }, { id: 'local', label: '本地图片 / 文件夹', icon: FolderOpen }] as const).map(tab => (
          <button key={tab.id} type="button" role="tab" aria-selected={mode === tab.id}
            onClick={() => onModeChange(tab.id)}
            disabled={disabled}
            className={`deconstruct-source-tab flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-all disabled:cursor-default sm:flex-none ${mode === tab.id
              ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>
            <tab.icon className="h-3.5 w-3.5 shrink-0" />
            {tab.id === 'local' ? <><span className="sm:hidden">本地导入</span><span className="hidden sm:inline">{tab.label}</span></> : tab.label}
          </button>
        ))}
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />启动后可收起，后台持续处理
        </p>
      </div>
    </div>
  );
}
