import type { RefObject, SyntheticEvent } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { openExternalUrl } from '@client/shared/media/downloadMedia';
import type { GenerationTask } from '@client/store/appStoreTypes';

interface Props {
  previewTask: GenerationTask;
  isVideo: boolean;
  total: number;
  currentIndex: number;
  handlePrev: () => void;
  handleNext: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  currentVideoSrc: string;
  videoLoadFailed: boolean;
  isVideoLoading: boolean;
  isImageLoading: boolean;
  handleVideoCanPlay: () => void;
  handleVideoDuration: (event: SyntheticEvent<HTMLVideoElement>) => void;
  handleVideoError: () => void;
  setIsVideoLoading: (value: boolean) => void;
  setIsImageLoading: (value: boolean) => void;
}

export function LightboxMediaPanel({
  previewTask, isVideo, total, currentIndex, handlePrev, handleNext,
  videoRef, currentVideoSrc, videoLoadFailed, isVideoLoading, isImageLoading,
  handleVideoCanPlay, handleVideoDuration, handleVideoError,
  setIsVideoLoading, setIsImageLoading,
}: Props) {
  const resultUrl = previewTask.resultUrl;
  if (!resultUrl) return null;

  return (
    <div className="relative flex items-center justify-center flex-1 max-w-full md:max-w-[calc(100%-420px)] h-[50vh] md:h-[80vh] gap-3 sm:gap-5 lg:gap-7 min-w-0 pointer-events-none">
      {/* 左侧外侧翻页按键 (稍微在往外一点，脱离图片) */}
      {total > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
          className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all cursor-pointer shadow-xl hover:scale-110 active:scale-95 z-20 group pointer-events-auto"
          title="上一张 (←)"
        >
          <ChevronLeft className="w-6 h-6 stroke-[2.2] group-hover:-translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* 中间媒体展示区 */}
      <div className="relative flex flex-col items-center justify-center h-full max-w-full min-w-0 flex-1 pointer-events-none">
        <div
          className="w-full flex-1 flex items-center justify-center overflow-hidden min-h-0 relative group/view pointer-events-auto"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {isVideo ? (
            <div className="relative max-h-full max-w-full inline-flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl">
              {/* 🌟 紧密贴合视频左上角「AI生成」标识 (对齐图 1 原版，随视频居中紧密贴合) */}
              {!videoLoadFailed && (
                <div className="absolute top-3 left-3 z-30 px-2 py-0.5 rounded bg-black/45 backdrop-blur-xs text-[10px] text-white/90 font-medium select-none pointer-events-none tracking-tight shadow-2xs">
                  AI生成
                </div>
              )}

              {isVideoLoading && !videoLoadFailed && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
                </div>
              )}

              {videoLoadFailed ? (
                <div
                  className="p-6 rounded-2xl bg-black/80 border border-white/10 text-center flex flex-col items-center gap-3 z-10 select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm text-slate-300">视频播放源加载受限</p>
                  <button
                    type="button"
                    onClick={() => void openExternalUrl(resultUrl!)}
                    className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    在新窗口打开原视频
                  </button>
                </div>
              ) : (
                <video
                  key={currentVideoSrc}
                  ref={videoRef}
                  src={currentVideoSrc}
                  controls
                  autoPlay
                  loop
                  playsInline
                  preload="auto"
                  onCanPlay={handleVideoCanPlay}
                  onLoadedMetadata={handleVideoDuration}
                  onDurationChange={handleVideoDuration}
                  onLoadedData={() => setIsVideoLoading(false)}
                  onError={handleVideoError}
                  className={`max-h-[48vh] md:max-h-[82vh] max-w-full object-contain transition-all duration-300 pointer-events-auto bg-black ${
                    isVideoLoading ? 'opacity-0 scale-98' : 'opacity-100 scale-100'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          ) : (
            <div className="relative max-h-full max-w-full inline-flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl">
              {/* 🌟 紧密贴合大图左上角「AI生成」标识 (对齐图 1 原版，随图片居中紧密贴合) */}
              <div className="absolute top-3 left-3 z-30 px-2 py-0.5 rounded bg-black/45 backdrop-blur-xs text-[10px] text-white/90 font-medium select-none pointer-events-none tracking-tight shadow-2xs">
                AI生成
              </div>

              {isImageLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
                </div>
              )}
              <img
                key={resultUrl}
                src={proxyMediaUrl(resultUrl, { width: 1920 })}
                alt={previewTask.prompt}
                onLoad={(e) => {
                  setIsImageLoading(false);
                  const target = e.currentTarget;
                  // 🌟 防御性检测：若代理接口返回了 400x400 兜底 SVG 占位图，自动无缝切换为直连原图
                  if (
                    !target.dataset.hasRetried &&
                    target.naturalWidth === 400 &&
                    target.naturalHeight === 400 &&
                    resultUrl
                  ) {
                    target.dataset.hasRetried = 'true';
                    target.src = resultUrl;
                  }
                }}
                onError={(e) => {
                  setIsImageLoading(false);
                  const target = e.currentTarget;
                  if (!target.dataset.hasRetried && resultUrl) {
                    target.dataset.hasRetried = 'true';
                    target.src = resultUrl;
                  } else if (!target.dataset.hasThumbFallback && resultUrl) {
                    // 🌟 第二重容灾：若直连原图也遇到网络限制，使用已在列表页成功呈现的 640px 缓存缩略图
                    target.dataset.hasThumbFallback = 'true';
                    target.src = proxyMediaUrl(resultUrl, { thumb: true, width: 640 });
                  }
                }}
                className={`max-h-[48vh] md:max-h-[82vh] max-w-full object-contain transition-all duration-300 select-none ${
                  isImageLoading ? 'opacity-0 scale-98' : 'opacity-100 scale-100'
                }`}
              />
            </div>
          )}
        </div>

        {/* 大图正下方居中页码胶囊 (仅显示数量，移除切换按键) */}
        {total > 1 && currentIndex >= 0 && (
          <div className="mt-3 shrink-0 flex items-center justify-center select-none pointer-events-none">
            <div className="flex items-center justify-center px-3 py-1 rounded-full bg-black/65 backdrop-blur-md text-white text-xs font-mono font-medium shadow-lg border border-white/15">
              <span className="tabular-nums">
                {currentIndex + 1} / {total}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 右侧外侧翻页按键 (位于大图与右侧面板之间) */}
      {total > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all cursor-pointer shadow-xl hover:scale-110 active:scale-95 z-20 group pointer-events-auto"
          title="下一张 (→)"
        >
          <ChevronRight className="w-6 h-6 stroke-[2.2] group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
    </div>

  );
}
