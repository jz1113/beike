import { Loader2, FileSpreadsheet, Download, Sparkles, Columns3, Image as ImageIcon, Pause, Play, Square } from 'lucide-react';
import type { BatchProductItem } from '../../model/batchTypes';
import { isDeliverableWorkshopResult } from '../../model/generation/workshopReadiness';
import { WorkshopActionMenu, workshopMenuItemClass } from '../layout/WorkshopActionMenu';

export interface BatchStage4HeaderProps {
  busy: boolean;
  totalTaskCount: number;
  completedTaskCount: number;
  displaySuccessCount: number;
  displayFailCount: number;
  pendingTaskCount: number;
  recoveryTaskCount: number;
  hasExportableSuccess: boolean;
  outputLabel: string;
  viewMode: 'single' | 'gallery';
  setViewMode: (mode: 'single' | 'gallery') => void;
  generateAllCopywriting?: (options?: { force?: boolean }) => Promise<void>;
  handleExportZip: () => Promise<void>;
  handleExportExcel: () => Promise<void>;
  isExportingZip: boolean;
  successfulItems: BatchProductItem[];
  readOnly?: boolean;
  runControlStatus?: 'idle' | 'running' | 'paused';
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  onCancelRun?: () => void;
}

export function BatchStage4Header({ busy, totalTaskCount, completedTaskCount, displaySuccessCount, displayFailCount,
  pendingTaskCount, recoveryTaskCount, hasExportableSuccess, outputLabel, viewMode, setViewMode,
  generateAllCopywriting, handleExportZip, handleExportExcel, isExportingZip, successfulItems,
  readOnly = false, runControlStatus = 'idle', onPauseRun, onResumeRun, onCancelRun,
}: BatchStage4HeaderProps) {
  const copyBusy = successfulItems.some(item => item.isCopywritingGenerating);
  const progress = totalTaskCount > 0 ? Math.min(100, Math.round(completedTaskCount / totalTaskCount * 100)) : 0;
  const status = readOnly ? '历史批次' : runControlStatus === 'paused' ? '已暂停分发' : busy ? '正在生成' : recoveryTaskCount > 0 ? '生成结果待核对' : displayFailCount > 0 ? '有失败项待处理' : pendingTaskCount > 0 ? '待继续生成' : hasExportableSuccess ? '成图已就绪' : '等待生成';
  const generateCopy = () => {
    const withImages = successfulItems.filter(item => item.tasks.some(isDeliverableWorkshopResult));
    const allHaveCopy = withImages.length > 0 && withImages.every(item => item.copywriting?.title?.trim() && item.copywriting?.content?.trim());
    if (allHaveCopy && !window.confirm('所有已有成图的商品都已有文案。确定全部重写？')) return;
    void generateAllCopywriting?.(allHaveCopy ? { force: true } : undefined);
  };
  return <header className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 sm:p-5 dark:border-white/10 dark:bg-[#18191c]/95">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2.5"><h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">成图与交付</h1><span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-white/5 dark:text-slate-300">{status}</span></div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{successfulItems.length} 款商品 · 已出图 {displaySuccessCount} 张 · {outputLabel}</p>
        <p className="text-xs leading-6 text-slate-400 dark:text-slate-500">对照商品图与已确认的分镜核对成图，补充发布文案，再导出图片与文案包。</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && busy && (runControlStatus === 'paused' ? onResumeRun : onPauseRun) && <>
          <button type="button" onClick={runControlStatus === 'paused' ? onResumeRun : onPauseRun} title="已提交的任务会继续处理，暂停只停止分发新任务" className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
            {runControlStatus === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{runControlStatus === 'paused' ? '继续分发' : '暂停分发'}
          </button>
          {onCancelRun && <button type="button" onClick={onCancelRun} title="停止启动新任务，已提交的任务会继续处理" className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"><Square className="h-3.5 w-3.5" />停止后续任务</button>}
        </>}
        {!readOnly && generateAllCopywriting && <button type="button" onClick={generateCopy} disabled={!hasExportableSuccess || copyBusy || busy} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
          {copyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{copyBusy ? '正在生成文案' : '生成发布文案'}
        </button>}
        <WorkshopActionMenu label={isExportingZip ? '正在导出' : '导出结果'} icon={isExportingZip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} primary disabled={isExportingZip || !hasExportableSuccess || copyBusy}>
          <p className="px-3 py-2 text-[11px] text-slate-400">导出已生成且未拒绝的图片与现有文案</p>
          <button type="button" className={workshopMenuItemClass} onClick={() => void handleExportZip()}><Download className="h-4 w-4" />下载图片与文案包</button>
          <button type="button" className={workshopMenuItemClass} onClick={() => void handleExportExcel()}><FileSpreadsheet className="h-4 w-4" />导出 Excel 表格</button>
        </WorkshopActionMenu>
      </div>
    </div>
    {busy && totalTaskCount > 0 && <div className="mt-4 flex items-center gap-3">
      <div role="progressbar" aria-label="生图进度" aria-valuemin={0} aria-valuemax={totalTaskCount} aria-valuenow={Math.min(completedTaskCount, totalTaskCount)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} /></div>
      <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{completedTaskCount}/{totalTaskCount}</span>
    </div>}
    <div className="mt-4 flex gap-1 border-t border-slate-100 pt-3 dark:border-white/10" role="group" aria-label="成图视图">
      {([['single', '逐款检查', Columns3], ['gallery', '全部成图', ImageIcon]] as const).map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={viewMode === value} onClick={() => setViewMode(value)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${viewMode === value ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
    </div>
  </header>;
}
