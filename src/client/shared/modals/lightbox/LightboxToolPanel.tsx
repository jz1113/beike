import React from 'react';
import { Image as ImageIcon, Compass, Wand2, Maximize2, RotateCcw, RotateCw } from 'lucide-react';
import type { GenerationTask } from '@client/store';

export interface LightboxToolPanelProps {
  previewTask: GenerationTask;
  isVideo: boolean;
  isCurrentRefImage?: boolean;
  onUseAsReference?: () => void;
  onReEdit?: () => void;
  onRegenerate?: () => void;
  onToolAction?: (actionKey: string, label: string) => void;
}

export const LightboxToolPanel = React.memo(function LightboxToolPanel({ isVideo, isCurrentRefImage = false, onUseAsReference, onReEdit, onRegenerate, onToolAction }: LightboxToolPanelProps) {
  const handleAction = (key: string, label: string) => {
    if (onToolAction) {
      onToolAction(key, label);
    }
  };

  return (
    <div className="w-full space-y-2.5 select-none animate-fade-in">
      {/* 🌟 卡片 1: 快捷工作流卡片 (用作参考图) */}
      <div className="bg-white rounded-2xl p-3 border border-slate-100/90 shadow-xs">
        {/* 用作参考图 */}
        <button
          type="button"
          onClick={onUseAsReference}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer group active:scale-98 ${
            isCurrentRefImage
              ? 'bg-[#F2F3F5] text-slate-900 font-semibold shadow-2xs'
              : 'text-slate-800 hover:bg-slate-50'
          }`}
          title={isCurrentRefImage ? '当前画面已在底栏参考素材中' : '将当前画面作为提示词输入框的参考素材'}
        >
          <ImageIcon className={`w-4 h-4 shrink-0 stroke-[1.8] ${isCurrentRefImage ? 'text-black' : 'text-slate-700 group-hover:text-black'}`} />
          <span>{isVideo ? '用作参考素材' : '用作参考图'}</span>
        </button>
      </div>

      {/* 🌟 卡片 2: AI 图像编辑工具箱矩阵 (多角度、智能改图、扩图) */}
      {!isVideo && <div className="bg-white rounded-2xl p-3 border border-slate-100/90 shadow-xs">
        <div className="grid grid-cols-3 gap-1.5">
          {/* 多角度 (带 new 标签) */}
          <button
            type="button"
            onClick={() => handleAction('multi_angle', '多角度')}
            className="flex items-center justify-center gap-1 px-1.5 py-2 rounded-xl text-slate-800 hover:bg-slate-50 text-[12.5px] font-medium transition-all cursor-pointer group active:scale-98"
          >
            <Compass className="w-4 h-4 text-slate-700 group-hover:text-black shrink-0 stroke-[1.8]" />
            <span className="truncate">多角度</span>
            <span className="px-1 py-0.2 rounded bg-sky-100 text-sky-600 text-[9px] font-bold leading-tight uppercase shrink-0">
              New
            </span>
          </button>

          {/* 智能改图 */}
          <button
            type="button"
            onClick={() => handleAction('smart_edit', '智能改图')}
            className="flex items-center justify-center gap-1.5 px-1.5 py-2 rounded-xl text-slate-800 hover:bg-slate-50 text-[12.5px] font-medium transition-all cursor-pointer group active:scale-98"
          >
            <Wand2 className="w-4 h-4 text-slate-700 group-hover:text-black shrink-0 stroke-[1.8]" />
            <span className="truncate">智能改图</span>
          </button>

          {/* 扩图 (更换比例) */}
          <button
            type="button"
            onClick={() => handleAction('outpaint', '扩图')}
            className="flex items-center justify-center gap-1.5 px-1.5 py-2 rounded-xl text-slate-800 hover:bg-slate-50 text-[12.5px] font-medium transition-all cursor-pointer group active:scale-98"
          >
            <Maximize2 className="w-4 h-4 text-slate-700 group-hover:text-black shrink-0 stroke-[1.8]" />
            <span className="truncate">扩图</span>
          </button>
        </div>
      </div>}

      {/* 🌟 卡片 3: 底部快捷操作 (重新编辑、再次生成) */}
      <div className="bg-white rounded-2xl p-3 border border-slate-100/90 shadow-xs">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onReEdit}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-slate-800 hover:bg-slate-50 text-[13px] font-medium transition-all cursor-pointer active:scale-98"
            title="重新填入提示词进行编辑"
          >
            <RotateCcw className="w-4 h-4 text-slate-700 shrink-0 stroke-[1.8]" />
            <span>重新编辑</span>
          </button>

          <button
            type="button"
            onClick={onRegenerate}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-slate-800 hover:bg-slate-50 text-[13px] font-medium transition-all cursor-pointer active:scale-98"
            title="以当前参数再次提交生成"
          >
            <RotateCw className="w-4 h-4 text-slate-700 shrink-0 stroke-[1.8]" />
            <span>再次生成</span>
          </button>
        </div>
      </div>
    </div>
  );
});

export default LightboxToolPanel;
