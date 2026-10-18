import { Loader2, FileSpreadsheet, Download, Sparkles, Columns3, Image as ImageIcon, Pause, Play, Square, CheckCircle2, ArrowLeft, MoreHorizontal } from 'lucide-react';
import { BatchProductItem } from '../../model/batchTypes';
import { isDeliverableWorkshopResult } from '../../model/generation/workshopReadiness';
import { WorkshopActionMenu, workshopMenuItemClass } from '../WorkshopActionMenu';

export interface BatchStage4HeaderProps {
  isGeneratingBatch: boolean;
  totalTaskCount: number;
  completedTaskCount: number;
  displaySuccessCount: number;
  displayFailCount: number;
  pendingTaskCount?: number;
  recoveryTaskCount?: number;
  hasExportableSuccess: boolean;
  currentModelName: string;
  showEngineSettings: boolean;
  setShowEngineSettings: (v: boolean) => void;
  availableImageModels: any[];
  selectedImageGenModel: string;
  setSelectedImageGenModel: (m: string) => void;
  selectedQuality: 'high' | 'medium' | 'low';
  setSelectedQuality: (q: 'high' | 'medium' | 'low') => void;
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  setSelectedAspect: (a: '3:4' | '1:1' | '9:16' | '16:9') => void;
  viewMode: 'single' | 'gallery';
  setViewMode: (m: 'single' | 'gallery') => void;
  generateAllCopywriting?: (options?: { force?: boolean }) => Promise<void>;
  handleExportZip: () => Promise<void>;
  handleExportExcel: () => Promise<void>;
  isExportingZip: boolean;
  successfulItems: BatchProductItem[];
  safeIndex: number;
  setActiveItemIndex: (fn: number | ((prev: number) => number)) => void;
  readOnly?: boolean;
  runControlStatus?: 'idle' | 'running' | 'paused';
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  onCancelRun?: () => void;
  onCompleteBatch?: () => void;
  onBackToPrompts?: () => void;
  pipelineStatus?: string;
}

export function BatchStage4Header({
  isGeneratingBatch,
  totalTaskCount,
  completedTaskCount,
  displaySuccessCount,
  displayFailCount,
  pendingTaskCount = 0,
  recoveryTaskCount = 0,
  hasExportableSuccess,
  viewMode,
  setViewMode,
  generateAllCopywriting,
  handleExportZip,
  handleExportExcel,
  isExportingZip,
  successfulItems,
  readOnly = false,
  runControlStatus = 'idle',
  onPauseRun,
  onResumeRun,
  onCancelRun,
  onCompleteBatch,
  onBackToPrompts,
  pipelineStatus,
}: BatchStage4HeaderProps) {
  const busy = isGeneratingBatch || runControlStatus !== 'idle';
  const copyBusy = successfulItems.some((item) => item.isCopywritingGenerating);
  const progress = totalTaskCount > 0 ? Math.min(100, Math.round(completedTaskCount / totalTaskCount * 100)) : 0;
  const status = readOnly ? '历史批次' : runControlStatus === 'paused' ? '已暂停' : busy ? '正在生成' : recoveryTaskCount > 0 ? '生成结果待核对' : displayFailCount > 0 ? '部分生成失败' : pendingTaskCount > 0 ? '待继续生成' : hasExportableSuccess ? '成图已就绪' : '等待生成';
  const generateCopy = () => {
    const withImages = successfulItems.filter((item) => item.tasks.some(isDeliverableWorkshopResult));
    const allHaveCopy = withImages.length > 0 && withImages.every((item) => Boolean(item.copywriting?.content));
    if (allHaveCopy && !window.confirm('所有商品都已有文案。要全部重写吗？')) return;
    void generateAllCopywriting?.(allHaveCopy ? { force: true } : undefined);
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-2">
      <div className="min-w-[180px] flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{status}</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">{successfulItems.length} 款商品 · 已出图 {displaySuccessCount} 张</span>
          {recoveryTaskCount > 0 && <span className="text-xs text-amber-700">待核对 {recoveryTaskCount} 张</span>}
          {displayFailCount > 0 && <span className="text-xs text-rose-600">失败 {displayFailCount} 张</span>}
        </div>
        {busy && totalTaskCount > 0 && <div className="flex max-w-sm items-center gap-3">
          <div role="progressbar" aria-label="生图进度" aria-valuemin={0} aria-valuemax={totalTaskCount} aria-valuenow={Math.min(completedTaskCount, totalTaskCount)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{completedTaskCount}/{totalTaskCount}</span>
        </div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex rounded-xl border border-slate-200/60 bg-slate-100 p-1 dark:bg-white/10 dark:border-white/10" role="group" aria-label="成图视图">
          {([['single', '单品', Columns3], ['gallery', '画廊', ImageIcon]] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" aria-pressed={viewMode === value} onClick={() => setViewMode(value)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === value ? 'bg-white text-slate-900 shadow-sm dark:text-slate-100 dark:bg-[#18191c]' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-400'}`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
        {!readOnly && busy && (runControlStatus === 'paused' ? onResumeRun : onPauseRun) && (
          <button type="button" onClick={runControlStatus === 'paused' ? onResumeRun : onPauseRun} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5 dark:border-white/10 dark:bg-[#18191c]">
            {runControlStatus === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {runControlStatus === 'paused' ? '继续生成' : '暂停'}
          </button>
        )}
        <WorkshopActionMenu label={isExportingZip ? '正在导出' : '导出结果'} icon={isExportingZip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} primary disabled={isExportingZip || !hasExportableSuccess}>
          <p className="px-3 py-2 text-[11px] text-slate-400">导出当前批次已生成的内容</p>
          <button type="button" className={workshopMenuItemClass} onClick={() => void handleExportZip()}><Download className="h-4 w-4" />下载图片与文案包</button>
          <button type="button" className={workshopMenuItemClass} onClick={() => void handleExportExcel()}><FileSpreadsheet className="h-4 w-4" />导出 Excel 表格</button>
        </WorkshopActionMenu>
        {!readOnly && <WorkshopActionMenu label="更多" icon={<MoreHorizontal className="h-4 w-4" />}>
          {generateAllCopywriting && <button type="button" className={workshopMenuItemClass} disabled={!hasExportableSuccess || copyBusy} onClick={generateCopy}><Sparkles className="h-4 w-4" />{copyBusy ? '文案生成中…' : '批量生成文案'}</button>}
          {onBackToPrompts && <button type="button" className={workshopMenuItemClass} onClick={onBackToPrompts} disabled={busy}><ArrowLeft className="h-4 w-4" />返回修改提示词</button>}
          {onCompleteBatch && <button type="button" className={workshopMenuItemClass} onClick={onCompleteBatch} disabled={busy || copyBusy || pipelineStatus === 'completed'} title={busy ? '请等待生成结束后归档' : '归档当前批次，并开始空白新批次'}><CheckCircle2 className="h-4 w-4" />完成并归档本批次</button>}
          {busy && onCancelRun && <div className="mt-1 border-t border-slate-100 pt-1 dark:border-white/10"><button type="button" className={`${workshopMenuItemClass} text-rose-600`} onClick={onCancelRun}><Square className="h-4 w-4" />停止生成</button></div>}
        </WorkshopActionMenu>}
      </div>
    </div>
  );
}
