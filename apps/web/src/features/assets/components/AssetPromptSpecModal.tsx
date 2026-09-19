import React from 'react';
import { FileCode, X, Copy } from 'lucide-react';
import { OFFICIAL_REVERSE_SYSTEM_PROMPT } from '../assetPromptConstants';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">
              多模态视觉大反推提示词工程规范 (System Prompt)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-slate-700">
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

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(OFFICIAL_REVERSE_SYSTEM_PROMPT);
              showToast('📋 已复制反推提示词规范');
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>复制反推提示词</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};
export default AssetPromptSpecModal;
