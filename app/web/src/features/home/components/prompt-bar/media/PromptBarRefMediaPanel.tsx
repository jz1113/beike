import { useState, useMemo, type RefObject } from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import type { RefMediaKind } from '@/lib/mediaUpload';
import { Plus, X, ArrowLeftRight, Minimize2, AlertCircle } from 'lucide-react';
import { normalizeImageUrlToStandardJpg } from '@beike/shared/drawing';
import {
  densityComposerPolaroidFrame,
  densityComposerPolaroidFrameExpanded,
  compactComposerPolaroidFrame,
  compactComposerPolaroidFrameExpanded,
} from '@/shared/ui/layoutClasses';
import { PromptBarRefImageStack } from './PromptBarRefImageStack';
import { RefMediaThumb } from './PromptBarRefMediaThumb';
import { PromptBarRefMediaLightbox } from './PromptBarRefMediaLightbox';
import type { QuickGenMode } from '@beike/shared/depthVideo';
import type { SubjectItem } from '../../../data/promptBarConstants';

function refUploadLabel(mode: QuickGenMode): { label: string; title: string } {
  if (mode === 'depth-image') {
    return { label: '上传图片', title: '上传图片提取深度 (可直接拖入或 Ctrl+V)' };
  }
  if (mode === 'depth-video') {
    return { label: '上传视频', title: '上传视频生成深度动作捕捉 (可直接拖入或 Ctrl+V)' };
  }
  if (mode === 'video') {
    return { label: '上传参考素材', title: '上传参考素材 (可直接拖入或 Ctrl+V)' };
  }
  return { label: '上传参考图', title: '上传参考图 (可直接拖入或 Ctrl+V)' };
}

interface Props {
  layout?: 'sidebar' | 'strip';
  frameExpanded?: boolean;
  quickGenMode: QuickGenMode;
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
  resolveMediaFile?: (url: string) => File | undefined;
  resolveMediaKind?: (url: string) => RefMediaKind | undefined;
  allSubjects?: SubjectItem[];
  onSelectSubject?: (subject: SubjectItem) => void;
  onClearAll?: () => void;
}

function StripEmptyUpload({
  onClick,
  label,
  title,
}: {
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[72px] rounded-2xl bg-[#F2F4F7] hover:bg-[#EAECEF] border border-slate-200/60 hover:border-slate-300/80 text-slate-400 hover:text-slate-600 flex items-center justify-center gap-2.5 transition-all duration-200 cursor-pointer group/upload shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-xs"
      title={title}
    >
      <div className="w-8 h-8 rounded-xl bg-white/90 border border-slate-200/80 flex items-center justify-center shadow-2xs group-hover/upload:scale-105 transition-transform">
        <Plus className="w-4.5 h-4.5 text-[#98A2B3] group-hover/upload:text-slate-700 stroke-[1.6]" />
      </div>
      <span className="text-xs font-semibold text-slate-500 group-hover/upload:text-slate-700">{label}</span>
    </button>
  );
}

export default function PromptBarRefMediaPanel({
  layout = 'sidebar',
  frameExpanded = false,
  quickGenMode,
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
  resolveMediaFile,
  resolveMediaKind,
  onClearAll,
}: Props) {
  const isStrip = layout === 'strip';
  const polaroidFrame = `${frameExpanded ? densityComposerPolaroidFrameExpanded : densityComposerPolaroidFrame} ${frameExpanded ? compactComposerPolaroidFrameExpanded : compactComposerPolaroidFrame}`;

  const [activeMediaTab, setActiveMediaTab] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [lightboxState, setLightboxState] = useState<{
    items: string[];
    currentIndex: number;
  } | null>(null);

  // 分类统计
  const mediaStats = useMemo(() => {
    let imagesCount = 0;
    let videosCount = 0;
    quickRefImages.forEach((url) => {
      const kind = resolveMediaKind?.(url);
      if (kind === 'video') videosCount++;
      else imagesCount++;
    });
    return {
      all: quickRefImages.length,
      image: imagesCount,
      video: videosCount,
      audio: 0,
    };
  }, [quickRefImages, resolveMediaKind]);

  // 根据当前选中的 Tab 过滤展示的素材
  const displayedImages = useMemo(() => {
    if (activeMediaTab === 'all') return quickRefImages;
    if (activeMediaTab === 'image') {
      return quickRefImages.filter((url) => resolveMediaKind?.(url) !== 'video');
    }
    if (activeMediaTab === 'video') {
      return quickRefImages.filter((url) => resolveMediaKind?.(url) === 'video');
    }
    return [];
  }, [activeMediaTab, quickRefImages, resolveMediaKind]);

  const renderPanelBody = () => {
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

    // 🌟 3. 展开面板模式（完全符合图3样式）：全部展开卡片显示
    if (isExpandedRefImages && quickRefImages.length > 0) {
      return (
        <div
          ref={refImagesContainerRef}
          onMouseEnter={onMouseEnterRefImages}
          onMouseLeave={onMouseLeaveRefImages}
          className="w-full select-none pt-2 pb-3 px-1 space-y-2.5 animate-fade-in"
        >
          {/* 顶部栏：分类 Tab + 清空全部素材 + 收起图标按钮 */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100/80 pb-2">
            {/* 左侧 Tab 列表 */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={() => setActiveMediaTab('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeMediaTab === 'all'
                    ? 'bg-slate-100 text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                全部 ({mediaStats.all})
              </button>
              <button
                type="button"
                onClick={() => setActiveMediaTab('image')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeMediaTab === 'image'
                    ? 'bg-slate-100 text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                图片 ({mediaStats.image})
              </button>
              <button
                type="button"
                onClick={() => setActiveMediaTab('video')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeMediaTab === 'video'
                    ? 'bg-slate-100 text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                视频{mediaStats.video > 0 ? ` (${mediaStats.video})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setActiveMediaTab('audio')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeMediaTab === 'audio'
                    ? 'bg-slate-100 text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                音频
              </button>
            </div>

            {/* 右侧：清空全部素材 + 折叠收起按钮 */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs text-slate-400 hover:text-rose-600 transition-colors cursor-pointer font-medium"
                title="清空当前所有参考素材"
              >
                清空全部素材
              </button>
              <button
                type="button"
                onClick={() => setIsExpandedRefImages(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
                title="收起素材卡片"
              >
                <Minimize2 className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>
          </div>

          {/* 中间素材卡片平铺行 (含未通过遮罩支持和末尾灰底加号) */}
          <div className="flex items-center gap-2.5 sm:gap-3 overflow-x-auto py-1 scrollbar-none">
            {displayedImages.map((img, idx) => {
              const isRejected = (img as any).rejected || (img as any).status === 'rejected';

              return (
                <div
                  key={`${img}-${idx}`}
                  onClick={() => {
                    setLightboxState({
                      items: displayedImages,
                      currentIndex: idx,
                    });
                  }}
                  className="relative group/card flex-shrink-0 w-16 h-20 sm:w-18 sm:h-22 rounded-xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden transition-all duration-200 hover:scale-105 hover:shadow-md cursor-zoom-in active:scale-98"
                  title="点击放大查看素材"
                >
                  <RefMediaThumb
                    url={img}
                    file={resolveMediaFile?.(img)}
                    mediaKind={resolveMediaKind?.(img)}
                    alt={`素材-${idx + 1}`}
                    className="w-full h-full object-cover pointer-events-none"
                  />

                  {/* 未通过状态提示遮罩 (参考图3第二张卡片) */}
                  {isRejected && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[0.5px] flex flex-col items-center justify-center gap-0.5 text-white pointer-events-none">
                      <AlertCircle className="w-4 h-4 text-white/90 stroke-[2.2]" />
                      <span className="text-[10px] font-bold text-white/95">未通过</span>
                    </div>
                  )}

                  {/* 单张删除按钮 (hover 出现) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const realIdx = quickRefImages.indexOf(img);
                      if (realIdx >= 0) removeQuickRefImage(realIdx);
                    }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/card:opacity-100"
                    title="删除此素材"
                  >
                    <X className="w-3 h-3 stroke-[2.2]" />
                  </button>
                </div>
              );
            })}

            {/* 列表末尾浅灰 + 按钮 */}
            <button
              type="button"
              onClick={onUploadClick}
              className="w-16 h-20 sm:w-18 sm:h-22 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer flex-shrink-0 group/add"
              title="添加更多参考素材"
            >
              <Plus className="w-6 h-6 stroke-[1.8] text-slate-400 group-hover/add:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      );
    }

    // 🌟 4. 默认/折叠模式：单行 Strip 模式（如果外部要求 strip）
    if (isStrip) {
      return (
        <div
          ref={refImagesContainerRef}
          onMouseEnter={onMouseEnterRefImages}
          onMouseLeave={onMouseLeaveRefImages}
          className="w-full select-none"
        >
          {quickRefImages.length === 0 ? (
            <StripEmptyUpload
              onClick={onUploadClick}
              label={refUploadLabel(quickGenMode).label}
              title={refUploadLabel(quickGenMode).title}
            />
          ) : (
            <PromptBarRefImageStack
              images={quickRefImages}
              isExpanded={isExpandedRefImages}
              setIsExpanded={setIsExpandedRefImages}
              frameExpanded={frameExpanded}
              onUploadClick={onUploadClick}
              onRemove={removeQuickRefImage}
              addLabel="参考内容"
              resolveMediaFile={resolveMediaFile}
              resolveMediaKind={resolveMediaKind}
              onPreviewImage={(idx) => {
                setLightboxState({
                  items: quickRefImages,
                  currentIndex: idx,
                });
              }}
            />
          )}
        </div>
      );
    }

    // 🌟 5. 默认折叠态（参考图2展示）：散落叠放卡片堆，上方带【查看全部】
    return (
      <div
        ref={refImagesContainerRef}
        onMouseEnter={onMouseEnterRefImages}
        onMouseLeave={onMouseLeaveRefImages}
        className="flex-shrink-0 relative select-none flex items-start"
      >
        {quickRefImages.length === 0 ? (
          <div className="pt-0.5 pb-1 px-1 flex-shrink-0 mr-2.5 sm:mr-3">
            {/* 🌟 空态便签卡片：向左微倾斜 -rotate-[6deg]，精致加号 + 参考内容文字（严格保持 3:4 修长拍立得便签比例） */}
            <button
              type="button"
              onClick={onUploadClick}
              className={`${polaroidFrame} rounded-xl bg-[#F8F9FA] hover:bg-white border border-slate-200/90 hover:border-slate-300 text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1.5 transition-all duration-300 cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:shadow-md hover:scale-105 transform -rotate-[6deg] hover:-rotate-[4deg] group/card flex-shrink-0 relative select-none`}
              title={refUploadLabel(quickGenMode).title}
              aria-label={refUploadLabel(quickGenMode).label}
            >
              <Plus className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-slate-400 group-hover/card:text-slate-700 transition-colors stroke-[1.8]" />
              <span className="text-[10.5px] sm:text-[11px] font-medium text-slate-500 group-hover/card:text-slate-800 leading-none tracking-tight">
                参考内容
              </span>
            </button>
          </div>
        ) : (
          <PromptBarRefImageStack
            images={quickRefImages}
            isExpanded={isExpandedRefImages}
            setIsExpanded={setIsExpandedRefImages}
            frameExpanded={frameExpanded}
            onUploadClick={onUploadClick}
            onRemove={removeQuickRefImage}
            addLabel="参考内容"
            resolveMediaFile={resolveMediaFile}
            resolveMediaKind={resolveMediaKind}
            onPreviewImage={(idx) => {
              setLightboxState({
                items: quickRefImages,
                currentIndex: idx,
              });
            }}
          />
        )}
      </div>
    );
  };

  return (
    <>
      {renderPanelBody()}
      {lightboxState && (
        <PromptBarRefMediaLightbox
          items={lightboxState.items}
          currentIndex={lightboxState.currentIndex}
          onClose={() => setLightboxState(null)}
          onIndexChange={(next) =>
            setLightboxState((prev) => (prev ? { ...prev, currentIndex: next } : null))
          }
          resolveMediaFile={resolveMediaFile}
          resolveMediaKind={resolveMediaKind}
        />
      )}
    </>
  );
}
