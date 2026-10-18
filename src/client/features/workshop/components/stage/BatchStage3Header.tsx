import React from 'react';
import { Sparkles, Cpu } from 'lucide-react';
import BatchProgressBar from '../BatchProgressBar';

export interface BatchStage3HeaderProps {
  readyCount: number;
  totalCount: number;
  analyzeConcurrency?: number;
  setAnalyzeConcurrency?: (n: number) => void;
  isAnalyzingAll: boolean;
  showAnalyzeButton: boolean;
  hasUnanalyzed: boolean;
  startBatchVisionAnalyze: () => Promise<number | void>;
  analyzeProgress: { current: number; total: number };
  onOpenSettings?: () => void;
}

export const BatchStage3Header: React.FC<BatchStage3HeaderProps> = ({
  readyCount,
  totalCount,
  analyzeConcurrency = 2,
  isAnalyzingAll,
  showAnalyzeButton,
  hasUnanalyzed,
  startBatchVisionAnalyze,
  analyzeProgress,
  onOpenSettings,
}) => {
  return (
    <div className="p-4 sm:p-5 rounded-xl bg-transparent border border-slate-200/60 space-y-3 transition-all dark:border-white/10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight dark:text-slate-100">
              提示词工作台
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 border border-slate-200/60 shadow-2xs dark:text-slate-300 dark:bg-white/10 dark:border-white/10">
              {readyCount}/{totalCount} 款已就绪
            </span>
          </div>
          <p className="text-xs text-slate-400 font-normal">
            分析商品图片，生成分镜提示词；确认或微调后，即可批量生图。
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 全局预设指示标签：轻量只读，点击可直达工坊全局预设中心修改 */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="点击打开工坊全局生产预设中心，调整模型与并发性能"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/70 transition-all cursor-pointer group hover:border-indigo-200 dark:text-slate-300 dark:hover:bg-white/10 dark:bg-white/5 dark:border-white/10"
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-500 group-hover:rotate-45 transition-transform" />
            <span>{analyzeConcurrency} 线程并发</span>
            <span className="text-[10px] text-slate-400 group-hover:text-indigo-600 underline underline-offset-2">预设配置</span>
          </button>

          {showAnalyzeButton && (
            <button
              type="button"
              onClick={startBatchVisionAnalyze}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {hasUnanalyzed
                  ? `批量分析商品`
                  : '重新全量分析'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 实时分析进度条 */}
      {isAnalyzingAll && (
        <div className="pt-2">
          <BatchProgressBar
            current={analyzeProgress.current}
            total={analyzeProgress.total}
            label="多模态 AI 视觉模型正在结合商品实物图深度优化分镜提示词..."
            showSpinner
          />
        </div>
      )}
    </div>
  );
};
