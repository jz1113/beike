import {
  Loader2,
  FileSpreadsheet,
  Sparkles,
  LayoutGrid,
  Columns3,
  Image as ImageIcon,
} from 'lucide-react';
import { BatchProductItem } from '../batchTypes';

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
  viewMode: 'single' | 'grid' | 'gallery';
  setViewMode: (m: 'single' | 'grid' | 'gallery') => void;
  generateAllCopywriting?: () => Promise<void>;
  handleExportZip: () => Promise<void>;
  isExportingZip: boolean;
  successfulItems: BatchProductItem[];
  safeIndex: number;
  setActiveItemIndex: (fn: number | ((prev: number) => number)) => void;
}

export function BatchStage4Header({
  hasExportableSuccess,
  viewMode,
  setViewMode,
  generateAllCopywriting,
  handleExportZip,
  isExportingZip,
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
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>总览</span>
            </button>
          </div>

          {generateAllCopywriting && (
            <button
              type="button"
              onClick={generateAllCopywriting}
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
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all shadow-xs hover:shadow-emerald-500/25 active:scale-98"
            title="导出包含任务标题、任务文案、商品名称、商品ID与拆分后图链接1-4的 Excel 表格"
          >
            {isExportingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            <span>导出 Excel</span>
          </button>
        </div>
      </div>

    </div>
  );
}
