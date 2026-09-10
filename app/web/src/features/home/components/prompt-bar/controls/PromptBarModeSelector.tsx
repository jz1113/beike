import type { RefObject } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { densityComposerPill } from '@/shared/ui/layoutClasses';
import {
  DepthImageModeIcon,
  DepthVideoModeIcon,
  ImageGenModeIcon,
  VideoGenModeIcon,
} from '@/shared/ui/GenModeIcons';
import type { QuickGenMode } from '@beike/domain/depthVideo';

interface PromptBarModeSelectorProps {
  isUp: boolean;
  quickGenMode: QuickGenMode;
  isDepthMode: boolean;
  isOpen: boolean;
  onToggle: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  modeButtonClass: string;
  onSelectMode: (mode: QuickGenMode) => void;
}

export default function PromptBarModeSelector({
  isUp,
  quickGenMode,
  isDepthMode,
  isOpen,
  onToggle,
  menuRef,
  modeButtonClass,
  onSelectMode,
}: PromptBarModeSelectorProps) {
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        className={`${densityComposerPill} rounded-2xl font-semibold flex items-center gap-1 xl:gap-2 transition-all cursor-pointer border-0 shrink-0 ${modeButtonClass}`}
      >
        {quickGenMode === 'video' ? (
          <>
            <VideoGenModeIcon className="w-4 h-4 text-cyan-600" />
            <span className="hidden sm:inline">视频生成</span>
            <span className="sm:hidden">视频</span>
          </>
        ) : isDepthMode ? (
          <>
            {quickGenMode === 'depth-image' ? (
              <DepthImageModeIcon />
            ) : (
              <DepthVideoModeIcon />
            )}
            <span className="hidden sm:inline">
              {quickGenMode === 'depth-image' ? '深度图片' : '深度视频'}
            </span>
            <span className="sm:hidden">深度</span>
          </>
        ) : (
          <>
            <ImageGenModeIcon className="w-4 h-4 text-sky-600" />
            <span className="hidden sm:inline">图片生成</span>
            <span className="sm:hidden">图片</span>
          </>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5" />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 ${
            isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
          } w-40 sm:w-44 xl:w-48 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-1 sm:p-1.5 z-50 animate-fade-in text-left space-y-0.5 sm:space-y-1`}
        >
          <button
            type="button"
            onClick={() => onSelectMode('image')}
            className={`w-full px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
              quickGenMode === 'image'
                ? 'bg-slate-100/90 text-slate-950 font-bold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 sm:gap-2.5">
              <ImageGenModeIcon className="w-4 h-4 text-slate-800" />
              <span className="text-xs sm:text-[13.5px] font-medium text-slate-900">
                图片生成
              </span>
            </div>
            {quickGenMode === 'image' && (
              <Check className="w-3.5 h-3.5 text-slate-900 stroke-[2.5] flex-shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('video')}
            className={`w-full px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
              quickGenMode === 'video'
                ? 'bg-slate-100/90 text-slate-950 font-bold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 sm:gap-2.5">
              <VideoGenModeIcon className="w-4 h-4 text-slate-800" />
              <span className="text-xs sm:text-[13.5px] font-medium text-slate-900">
                视频生成
              </span>
            </div>
            {quickGenMode === 'video' && (
              <Check className="w-3.5 h-3.5 text-slate-900 stroke-[2.5] flex-shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('depth-image')}
            className={`w-full px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
              quickGenMode === 'depth-image'
                ? 'bg-violet-50/90 text-violet-950 font-bold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 sm:gap-2.5">
              <DepthImageModeIcon />
              <span className="text-xs sm:text-[13.5px] font-medium text-slate-900">
                深度图片
              </span>
            </div>
            {quickGenMode === 'depth-image' && (
              <Check className="w-3.5 h-3.5 text-violet-700 stroke-[2.5] flex-shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('depth-video')}
            className={`w-full px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
              quickGenMode === 'depth-video'
                ? 'bg-violet-50/90 text-violet-950 font-bold'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 sm:gap-2.5">
              <DepthVideoModeIcon />
              <span className="text-xs sm:text-[13.5px] font-medium text-slate-900">
                深度视频
              </span>
            </div>
            {quickGenMode === 'depth-video' && (
              <Check className="w-3.5 h-3.5 text-violet-700 stroke-[2.5] flex-shrink-0" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
