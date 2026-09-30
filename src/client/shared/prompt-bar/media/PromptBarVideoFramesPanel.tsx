import { Plus, X, ArrowLeftRight } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { normalizeImageUrlToStandardJpg } from '@shared/domain/media/drawing';
import type { PromptBarRefMediaPanelProps, RefMediaLightboxState } from './refMediaPanelTypes';

type PromptBarVideoFramesPanelProps = Pick<PromptBarRefMediaPanelProps,
  | 'quickGenMode'
  | 'quickVideoRefMode'
  | 'quickVideoFirstFrame'
  | 'quickVideoLastFrame'
  | 'quickVideoMultiFrames'
  | 'setQuickVideoFirstFrame'
  | 'setQuickVideoLastFrame'
  | 'swapVideoFirstLastFrames'
  | 'removeQuickVideoMultiFrame'
  | 'onFirstFrameClick'
  | 'onLastFrameClick'
  | 'onMultiFrameClick'
> & {
  isStrip: boolean;
  setLightboxState: (state: RefMediaLightboxState) => void;
};

export function PromptBarVideoFramesPanel({
  isStrip,
  setLightboxState,
  quickGenMode,
  quickVideoRefMode,
  quickVideoFirstFrame,
  quickVideoLastFrame,
  quickVideoMultiFrames,
  setQuickVideoFirstFrame,
  setQuickVideoLastFrame,
  swapVideoFirstLastFrames,
  removeQuickVideoMultiFrame,
  onFirstFrameClick,
  onLastFrameClick,
  onMultiFrameClick,
}: PromptBarVideoFramesPanelProps) {
  // 1. 视频模式：首尾帧
  if (quickGenMode === 'video' && quickVideoRefMode === 'first_last_frame') {
    if (isStrip) {
      return (
        <div className="w-full flex items-center gap-2 sm:gap-3 overflow-x-auto py-1 scrollbar-none">
          <div className="relative group/first flex-shrink-0">
            {quickVideoFirstFrame ? (
              <div
                onClick={() => {
                  setLightboxState({
                    items: [quickVideoFirstFrame, ...(quickVideoLastFrame ? [quickVideoLastFrame] : [])],
                    currentIndex: 0,
                  });
                }}
                className="relative w-16 h-20 sm:w-18 sm:h-22 rounded-2xl border border-slate-200 shadow-sm bg-white -rotate-[3deg] transition-all group-hover/first:rotate-0 group-hover/first:scale-105 cursor-zoom-in"
                title="点击放大查看首帧"
              >
                <div className="w-full h-full rounded-2xl overflow-hidden pointer-events-none">
                  <img
                    src={normalizeImageUrlToStandardJpg(quickVideoFirstFrame)}
                    alt="首帧"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.dataset.hasRetried && quickVideoFirstFrame) {
                        target.dataset.hasRetried = 'true';
                        target.src = proxyMediaUrl(quickVideoFirstFrame);
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-white shadow-xs pointer-events-none whitespace-nowrap">
                  首帧
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setQuickVideoFirstFrame(null); }}
                  className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/first:opacity-100"
                  title="移除首帧"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.2]" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onFirstFrameClick}
                className="w-16 h-20 sm:w-18 sm:h-22 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-200/90 hover:border-slate-300 text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer -rotate-[3deg] hover:rotate-0 group/card"
                title="上传视频第 1 帧起始图 (首帧)"
              >
                <Plus className="w-5 h-5 group-hover/card:scale-110 transition-transform stroke-[1.8]" />
                <span className="text-[11px] font-bold text-slate-500">首帧</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={swapVideoFirstLastFrames}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all cursor-pointer self-center flex-shrink-0"
            title="交换首尾帧顺序"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>

          <div className="relative group/last flex-shrink-0">
            {quickVideoLastFrame ? (
              <div
                onClick={() => {
                  setLightboxState({
                    items: [...(quickVideoFirstFrame ? [quickVideoFirstFrame] : []), quickVideoLastFrame],
                    currentIndex: quickVideoFirstFrame ? 1 : 0,
                  });
                }}
                className="relative w-16 h-20 sm:w-18 sm:h-22 rounded-2xl border border-slate-200 shadow-sm bg-white rotate-[3deg] transition-all group-hover/last:rotate-0 group-hover/last:scale-105 cursor-zoom-in"
                title="点击放大查看尾帧"
              >
                <div className="w-full h-full rounded-2xl overflow-hidden pointer-events-none">
                  <img
                    src={normalizeImageUrlToStandardJpg(quickVideoLastFrame)}
                    alt="尾帧"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.dataset.hasRetried && quickVideoLastFrame) {
                        target.dataset.hasRetried = 'true';
                        target.src = proxyMediaUrl(quickVideoLastFrame);
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-white shadow-xs pointer-events-none whitespace-nowrap">
                  尾帧
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setQuickVideoLastFrame(null); }}
                  className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/last:opacity-100"
                  title="移除尾帧"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.2]" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onLastFrameClick}
                className="w-16 h-20 sm:w-18 sm:h-22 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-200/90 hover:border-slate-300 text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer rotate-[3deg] hover:rotate-0 group/card"
                title="上传视频结束图 (尾帧)"
              >
                <Plus className="w-5 h-5 group-hover/card:scale-110 transition-transform stroke-[1.8]" />
                <span className="text-[11px] font-bold text-slate-500">尾帧</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 pt-0.5">
        <div className="relative group/first">
          {quickVideoFirstFrame ? (
            <div
              onClick={() => {
                setLightboxState({
                  items: [quickVideoFirstFrame, ...(quickVideoLastFrame ? [quickVideoLastFrame] : [])],
                  currentIndex: 0,
                });
              }}
              className="relative w-15 h-19 sm:w-17 sm:h-21 rounded-2xl border border-slate-200 shadow-sm bg-white -rotate-[4deg] transition-all group-hover/first:rotate-0 group-hover/first:scale-105 cursor-zoom-in"
              title="点击放大查看首帧"
            >
              <div className="w-full h-full rounded-2xl overflow-hidden pointer-events-none">
                <img
                  src={normalizeImageUrlToStandardJpg(quickVideoFirstFrame)}
                  alt="首帧"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.hasRetried && quickVideoFirstFrame) {
                      target.dataset.hasRetried = 'true';
                      target.src = proxyMediaUrl(quickVideoFirstFrame);
                    }
                  }}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-white shadow-xs pointer-events-none whitespace-nowrap">
                首帧
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setQuickVideoFirstFrame(null); }}
                className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/first:opacity-100"
                title="移除首帧"
              >
                <X className="w-3.5 h-3.5 stroke-[2.2]" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onFirstFrameClick}
              className="w-15 h-19 sm:w-17 sm:h-21 rounded-2xl bg-[#F8F9FA] hover:bg-slate-100 border border-slate-200/90 hover:border-slate-300 text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs -rotate-[4deg] hover:rotate-0 group/card"
              title="上传视频第 1 帧起始图 (首帧)"
            >
              <Plus className="w-5 h-5 text-slate-400 group-hover/card:scale-110 transition-transform stroke-[1.8]" />
              <span className="text-[11px] font-bold text-slate-500">首帧</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={swapVideoFirstLastFrames}
          className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all cursor-pointer self-center"
          title="交换首尾帧顺序"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>

        <div className="relative group/last">
          {quickVideoLastFrame ? (
            <div
              onClick={() => {
                setLightboxState({
                  items: [...(quickVideoFirstFrame ? [quickVideoFirstFrame] : []), quickVideoLastFrame],
                  currentIndex: quickVideoFirstFrame ? 1 : 0,
                });
              }}
              className="relative w-15 h-19 sm:w-17 sm:h-21 rounded-2xl border border-slate-200 shadow-sm bg-white rotate-[4deg] transition-all group-hover/last:rotate-0 group-hover/last:scale-105 cursor-zoom-in"
              title="点击放大查看尾帧"
            >
              <div className="w-full h-full rounded-2xl overflow-hidden pointer-events-none">
                <img
                  src={normalizeImageUrlToStandardJpg(quickVideoLastFrame)}
                  alt="尾帧"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.hasRetried && quickVideoLastFrame) {
                      target.dataset.hasRetried = 'true';
                      target.src = proxyMediaUrl(quickVideoLastFrame);
                    }
                  }}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-white shadow-xs pointer-events-none whitespace-nowrap">
                尾帧
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setQuickVideoLastFrame(null); }}
                className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/last:opacity-100"
                title="移除尾帧"
              >
                <X className="w-3.5 h-3.5 stroke-[2.2]" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLastFrameClick}
              className="w-15 h-19 sm:w-17 sm:h-21 rounded-2xl bg-[#F8F9FA] hover:bg-slate-100 border border-slate-200/90 hover:border-slate-300 text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs rotate-[4deg] hover:rotate-0 group/card"
              title="上传视频结束图 (尾帧)"
            >
              <Plus className="w-5 h-5 text-slate-400 group-hover/card:scale-110 transition-transform stroke-[1.8]" />
              <span className="text-[11px] font-bold text-slate-500">尾帧</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2. 视频模式：多帧连续镜头
  if (quickGenMode === 'video' && quickVideoRefMode === 'multi_frame') {
    const multiFrameStrip = (
      <>
        {quickVideoMultiFrames.map((frame, idx) => (
          <div key={idx} className="relative group/mframe flex-shrink-0">
            <div
              onClick={() => {
                setLightboxState({
                  items: quickVideoMultiFrames,
                  currentIndex: idx,
                });
              }}
              className="relative w-15 h-19 sm:w-17 sm:h-21 rounded-2xl border border-slate-200 shadow-sm bg-white transition-all group-hover/mframe:scale-105 cursor-zoom-in"
              title={`点击放大查看第${idx + 1}帧`}
            >
              <div className="w-full h-full rounded-2xl overflow-hidden pointer-events-none">
                <img
                  src={normalizeImageUrlToStandardJpg(frame)}
                  alt={`第${idx + 1}帧`}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.hasRetried && frame) {
                      target.dataset.hasRetried = 'true';
                      target.src = proxyMediaUrl(frame);
                    }
                  }}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-white shadow-xs pointer-events-none whitespace-nowrap">
                第{idx + 1}帧
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeQuickVideoMultiFrame(idx); }}
                className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/mframe:opacity-100"
                title={`删除第${idx + 1}帧`}
              >
                <X className="w-3.5 h-3.5 stroke-[2.2]" />
              </button>
            </div>
          </div>
        ))}

        {quickVideoMultiFrames.length < 10 && (
          <button
            type="button"
            onClick={onMultiFrameClick}
            className={`w-15 h-19 sm:w-17 sm:h-21 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-200/90 hover:border-slate-300 text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs ${
              quickVideoMultiFrames.length === 0 ? '-rotate-[4deg] hover:rotate-0' : ''
            } group/card flex-shrink-0`}
            title={`添加第 ${quickVideoMultiFrames.length + 1} 帧镜头`}
          >
            <Plus className="w-5 h-5 text-slate-400 group-hover/card:scale-110 transition-transform stroke-[1.8]" />
            <span className="text-[11px] font-bold text-slate-500">第{quickVideoMultiFrames.length + 1}帧</span>
          </button>
        )}
      </>
    );

    if (isStrip) {
      return (
        <div className="w-full flex items-center gap-2 sm:gap-3 overflow-x-auto py-1 scrollbar-none">
          {multiFrameStrip}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 flex-shrink-0 pt-0.5 max-w-[340px] overflow-x-auto py-1 scrollbar-none">
        {multiFrameStrip}
      </div>
    );
  }
  return null;
}
