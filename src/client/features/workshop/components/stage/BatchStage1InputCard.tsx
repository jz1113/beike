import React from 'react';
import { 
  Loader2, 
  RotateCcw, 
  ArrowUp
} from 'lucide-react';

export interface BatchStage1InputCardProps {
  batchInputText: string;
  setBatchInputText: (val: string) => void;
  parsedLineCount: number;
  handlePasteClipboard?: () => Promise<void>;
  sampleDataA?: string;
  isCollecting: boolean;
  hasInputs: boolean;
  collectProgress?: { total: number; current: number; success: number; failed: number };
  itemsCount?: number;
  handleParseInput?: () => void;
  handleSmartBatchCollect: () => Promise<void>;
  recipeName?: string;
  selectedAspect?: string;
  selectedQuality?: string;
  selectedShotCount?: number;
  selectedImageGenModel?: string;
  onOpenSettings?: () => void;
}

export const BatchStage1InputCard: React.FC<BatchStage1InputCardProps> = ({ batchInputText, setBatchInputText, parsedLineCount, isCollecting, hasInputs, handleSmartBatchCollect }) => {
  return (
    <div className="group/input relative flex w-full select-none flex-col gap-3 rounded-[32px] border border-slate-300/80 dark:border-white/10 bg-white/30 dark:bg-[#1B1B1E]/80 p-4 transition-colors hover:border-indigo-300 dark:hover:border-indigo-400/50 hover:bg-white/40 dark:hover:bg-[#1B1B1E] focus-within:border-indigo-400 dark:focus-within:border-indigo-500 sm:p-5">
      {/* 顶部微光线：营造沉浸式空间微弱呼吸光晕 */}
      <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/25 to-transparent pointer-events-none" />

      {/* 🌟 主输入区域：全宽纯净多行 Textarea */}
      <div className="w-full relative flex flex-col">
        <textarea
          rows={3}
          value={batchInputText}
          onChange={e => setBatchInputText(e.target.value)}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (!isCollecting && hasInputs) {
                void handleSmartBatchCollect();
              }
            }
          }}
          placeholder={`输入商品链接或纯数字 SKU（回车换行，支持 1~20 款）...\n例如：https://item.jd.com/100279945637.html 或天猫/1688商品链接`}
          className="w-full bg-transparent text-[13.5px] font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:outline-none resize-none leading-relaxed min-h-[84px] p-1 selection:bg-indigo-100 dark:selection:bg-indigo-950"
        />
      </div>

      {/* 🌟 底部操作栏：左侧轻量识别状态，右侧纯净圆形发送按钮 */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5 min-w-0">
          {parsedLineCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200/90 shadow-2xs animate-in fade-in duration-150">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>已识别 <strong>{parsedLineCount}</strong> 款商品</span>
            </span>
          )}

          {batchInputText ? (
            <button
              type="button"
              onClick={() => setBatchInputText('')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 text-xs font-semibold border border-slate-200/70 dark:border-white/10 hover:border-rose-200 dark:hover:border-rose-800/60 transition-all cursor-pointer active:scale-95 shadow-2xs"
              title="清空输入框"
            >
              <RotateCcw className="w-3 h-3" />
              <span>清空</span>
            </button>
          ) : null}
        </div>

        {/* 🌟 右侧主动作组：纯净圆形发送按钮 */}
        <div className="flex items-center shrink-0 ml-auto">
          <button
            type="button"
            onClick={handleSmartBatchCollect}
            disabled={isCollecting || !hasInputs}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer select-none active:scale-95 shrink-0 shadow-sm ${
              hasInputs && !isCollecting
                ? 'bg-slate-900 dark:bg-white hover:bg-black dark:hover:bg-slate-200 text-white dark:text-slate-900 hover:shadow-md hover:shadow-slate-900/25 hover:scale-105'
                : 'bg-[#E3E5EB] dark:bg-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            }`}
            title={isCollecting ? '正在智能采编中...' : '开始采编 (⌘ + Enter)'}
            aria-label="智能采编"
          >
            {isCollecting ? (
              <Loader2 className="w-5 h-5 animate-spin text-white dark:text-slate-900" />
            ) : (
              <ArrowUp className="w-5 h-5 stroke-[2.5]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
