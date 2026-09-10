import React from 'react';
import { Trash2 } from 'lucide-react';

export interface FeedCardActionBarProps {
  onReuse: () => void;
  onRegenerate: () => void;
  isMenuOpen: boolean;
  onToggleMenu: (e: React.MouseEvent) => void;
  onDelete: () => void;
  deleteText?: string;
  regenerateTitle?: string;
  reEditTitle?: string;
  failedCount?: number;
  onClearFailed?: () => void;
}

import { ReEditIcon, RegenerateIcon } from '@/shared/icons';
export { ReEditIcon, RegenerateIcon };

/**
 * 卡片下方胶囊按钮操作栏 (按图2标准设计尺寸重构: 40px 高度、正方形更多按钮、饱满大圆角与冷灰质感底色)
 */
export default function FeedCardActionBar({
  onReuse,
  onRegenerate,
  isMenuOpen,
  onToggleMenu,
  onDelete,
  deleteText = '删除该批次结果',
  regenerateTitle = '再次生成',
  reEditTitle = '重新编辑提示词与参数',
  failedCount = 0,
  onClearFailed,
}: FeedCardActionBarProps) {
  const hasFailed = failedCount > 0 && typeof onClearFailed === 'function';

  return (
    <div className="flex w-max flex-nowrap items-center gap-1 pt-0.5 select-none relative">
      {/* 1. 重新编辑 */}
      <button
        type="button"
        onClick={onReuse}
        className="h-10 px-3.5 rounded-[13px] bg-[#EBEDF0] hover:bg-[#DFE1E6] text-slate-800 text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 shrink-0"
        title={reEditTitle}
      >
        <ReEditIcon className="w-[15px] h-[15px] text-slate-800 shrink-0" />
        <span>重新编辑</span>
      </button>

      {/* 2. 再次生成 */}
      <button
        type="button"
        onClick={onRegenerate}
        className="h-10 px-3.5 rounded-[13px] bg-[#EBEDF0] hover:bg-[#DFE1E6] text-slate-800 text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 shrink-0"
        title={regenerateTitle}
      >
        <RegenerateIcon className="w-[15px] h-[15px] text-slate-800 shrink-0" />
        <span>再次生成</span>
      </button>

      {/* 🌟 3. 清除失败快捷按钮 (当本批次存在失败/未完成卡片时直观显现) */}
      {hasFailed && (
        <button
          type="button"
          onClick={onClearFailed}
          className="h-10 px-3 rounded-[13px] bg-red-50 hover:bg-red-100/90 text-red-600 text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 shrink-0 border border-red-200/60 shadow-2xs"
          title={`一键清除本批次中的 ${failedCount} 个失败/未成功卡片（保留生成成功的图片）`}
        >
          <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span>清除失败 ({failedCount})</span>
        </button>
      )}

      {/* 4. 更多 ··· (正方形 40x40 胶囊按钮) */}
      <div className="relative shrink-0 flex items-center" data-task-menu>
        <button
          type="button"
          onClick={onToggleMenu}
          className={`w-10 h-10 rounded-[13px] text-slate-800 text-[13px] font-medium inline-flex items-center justify-center transition-colors cursor-pointer active:scale-95 ${
            isMenuOpen ? 'bg-[#DFE1E6]' : 'bg-[#EBEDF0] hover:bg-[#DFE1E6]'
          }`}
          title="更多操作"
        >
          {/* 三个实心小黑点 */}
          <span className="flex items-center gap-[3px]">
            <span className="w-1 h-1 rounded-full bg-slate-800 shrink-0" />
            <span className="w-1 h-1 rounded-full bg-slate-800 shrink-0" />
            <span className="w-1 h-1 rounded-full bg-slate-800 shrink-0" />
          </span>
        </button>

        {isMenuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-40 bg-white rounded-2xl shadow-xl border border-slate-100/90 p-1.5 whitespace-nowrap animate-fade-in flex flex-col gap-0.5 min-w-[140px]"
          >
            {hasFailed && (
              <button
                type="button"
                onClick={onClearFailed}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-red-600 hover:bg-red-50 font-medium transition-colors cursor-pointer group/clearFail text-left"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span>清除未成功卡片 ({failedCount})</span>
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-slate-700 hover:text-red-600 hover:bg-slate-50 font-medium transition-colors cursor-pointer group/del text-left"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-400 group-hover/del:text-red-600 transition-colors shrink-0" />
              <span>{deleteText}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
