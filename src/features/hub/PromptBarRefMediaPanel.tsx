'use client';
import { RefObject } from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { Plus, X, ArrowLeftRight } from 'lucide-react';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { RefMediaThumb } from './PromptBarRefMediaThumb';

interface Props {
  hubGenMode: 'image' | 'video';
  quickVideoRefMode: string;
  quickVideoFirstFrame: string | null;
  quickVideoLastFrame: string | null;
  quickVideoMultiFrames: string[];
  quickRefImages: string[];
  isExpandedRefImages: boolean;
  setIsExpandedRefImages: (v: boolean) => void;
  setQuickVideoFirstFrame: (v: string | null) => void;
  setQuickVideoLastFrame: (v: string | null) => void;
  swapVideoFirstLastFrames: () => void;
  removeQuickVideoMultiFrame: (idx: number) => void;
  removeQuickRefImage: (idx: number) => void;
  onUploadClick: () => void;
  onFirstFrameClick: () => void;
  onLastFrameClick: () => void;
  onMultiFrameClick: () => void;
  refImagesContainerRef: RefObject<HTMLDivElement | null>;
  onMouseEnterRefImages: () => void;
  onMouseLeaveRefImages: () => void;
}

export default function PromptBarRefMediaPanel({
  hubGenMode,
  quickVideoRefMode,
  quickVideoFirstFrame,
  quickVideoLastFrame,
  quickVideoMultiFrames,
  quickRefImages,
  isExpandedRefImages,
  setIsExpandedRefImages,
  setQuickVideoFirstFrame,
  setQuickVideoLastFrame,
  swapVideoFirstLastFrames,
  removeQuickVideoMultiFrame,
  removeQuickRefImage,
  onUploadClick,
  onFirstFrameClick,
  onLastFrameClick,
  onMultiFrameClick,
  refImagesContainerRef,
  onMouseEnterRefImages,
  onMouseLeaveRefImages,
}: Props) {
  if (hubGenMode === 'video' && quickVideoRefMode === 'first_last_frame') {
    return (
      /* 🎬 视频首尾帧专属双卡片展示区 (严格对照即梦/专业视频双帧构型) */
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 pt-0.5">
        {/* 首帧卡片 (向左轻微倾斜 -rotate-[4deg]) */}
        <div className="relative group/first">
          {quickVideoFirstFrame ? (
            <div className="relative w-15 h-19 sm:w-17 sm:h-21 rounded-2xl border border-slate-200 shadow-sm bg-white -rotate-[4deg] transition-all group-hover/first:rotate-0 group-hover/first:scale-105">
              <div className="w-full h-full rounded-2xl overflow-hidden">
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
              {/* 悬浮圆形深色删除按钮 (严格对标截图) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickVideoFirstFrame(null);
                }}
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

        {/* 中间首尾帧流转/交换按钮 (⇄) */}
        <button
          type="button"
          onClick={swapVideoFirstLastFrames}
          className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all cursor-pointer self-center"
          title="交换首尾帧顺序"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>

        {/* 尾帧卡片 (向右轻微倾斜 rotate-[4deg]) */}
        <div className="relative group/last">
          {quickVideoLastFrame ? (
            <div className="relative w-15 h-19 sm:w-17 sm:h-21 rounded-2xl border border-slate-200 shadow-sm bg-white rotate-[4deg] transition-all group-hover/last:rotate-0 group-hover/last:scale-105">
              <div className="w-full h-full rounded-2xl overflow-hidden">
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
              {/* 悬浮圆形深色删除按钮 (严格对标截图) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickVideoLastFrame(null);
                }}
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

  if (hubGenMode === 'video' && quickVideoRefMode === 'multi_frame') {
    return (
      /* 🎞️ 智能多帧专属多镜头卡片展示区 (严格对照截图) */
      <div className="flex items-center gap-2 flex-shrink-0 pt-0.5 max-w-[340px] overflow-x-auto py-1 scrollbar-none">
        {quickVideoMultiFrames.map((frame, idx) => (
          <div key={idx} className="relative group/mframe flex-shrink-0">
            <div className="relative w-15 h-19 sm:w-17 sm:h-21 rounded-2xl border border-slate-200 shadow-sm bg-white transition-all group-hover/mframe:scale-105">
              <div className="w-full h-full rounded-2xl overflow-hidden">
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
              {/* 悬浮圆形深色删除按钮 (严格对标截图) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeQuickVideoMultiFrame(idx);
                }}
                className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/mframe:opacity-100"
                title={`删除第${idx + 1}帧`}
              >
                <X className="w-3.5 h-3.5 stroke-[2.2]" />
              </button>
            </div>
          </div>
        ))}

        {/* 添加下一帧卡片 (如果还未达到上限) */}
        {quickVideoMultiFrames.length < 10 && (
          <button
            type="button"
            onClick={onMultiFrameClick}
            className={`w-15 h-19 sm:w-17 sm:h-21 rounded-2xl bg-[#F8F9FA] hover:bg-slate-100 border border-slate-200/90 hover:border-slate-300 text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs ${
              quickVideoMultiFrames.length === 0 ? '-rotate-[4deg] hover:rotate-0' : ''
            } group/card flex-shrink-0`}
            title={`添加第 ${quickVideoMultiFrames.length + 1} 帧镜头`}
          >
            <Plus className="w-5 h-5 text-slate-400 group-hover/card:scale-110 transition-transform stroke-[1.8]" />
            <span className="text-[11px] font-bold text-slate-500">第{quickVideoMultiFrames.length + 1}帧</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={refImagesContainerRef}
      onMouseEnter={onMouseEnterRefImages}
      onMouseLeave={onMouseLeaveRefImages}
      className="flex-shrink-0 relative select-none pt-0.5"
    >
      {quickRefImages.length === 0 ? (
        /* 0 张图：极简微倾拍立得卡片 (严格对标即梦官方设计) */
        <button
          type="button"
          onClick={onUploadClick}
          className="w-22 h-26 sm:w-24 sm:h-28 rounded-2xl bg-[#F4F5F8] hover:bg-[#EBEDF2] -rotate-[3.5deg] hover:rotate-0 hover:scale-105 border border-slate-200/80 shadow-2xs text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group/empty flex-shrink-0"
          title={hubGenMode === 'video' ? '上传参考素材/首帧/动作图或拖入文件' : '上传参考图或直接拖入图片'}
        >
          <Plus className="w-7 h-7 text-slate-400 group-hover/empty:scale-110 transition-transform stroke-[2.2]" />
          {hubGenMode === 'video' && (
            <span className="text-xs sm:text-[13px] text-slate-400 font-medium leading-none">参考内容</span>
          )}
        </button>
      ) : isExpandedRefImages ? (
        /* 🎨 展开态：拍立得照片墙平铺展开 (严格对标图 3) */
        <div className="flex items-center gap-3 sm:gap-4 relative select-none flex-shrink-0 animate-fade-in py-1">
          {quickRefImages.map((img, idx) => {
            // 渐变有机自然微倾斜角度 (-4deg, -1deg, +3deg, +5deg...)
            const rotations = ['-rotate-[4deg]', '-rotate-[1deg]', 'rotate-[3deg]', 'rotate-[5deg]', 'rotate-[2deg]'];
            const rotClass = rotations[idx % rotations.length];

            return (
              <div
                key={idx}
                className={`relative w-22 h-26 sm:w-24 sm:h-28 bg-white p-1.5 rounded-sm shadow-md border border-slate-200/90 transition-all hover:scale-105 hover:rotate-0 hover:z-30 hover:shadow-xl ${rotClass} flex-shrink-0 group/card`}
              >
                <RefMediaThumb
                  url={img}
                  alt={`参考素材-${idx + 1}`}
                  className="w-full h-full object-cover rounded-xs"
                />

                {/* 顶部悬浮深色圆形删除按钮 × (严格对标截图 3) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeQuickRefImage(idx);
                    if (quickRefImages.length <= 1) {
                      setIsExpandedRefImages(false);
                    }
                  }}
                  className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/card:opacity-100"
                  title="删除此参考素材"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.2]" />
                </button>
              </div>
            );
          })}

          {/* 末尾【+ 参考内容】倾斜卡片 (严格对标截图 3) */}
          <button
            type="button"
            onClick={onUploadClick}
            className="relative w-18 h-22 sm:w-20 sm:h-24 bg-[#F9FAFB] hover:bg-slate-100 p-1 rounded-sm shadow-md border border-slate-200/90 transition-all hover:scale-105 hover:rotate-0 hover:shadow-xl rotate-[4deg] flex-shrink-0 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-slate-500 hover:text-slate-800 group/add"
            title="添加更多参考素材"
          >
            <Plus className="w-5 h-5 text-slate-500 group-hover/add:scale-110 transition-transform stroke-[1.8]" />
            <span className="text-[11px] sm:text-xs font-medium text-slate-600 group-hover/add:text-slate-900 leading-tight">
              参考内容
            </span>
          </button>

          {/* 收起折叠按钮 */}
          {quickRefImages.length > 1 && (
            <button
              type="button"
              onClick={() => setIsExpandedRefImages(false)}
              className="self-center ml-0.5 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="收起为折叠卡片"
            >
              收起
            </button>
          )}
        </div>
      ) : (
        /* 🎴 折叠态：拍立得照片叠层卡片堆 (严格对标图 1) */
        <div
          onClick={() => setIsExpandedRefImages(true)}
          className="relative w-20 h-24 sm:w-22 sm:h-26 cursor-pointer flex-shrink-0 group/stack select-none transition-all hover:scale-105"
          title="点击展开查看全部参考素材"
        >
          {/* 叠底层 2 (微向右倾斜 rotate-[6deg]) */}
          {quickRefImages[1] && (
            <div className="absolute inset-0 bg-white p-1 rounded-sm shadow-md border border-slate-200/90 rotate-[6deg] scale-95 transition-transform group-hover/stack:rotate-[8deg]">
              <RefMediaThumb url={quickRefImages[1]} className="w-full h-full object-cover rounded-xs" />
            </div>
          )}

          {/* 叠底层 1 (若有3张以上素材，轻微微倾 rotate-[1deg]) */}
          {quickRefImages[2] && (
            <div className="absolute inset-0 bg-white p-1 rounded-sm shadow-md border border-slate-200/90 rotate-[1deg] scale-98 transition-transform group-hover/stack:rotate-[3deg]">
              <RefMediaThumb url={quickRefImages[2]} className="w-full h-full object-cover rounded-xs" />
            </div>
          )}

          {/* 置顶顶层卡片 (微向左倾斜 -rotate-[6deg]，严格对标截图 1) */}
          <div className="relative w-full h-full bg-white p-1 rounded-sm shadow-lg border border-slate-200/90 -rotate-[6deg] transition-transform group-hover/stack:-rotate-[8deg] z-10">
            <RefMediaThumb
              url={quickRefImages[0]}
              alt="参考素材"
              className="w-full h-full object-cover rounded-xs"
            />

            {/* 右下角悬浮白色圆形 + 展开/添加按钮 (严格对标截图 1) */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsExpandedRefImages(true);
              }}
              className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-white text-slate-800 shadow-md border border-slate-200/90 flex items-center justify-center font-bold hover:scale-110 transition-transform cursor-pointer z-20"
              title="展开参考素材"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
