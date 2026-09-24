import {
  Loader2,
  FileSpreadsheet,
  Download,
  Sparkles,
  Columns3,
  Image as ImageIcon,
  Pause,
  Play,
  Square,
  CheckCircle2,
} from 'lucide-react';
import { BatchProductItem } from '../model/batchTypes';

export interface BatchStage4HeaderProps {
  isGeneratingBatch: boolean;
  totalTaskCount: number;
  completedTaskCount: number;
  displaySuccessCount: number;
  displayFailCount: number;
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
  return (
    <div className="py-1">
      <div className="flex items-center justify-end gap-3 flex-wrap">
        {/* 右侧：核心交付动作（导出表格、打包ZIP、批量文案） */}
        <div className="flex flex-wrap justify-end items-center gap-2">
          <div className="flex items-center bg-slate-100/90 p-1 rounded-2xl text-xs mr-1 shadow-inner border border-slate-200/60">
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                viewMode === 'single' ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>单品</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('gallery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                viewMode === 'gallery' ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>画廊</span>
            </button>
          </div>

          {!readOnly && runControlStatus === 'running' && onPauseRun && (
            <button type="button" onClick={onPauseRun} className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 flex items-center gap-1.5">
              <Pause className="w-3.5 h-3.5" /><span>暂停</span>
            </button>
          )}
          {!readOnly && runControlStatus === 'paused' && onResumeRun && (
            <button type="button" onClick={onResumeRun} className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-indigo-200 bg-indigo-50 text-indigo-700 flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5" /><span>继续</span>
            </button>
          )}
          {!readOnly && runControlStatus !== 'idle' && onCancelRun && (
            <button type="button" onClick={onCancelRun} className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-rose-200 bg-white text-rose-700 flex items-center gap-1.5">
              <Square className="w-3.5 h-3.5" /><span>取消</span>
            </button>
          )}
          {!readOnly && onBackToPrompts && (
            <button type="button" onClick={onBackToPrompts} disabled={isGeneratingBatch} className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 disabled:opacity-40">
              返回提示词
            </button>
          )}
          {!readOnly && onCompleteBatch && (
            <button type="button" onClick={onCompleteBatch} disabled={pipelineStatus === 'completed'} className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white flex items-center gap-1.5 disabled:opacity-40">
              <CheckCircle2 className="w-3.5 h-3.5" /><span>完成本批次</span>
            </button>
          )}
          {!readOnly && generateAllCopywriting && (
            <button
              type="button"
              onClick={() => {
                const withImages = successfulItems.filter((item) => (item.tasks || []).some((task) => task.status === 'SUCCESS' && task.resultUrl));
                const allHaveCopy = withImages.length > 0 && withImages.every((item) => Boolean(item.copywriting?.content));
                if (allHaveCopy && !window.confirm('所有商品都已有文案。要全部重写吗？')) return;
                void generateAllCopywriting?.(allHaveCopy ? { force: true } : undefined);
              }}
              disabled={!hasExportableSuccess}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200/80 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all bg-white shadow-2xs active:scale-98"
              title="一键为所有商品批量生成/重写小红书文案"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>批量文案</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportZip}
            disabled={isExportingZip || !hasExportableSuccess}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 disabled:opacity-40"
            title="打包下载已生成的图片和文案"
          >
            {isExportingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>下载图片包</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExportingZip || !hasExportableSuccess}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all shadow-xs hover:shadow-emerald-500/25 active:scale-98"
            title="导出包含任务文案和分镜图片链接的 Excel 表格"
          >
            {isExportingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            <span>导出 Excel</span>
          </button>
        </div>
      </div>

    </div>
  );
}
