import { RefObject } from 'react';
import { Check, ChevronDown, Film, Clock } from 'lucide-react';
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_REF_MODES,
  VIDEO_RESOLUTIONS,
  clampVideoDuration,
} from '@beike/domain/video';
import { densityComposerPill } from '@/shared/ui/layoutClasses';
import '../../../utils/modelDisplayHelpers';

interface VideoModelLike {
  id: string;
  shortName?: string;
}

interface VideoRefModeLike {
  id: string;
  name: string;
}

interface VideoRatioLike {
  id: string;
  label: string;
  iconType: string;
}

interface Props {
  isUp: boolean;
  /** 参考模式药丸 */
  showVideoRefModeDropdown: boolean;
  setShowVideoRefModeDropdown: (v: boolean) => void;
  videoRefModeDropdownRef: RefObject<HTMLDivElement | null>;
  activeVideoRefModeObj: VideoRefModeLike;
  quickVideoRefMode: string;
  setQuickVideoRefMode: (id: string) => void;
  /** 比例/分辨率/数量面板内容（嵌入父级 aspect 弹窗） */
  renderParamsPanel?: boolean;
  quickVideoAspectId: string;
  setQuickVideoAspectId: (id: string) => void;
  quickVideoResolution: '480P' | '720P' | '1080P' | '4K';
  setQuickVideoResolution: (r: '480P' | '720P' | '1080P' | '4K') => void;
  quickVideoCount: number;
  setQuickVideoCount: (n: number) => void;
  /** 时长药丸 */
  showDurationDropdown: boolean;
  setShowDurationDropdown: (v: boolean) => void;
  durationDropdownRef: RefObject<HTMLDivElement | null>;
  quickVideoDuration: number;
  setQuickVideoDuration: (n: number) => void;
  videoDurationBounds: { min: number; max: number };
  activeVideoModelObj: VideoModelLike;
  quickVideoModel: string;
  /** 触发按钮上的比例摘要（由父级 aspect 药丸使用时可忽略） */
  activeVideoRatioObj?: VideoRatioLike;
}

/** 视频模式：参考模式药丸 + 参数面板内容 + 时长药丸 */
export function PromptBarVideoParamsPanel({
  quickVideoAspectId,
  setQuickVideoAspectId,
  quickVideoResolution,
  setQuickVideoResolution,
  quickVideoCount,
  setQuickVideoCount,
}: Pick<
  Props,
  | 'quickVideoAspectId'
  | 'setQuickVideoAspectId'
  | 'quickVideoResolution'
  | 'setQuickVideoResolution'
  | 'quickVideoCount'
  | 'setQuickVideoCount'
>) {
  return (
    <>
      {/* Section 1: 选择比例 */}
      <div className="space-y-1.5 sm:space-y-2.5">
        <div className="text-[11px] sm:text-xs xl:text-sm font-bold text-slate-700">选择比例</div>
        <div className="flex items-center justify-between gap-1 sm:gap-1.5 overflow-x-auto pb-1">
          {VIDEO_ASPECT_RATIOS.map(r => {
            const isSelected = quickVideoAspectId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setQuickVideoAspectId(r.id)}
                className={`flex flex-col items-center justify-center p-1.5 sm:p-2 xl:p-2.5 rounded-xl sm:rounded-2xl transition-all cursor-pointer min-w-[40px] sm:min-w-[48px] flex-1 ${
                  isSelected
                    ? 'bg-slate-100 border border-slate-400 text-slate-900 font-bold shadow-xs'
                    : 'hover:bg-slate-50 text-slate-500 hover:text-slate-800'
                }`}
              >
                <div className="h-5.5 w-5.5 sm:h-6 sm:w-6 xl:h-7 xl:w-7 flex items-center justify-center text-current">
                  {r.iconType === 'ultrawide' && (
                    <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 xl:w-6 xl:h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="1" y="8" width="22" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'wide169' && (
                    <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 xl:w-6 xl:h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="7" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'wide43' && (
                    <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 xl:w-6 xl:h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'square' && (
                    <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 xl:w-6 xl:h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="4.5" y="4.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'tall34' && (
                    <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 xl:w-6 xl:h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'tall916' && (
                    <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 xl:w-6 xl:h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                </div>
                <span className="text-[10px] sm:text-xs mt-1 sm:mt-1.5 font-mono font-semibold">{r.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: 选择分辨率 */}
      <div className="space-y-1.5 sm:space-y-2.5">
        <div className="text-[11px] sm:text-xs xl:text-sm font-bold text-slate-700">选择分辨率</div>
        <div className="bg-slate-100/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl flex items-center gap-1 sm:gap-1.5">
          {VIDEO_RESOLUTIONS.map(res => {
            const isSelected = quickVideoResolution === res;
            return (
              <button
                key={res}
                type="button"
                onClick={() => setQuickVideoResolution(res)}
                className={`flex-1 py-1.5 sm:py-2 xl:py-2.5 text-xs sm:text-[13px] xl:text-sm font-mono font-bold rounded-lg sm:rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{res}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: 选择生成数量 */}
      <div className="space-y-1.5 sm:space-y-2.5">
        <div className="text-[11px] sm:text-xs xl:text-sm font-bold text-slate-700">选择生成数量</div>
        <div className="bg-slate-100/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl flex items-center gap-1 sm:gap-1.5">
          {[1, 2, 3, 4].map(num => {
            const isSelected = quickVideoCount === num;
            return (
              <button
                key={num}
                type="button"
                onClick={() => setQuickVideoCount(num)}
                className={`flex-1 py-1.5 sm:py-2 text-xs sm:text-[13px] xl:text-sm font-mono font-bold rounded-lg sm:rounded-xl transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {num}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** 视频模式：参考模式药丸（首尾帧 / 单图运镜 / 复杂多图） */
export function PromptBarVideoRefModePill({
  isUp,
  showVideoRefModeDropdown,
  setShowVideoRefModeDropdown,
  videoRefModeDropdownRef,
  activeVideoRefModeObj,
  quickVideoRefMode,
  setQuickVideoRefMode,
}: Pick<
  Props,
  | 'isUp'
  | 'showVideoRefModeDropdown'
  | 'setShowVideoRefModeDropdown'
  | 'videoRefModeDropdownRef'
  | 'activeVideoRefModeObj'
  | 'quickVideoRefMode'
  | 'setQuickVideoRefMode'
>) {
  return (
    <div className="relative" ref={videoRefModeDropdownRef}>
      <button
        type="button"
        onClick={() => setShowVideoRefModeDropdown(!showVideoRefModeDropdown)}
        className={`${densityComposerPill} rounded-2xl font-semibold flex items-center gap-1 xl:gap-2.5 border-0 transition-all cursor-pointer ${
          showVideoRefModeDropdown
            ? 'bg-slate-100 text-slate-950 shadow-none'
            : 'bg-transparent hover:bg-slate-50 text-slate-800 shadow-none'
        }`}
      >
        <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-80 text-current shrink-0" />
        <span className="font-mono text-xs sm:text-xs xl:text-sm">{activeVideoRefModeObj.name}</span>
        <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-60 shrink-0" />
      </button>

      {/* 参考模式下拉弹窗 */}
      {showVideoRefModeDropdown && (
        <div className={`absolute left-0 ${isUp ? 'bottom-full mb-2 sm:mb-3 origin-bottom' : 'top-full mt-2 origin-top'} w-[min(280px,calc(100vw-2rem))] sm:w-72 rounded-2xl sm:rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-2 sm:p-2.5 z-50 animate-fade-in space-y-0.5 sm:space-y-1 text-left`}>
          <div className="px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-slate-400 border-b border-slate-100 pb-1.5 sm:pb-2 mb-1">
            选择视频参考模式
          </div>

          {VIDEO_REF_MODES.map(mode => {
            const isSelected = quickVideoRefMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setQuickVideoRefMode(mode.id);
                  setShowVideoRefModeDropdown(false);
                }}
                className={`w-full text-left p-2 sm:p-2.5 rounded-xl sm:rounded-2xl text-xs transition-all cursor-pointer group ${
                  isSelected
                    ? 'bg-slate-50 border border-slate-300 text-slate-900 shadow-xs'
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <span className="font-extrabold text-[11px] sm:text-xs text-slate-900">{mode.name}</span>
                    {mode.tag && (
                      <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500 text-[8.5px] sm:text-[9px] font-bold">
                        {mode.tag}
                      </span>
                    )}
                    {mode.badge && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[8.5px] sm:text-[9px] font-bold">
                        {mode.badge}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-900 stroke-[2.5]" />}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-snug">
                  {mode.desc}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PromptBarVideoDurationPill({
  isUp,
  showDurationDropdown,
  setShowDurationDropdown,
  durationDropdownRef,
  quickVideoDuration,
  setQuickVideoDuration,
  videoDurationBounds,
  activeVideoModelObj,
  quickVideoModel,
}: Pick<
  Props,
  | 'isUp'
  | 'showDurationDropdown'
  | 'setShowDurationDropdown'
  | 'durationDropdownRef'
  | 'quickVideoDuration'
  | 'setQuickVideoDuration'
  | 'videoDurationBounds'
  | 'activeVideoModelObj'
  | 'quickVideoModel'
>) {
  return (
    <div className="relative" ref={durationDropdownRef}>
      <button
        type="button"
        onClick={() => setShowDurationDropdown(!showDurationDropdown)}
        className={`${densityComposerPill} rounded-2xl font-semibold flex items-center gap-1 xl:gap-2.5 border-0 transition-all cursor-pointer ${
          showDurationDropdown
            ? 'bg-slate-100 text-slate-950 shadow-none'
            : 'bg-transparent hover:bg-slate-50 text-slate-800 shadow-none'
        }`}
      >
        <Clock className="w-3.5 h-3.5 opacity-80 text-current" />
        <span className="font-mono text-xs font-bold">{quickVideoDuration}s</span>
      </button>

      {/* 时长选择器弹窗 */}
      {showDurationDropdown && (
        <div className={`absolute left-0 ${isUp ? 'bottom-full mb-2 sm:mb-3 origin-bottom' : 'top-full mt-2 origin-top'} w-[min(320px,calc(100vw-2rem))] sm:w-80 md:w-96 rounded-2xl sm:rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-3 sm:p-4 md:p-5 z-50 animate-fade-in text-left select-none`}>
          <div className="text-[11px] sm:text-xs font-semibold text-slate-500 mb-2.5 sm:mb-3.5">
            选择视频生成时长
            <span className="ml-1.5 text-slate-400 font-normal text-[10px] sm:text-[11px]">
              ({videoDurationBounds.min}–{videoDurationBounds.max}s · {activeVideoModelObj?.shortName || '当前模型'})
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* 滑块区域 */}
            <div className="flex-1 relative pb-3.5 sm:pb-4">
              {/* 滑轨容器 */}
              <div className="relative w-full h-2 rounded-full bg-slate-100 overflow-visible flex items-center">
                {/* 激活进度 */}
                <div
                  className="h-full rounded-full bg-slate-300 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, ((quickVideoDuration - videoDurationBounds.min) / Math.max(1, videoDurationBounds.max - videoDurationBounds.min)) * 100))}%` }}
                />
                {/* 滑块按键 */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-slate-300 shadow-sm pointer-events-none transition-all"
                  style={{ left: `calc(${Math.min(100, Math.max(0, ((quickVideoDuration - videoDurationBounds.min) / Math.max(1, videoDurationBounds.max - videoDurationBounds.min)) * 100))}% - 7px)` }}
                />
                {/* 刻度点 */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2 bg-slate-200 pointer-events-none rounded-xs" />
                <div className="absolute left-[33.3%] top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-slate-300 pointer-events-none rounded-xs" />
                <div className="absolute left-[66.6%] top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-slate-300 pointer-events-none rounded-xs" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-2 bg-slate-200 pointer-events-none rounded-xs" />
              </div>

              {/* 原生滑块响应拖动与点击 */}
              <input
                type="range"
                min={videoDurationBounds.min}
                max={videoDurationBounds.max}
                step="1"
                value={Math.min(videoDurationBounds.max, Math.max(videoDurationBounds.min, quickVideoDuration))}
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10) || videoDurationBounds.min;
                  const next = clampVideoDuration(activeVideoModelObj?.id || quickVideoModel, raw);
                  setQuickVideoDuration(next);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              {/* 刻度数字 */}
              <div className="absolute -bottom-1 inset-x-0 flex justify-between text-[10px] sm:text-[11px] font-mono text-slate-400 font-medium pointer-events-none">
                <span>{videoDurationBounds.min}</span>
                <span>{Math.round((videoDurationBounds.min + videoDurationBounds.max) / 2)}</span>
                <span>{videoDurationBounds.max}</span>
              </div>
            </div>

            {/* 右侧数值卡片 (例如: 4 s) */}
            <div className="w-13 h-8 sm:w-16 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-100/90 border border-slate-200/60 flex items-center justify-center gap-0.5 sm:gap-1 shadow-2xs flex-shrink-0">
              <span className="font-extrabold text-slate-900 text-xs sm:text-sm font-mono">{quickVideoDuration}</span>
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">s</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
