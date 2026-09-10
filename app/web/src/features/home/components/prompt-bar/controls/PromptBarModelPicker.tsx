import { RefObject } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { QuickGenMode } from '@beike/shared/depthVideo';
import { clampVideoDuration } from '@beike/shared/video';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { densityComposerPill } from '@/shared/ui/layoutClasses';
const cleanModelName = (name: string = '') => name.replace(/\s*[（(]标准[）)]/g, '').trim();

interface ModelLike {
  id: string;
  name: string;
  provider?: string;
  badge?: string;
  isPrimary?: boolean;
  isVip?: boolean;
}

interface Props {
  isUp: boolean;
  quickGenMode: QuickGenMode;
  showModelDropdown: boolean;
  setShowModelDropdown: (v: boolean) => void;
  modelDropdownRef: RefObject<HTMLDivElement | null>;
  activeVideoModelObj: ModelLike;
  activeImageModelObj: ModelLike;
  availableVideoModels: ModelLike[];
  availableImageModels: ModelLike[];
  quickVideoModel: string;
  quickModel: string;
  quickVideoDuration: number;
  setQuickVideoModel: (id: string) => void;
  setQuickVideoDuration: (n: number) => void;
  setQuickModel: (id: string) => void;
}

export default function PromptBarModelPicker({
  isUp,
  quickGenMode,
  showModelDropdown,
  setShowModelDropdown,
  modelDropdownRef,
  activeVideoModelObj,
  activeImageModelObj,
  availableVideoModels,
  availableImageModels,
  quickVideoModel,
  quickModel,
  quickVideoDuration,
  setQuickVideoModel,
  setQuickVideoDuration,
  setQuickModel,
}: Props) {
  return (
    <div className="relative" ref={modelDropdownRef}>
      <button
        type="button"
        onClick={() => setShowModelDropdown(!showModelDropdown)}
        className={`${densityComposerPill} rounded-2xl font-semibold flex items-center gap-1.5 xl:gap-2.5 border-0 transition-all cursor-pointer ${
          showModelDropdown
            ? 'bg-slate-100 text-slate-950 shadow-none'
            : 'bg-transparent hover:bg-slate-50 text-slate-800 shadow-none'
        }`}
      >
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {getModelIcon(quickGenMode === 'video' ? activeVideoModelObj.id : activeImageModelObj.id, "w-5 h-5")}
        </div>
        <span className="truncate max-w-[110px] sm:max-w-[180px] lg:max-w-[240px] xl:max-w-[320px] inline-block font-medium">
          {cleanModelName(quickGenMode === 'video' ? activeVideoModelObj.name : activeImageModelObj.name)}
        </span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
      </button>

      {/* 模型选择弹窗 (视频模型 vs 图片模型 - 紧凑上下文菜单) */}
      {showModelDropdown && (
        <div className={`absolute left-0 ${isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-1.5 origin-top'} w-60 sm:w-68 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl p-1.5 sm:p-2 z-50 animate-fade-in space-y-1 text-left`}>
          <div className="px-2 py-1 text-[10.5px] text-slate-400 font-medium border-b border-slate-100/80 pb-1 mb-0.5 flex items-center justify-between">
            <span>{quickGenMode === 'video' ? '旗舰视频模型' : '高保真生图模型'}</span>
            <span className="text-[9.5px] text-slate-300 font-mono">
              {quickGenMode === 'video' ? `${availableVideoModels.length} 个可用` : `${availableImageModels.length} 个可用`}
            </span>
          </div>

          {/* 视频模型列表 */}
          {quickGenMode === 'video' ? (
            <div className="space-y-0.5 max-h-[min(16rem,calc(100dvh-260px))] overflow-y-auto scroll-contain pr-0.5">
              {availableVideoModels.map(m => {
                const isSelected = quickVideoModel === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setQuickVideoModel(m.id);
                      try {
                        localStorage.setItem('ai_video_gen_model', m.id);
                      } catch {}
                      const snapped = clampVideoDuration(m.id, quickVideoDuration);
                      setQuickVideoDuration(snapped);
                      setShowModelDropdown(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer group ${
                      isSelected
                        ? 'bg-slate-100/90 text-slate-950 font-bold shadow-2xs'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-5 h-5 bg-transparent flex items-center justify-center shrink-0 p-0.5 group-hover:scale-105 transition-transform">
                        {getModelIcon(m.id, "w-3.5 h-3.5")}
                      </div>
                      <span className="truncate text-[11.5px] sm:text-xs font-semibold text-slate-800 group-hover:text-slate-950">{cleanModelName(m.name)}</span>
                    </div>

                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-slate-900 stroke-[2.5] shrink-0 ml-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : availableImageModels.length === 0 ? (
            <div className="px-2.5 py-4 text-center space-y-1">
              <p className="text-xs font-semibold text-slate-700">暂无已启用的生图模型</p>
              <p className="text-[10px] text-slate-400 leading-tight">
                请在设置中配置网关拉取模型
              </p>
            </div>
          ) : (
            /* 图片模型列表 */
            <div className="space-y-0.5 max-h-[min(16rem,calc(100dvh-260px))] overflow-y-auto scroll-contain pr-0.5">
              {availableImageModels.map(m => {
                const isSelected = quickModel === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setQuickModel(m.id);
                      try {
                        localStorage.setItem('ai_image_gen_model', m.id);
                      } catch {}
                      setShowModelDropdown(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer group ${
                      isSelected
                        ? 'bg-slate-100/90 text-slate-950 font-bold shadow-2xs'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-5 h-5 bg-transparent flex items-center justify-center shrink-0 p-0.5 group-hover:scale-105 transition-transform">
                        {getModelIcon(m.id, "w-3.5 h-3.5")}
                      </div>
                      <span className="truncate text-[11.5px] sm:text-xs font-semibold text-slate-800 group-hover:text-slate-950">{cleanModelName(m.name)}</span>
                    </div>

                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-slate-900 stroke-[2.5] shrink-0 ml-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
