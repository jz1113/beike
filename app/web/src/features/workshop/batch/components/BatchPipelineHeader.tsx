import { ChevronRight, Check } from 'lucide-react';
import type { BatchProductItem } from '../batchTypes';

export interface BatchPipelineHeaderProps {
  fixedBatchMode?: 'original' | 'replication';
  batchMode: 'original' | 'replication';
  handleSwitchMode: (mode: 'original' | 'replication') => void;
  isAutoPilotRunning: boolean;
  currentStage: number;
  setCurrentStage: (stage: number) => void;
  items: unknown[];
  successfulItems: BatchProductItem[];
  readyProductCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
}

export function BatchPipelineHeader({
  fixedBatchMode,
  batchMode,
  handleSwitchMode,
  isAutoPilotRunning,
  currentStage,
  setCurrentStage,
  items,
  successfulItems,
  readyProductCount,
  completedTaskCount,
  totalTaskCount,
}: BatchPipelineHeaderProps) {
  return (
    <div className="px-5 sm:px-8 pt-3 pb-1 bg-transparent flex flex-wrap items-center justify-between shrink-0 gap-3 z-20 transition-all">
      {/* 左侧：专业流水线模式徽标或模式切换胶囊 */}
      <div className="flex items-center gap-2.5 shrink-0">
        {!fixedBatchMode ? (
          <div className="flex items-center gap-1 p-1 bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/50 shadow-xs">
            <button
              type="button"
              onClick={() => handleSwitchMode('original')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                batchMode === 'original'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              原创批量
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('replication')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                batchMode === 'replication'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              复刻批量
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 text-white shadow-2xs text-xs font-bold select-none">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-xs shadow-emerald-400/60" />
            <span>{fixedBatchMode === 'original' ? '原创采编生产流水线' : '对标复刻生产流水线'}</span>
          </div>
        )}

        {isAutoPilotRunning && (
          <span className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200/80 whitespace-nowrap flex items-center gap-1.5 animate-pulse shadow-xs">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            全自动流水线运行中
          </span>
        )}
      </div>

      {/* 中间：一体化现代工艺流程步进导轨 (Modern Glassmorphism Stepper) */}
      <nav aria-label="创作流水线步骤" className="flex items-center gap-1 min-w-0 p-1 bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/50 shadow-xs overflow-x-auto select-none">
        {/* Step 1: 批量采编 */}
        <button
          type="button"
          onClick={() => setCurrentStage(1)}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            currentStage === 1
              ? 'bg-slate-900 text-white shadow-xs'
              : items.length > 0
              ? 'bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200/50 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
              currentStage === 1
                ? 'bg-white/20 text-white'
                : items.length > 0
                ? 'bg-emerald-200/80 text-emerald-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {currentStage > 1 && items.length > 0 ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : '1'}
          </span>
          <span>批量采编</span>
          <span
            className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
              currentStage === 1
                ? 'bg-slate-800 text-slate-200 font-bold'
                : items.length > 0
                ? 'bg-emerald-100/90 text-emerald-800 font-bold'
                : 'bg-slate-200/80 text-slate-600'
            }`}
          >
            {items.length}
          </span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mx-0.5" />

        {/* Replication Step 2 */}
        {batchMode === 'replication' && (
          <>
            <button
              type="button"
              disabled={successfulItems.length === 0}
              onClick={() => setCurrentStage(2)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                currentStage === 2
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-mono font-bold">
                2
              </span>
              <span>采集对标</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mx-0.5" />
          </>
        )}

        {/* Step 2 (Original) / Step 3 (Replication) */}
        <button
          type="button"
          disabled={successfulItems.length === 0}
          onClick={() => setCurrentStage(batchMode === 'original' ? 2 : 3)}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
            (batchMode === 'original' ? currentStage === 2 : currentStage === 3)
              ? 'bg-slate-900 text-white shadow-xs'
              : readyProductCount > 0
              ? 'bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200/50 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
              (batchMode === 'original' ? currentStage === 2 : currentStage === 3)
                ? 'bg-white/20 text-white'
                : readyProductCount > 0
                ? 'bg-emerald-200/80 text-emerald-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {(batchMode === 'original' ? currentStage > 2 : currentStage > 3) && readyProductCount > 0 ? (
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            ) : (
              '2'
            )}
          </span>
          <span>{batchMode === 'original' ? '选图与架构' : '选图与对标'}</span>
          <span
            className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
              (batchMode === 'original' ? currentStage === 2 : currentStage === 3)
                ? 'bg-slate-800 text-slate-200 font-bold'
                : readyProductCount > 0
                ? 'bg-emerald-100/90 text-emerald-800 font-bold'
                : 'bg-slate-200/80 text-slate-600'
            }`}
          >
            {readyProductCount}/{successfulItems.length}
          </span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mx-0.5" />

        {/* Step 3 (Original) / Step 4 (Replication) */}
        <button
          type="button"
          disabled={successfulItems.length === 0}
          onClick={() => setCurrentStage(batchMode === 'original' ? 3 : 4)}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
            (batchMode === 'original' ? currentStage === 3 : currentStage === 4)
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
              (batchMode === 'original' ? currentStage === 3 : currentStage === 4)
                ? 'bg-white/20 text-white'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            3
          </span>
          <span>{batchMode === 'original' ? '分镜提示词' : '复刻提示词'}</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mx-0.5" />

        {/* Step 4 (Original) / Step 5 (Replication) */}
        <button
          type="button"
          disabled={successfulItems.length === 0}
          onClick={() => setCurrentStage(batchMode === 'original' ? 4 : 5)}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
            (batchMode === 'original' ? currentStage === 4 : currentStage === 5)
              ? 'bg-slate-900 text-white shadow-xs'
              : completedTaskCount > 0
              ? 'bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200/50 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
              (batchMode === 'original' ? currentStage === 4 : currentStage === 5)
                ? 'bg-white/20 text-white'
                : completedTaskCount > 0
                ? 'bg-emerald-200/80 text-emerald-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            4
          </span>
          <span>生产与交付</span>
          <span
            className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
              (batchMode === 'original' ? currentStage === 4 : currentStage === 5)
                ? 'bg-slate-800 text-slate-200 font-bold'
                : 'bg-slate-200/80 text-slate-600'
            }`}
          >
            {completedTaskCount}/{totalTaskCount}
          </span>
        </button>
      </nav>

      {/* 右侧：状态指示 */}
      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/80 backdrop-blur-md border border-slate-200/50 text-xs text-slate-600 font-bold shrink-0 hidden lg:flex shadow-2xs">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>
          有效商品: <strong className="text-slate-900 font-mono">{successfulItems.length}</strong> 款
        </span>
      </div>
    </div>
  );
}
