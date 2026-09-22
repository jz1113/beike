import React from 'react';
import { FileCode, X, Copy } from 'lucide-react';
import { OFFICIAL_REVERSE_SYSTEM_PROMPT } from '../utils/assetPromptConstants';

export interface AssetPromptSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const AssetPromptSpecModal: React.FC<AssetPromptSpecModalProps> = ({
  isOpen,
  onClose,
  showToast,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px] animate-in fade-in duration-150">
      <section role="dialog" aria-modal="true" aria-label="反推提示词工程规范" className="relative flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)]">
        <header className="flex shrink-0 items-center justify-between gap-5 border-b border-slate-100 px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-rose-100"><FileCode className="h-3.5 w-3.5 text-rose-500" /></span>
            <h3 className="text-sm font-black tracking-tight">
              多模态视觉大反推提示词工程规范 (System Prompt)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto space-y-4 px-5 py-4 text-xs text-slate-700 sm:px-6">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
            <p className="text-slate-500 mb-2 font-medium">
              系统在接收您投入的成套图集/文件夹时，会将图片输入旗舰视觉模型（如 Gemini 3.7 Flash / GPT-5.6 Luna），并运行如下完整逆向提示词：
            </p>
            <pre className="p-3 bg-slate-900 text-amber-200 rounded-xl text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono select-text">
              {OFFICIAL_REVERSE_SYSTEM_PROMPT}
            </pre>
          </div>

          <div className="p-3.5 bg-amber-50/60 border border-amber-200/60 rounded-xl text-[11px] text-amber-900">
            <strong>💡 核心解构原则：</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>
                <strong>单次多模态</strong>：一次视觉调用完成逐图反推与原子资产聚合，仅输出中文 prompt；
              </li>
              <li>
                <strong>九维先行</strong>：先填 dimensions 九维分析，再撰写 ≥180 字分段中文提示词；
              </li>
              <li>
                <strong>分类专维</strong>：摄影类还原焦段/光型/景深，风景类还原时段/天空/植被；
              </li>
              <li>
                <strong>复刻预期</strong>：反推产出高保真可生图正向提示词，配合参考图 img2img 可达更高还原度。
              </li>
            </ul>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(OFFICIAL_REVERSE_SYSTEM_PROMPT);
              showToast('📋 已复制反推提示词规范');
            }}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-white hover:text-slate-800 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>复制反推提示词</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 cursor-pointer"
          >
            确定
          </button>
        </footer>
      </section>
    </div>
  );
};
export default AssetPromptSpecModal;
