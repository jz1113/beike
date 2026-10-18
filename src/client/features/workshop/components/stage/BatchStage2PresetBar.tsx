import React from 'react';
import { Camera, Settings2, CheckCircle2 } from 'lucide-react';

export interface BatchStage2PresetBarProps {
  recipes: Array<{ id: string; name: string }>;
  selectedArchId: string;
  selectedShotCount: number;
  selectedAspect: string;
  selectedVisionModel: string;
  availableVisionModels: Array<{ id: string; name?: string; shortName?: string }>;
  selectedImageGenModel: string;
  availableImageModels: Array<{ id: string; name?: string; shortName?: string }>;
  onOpenSettings: () => void;
  readyCount: number;
  totalCount: number;
}

export const BatchStage2PresetBar: React.FC<BatchStage2PresetBarProps> = ({
  recipes,
  selectedArchId,
  selectedShotCount,
  selectedAspect,
  selectedVisionModel,
  availableVisionModels,
  selectedImageGenModel,
  availableImageModels,
  onOpenSettings,
  readyCount,
  totalCount,
}) => {
  const currentArchName = selectedArchId === 'auto'
    ? '自动按商品类目匹配'
    : recipes.find(r => r.id === selectedArchId)?.name || '未确认拍摄架构';
  const currentVisionName = availableVisionModels.find(m => m.id === selectedVisionModel)?.shortName ||
    availableVisionModels.find(m => m.id === selectedVisionModel)?.name ||
    selectedVisionModel;
  const currentImageName = availableImageModels.find(m => m.id === selectedImageGenModel)?.shortName ||
    availableImageModels.find(m => m.id === selectedImageGenModel)?.name ||
    selectedImageGenModel;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-transparent border border-slate-200/60 text-xs select-none dark:border-white/10">
      {/* 左侧：微参数透视胶囊 */}
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="flex items-center gap-1.5 font-bold text-slate-800 shrink-0 dark:text-slate-100">
          <Camera className="w-3.5 h-3.5 text-indigo-600" />
          <span>当前生产预设:</span>
        </span>

        <span 
          className="px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200/70 font-bold text-indigo-700 truncate max-w-[200px] sm:max-w-[260px] shadow-2xs"
          title={currentArchName}
        >
          {currentArchName}
        </span>

        <span className="text-slate-300">·</span>
        <span className="font-semibold text-slate-700 whitespace-nowrap dark:text-slate-200">{selectedShotCount} 镜</span>

        <span className="text-slate-300">·</span>
        <span className="font-semibold text-slate-700 whitespace-nowrap dark:text-slate-200">{selectedAspect}</span>

        <span className="text-slate-300">·</span>
        <span className="font-semibold text-slate-700 whitespace-nowrap dark:text-slate-200">出镜按图组母本</span>

        <span className="text-slate-300 hidden md:inline">·</span>
        <span className="text-slate-400 font-medium hidden md:inline truncate max-w-[140px]" title={`视觉模型: ${currentVisionName}`}>
          视觉: {currentVisionName}
        </span>

        <span className="text-slate-300 hidden lg:inline">·</span>
        <span className="text-slate-400 font-medium hidden lg:inline truncate max-w-[140px]" title={`生图引擎: ${currentImageName}`}>
          生图: {currentImageName}
        </span>
      </div>

      {/* 右侧：就绪状态与设置入口 */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden sm:flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60 dark:text-slate-400 dark:bg-white/5 dark:border-white/10">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>已选图 <strong className="text-slate-900 font-mono dark:text-slate-100">{readyCount}/{totalCount}</strong> 款</span>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 font-bold text-xs transition-all cursor-pointer shadow-2xs active:scale-96 dark:bg-white/5 dark:border-white/10"
          title="调整工坊全局拍摄预设与大模型"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>调整预设</span>
        </button>
      </div>
    </div>
  );
};
