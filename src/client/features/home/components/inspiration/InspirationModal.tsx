import type { InspirationItem } from '../../model/inspirationItem';
import {InspirationReferences} from './InspirationReferences';
import { InspirationPromptPanel } from './InspirationPromptPanel';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { handleImgError } from '@client/shared/media/imageError';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { downloadMediaOrOpen } from '@client/shared/media/downloadMedia';
import {
  RotateCcw,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Check,
} from 'lucide-react';
import { formatDisplayModel } from '@shared/domain/media/drawing';
import type { StoryboardPresetConfig } from '@shared/domain/prompts/prompt-engine/storyboardPreset';

export interface InspirationUseOptions {
  referenceImages?: string[];
  videoRefMode?: string;
  videoDuration?: number;
  videoModel?: string;
  videoAspectId?: string;
  videoResolution?: '480P' | '540P' | '720P' | '1080P' | '2K' | '4K';
}

export type { InspirationItem };

interface Props {
  item: InspirationItem | null;
  allItems: InspirationItem[];
  isOpen: boolean;
  onClose: () => void;
  onUsePromptOnly: (prompt: string) => void;
  onUseAsReference: (prompt: string, imageUrl: string, opts?: InspirationUseOptions) => void;
  onNavigate?: (newItem: InspirationItem) => void;
  onApplyPreset?: (presetId: string) => void;
  availablePresets?: StoryboardPresetConfig[];
}

export default function InspirationModal({ item, allItems, isOpen, onClose, onUsePromptOnly, onUseAsReference, onNavigate }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const downloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVideoLoadFailed(false);
  }, [item?.id]);

  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
    };
  }, []);

  const currentIndex = item ? allItems.findIndex(i => i.id === item.id) : -1;
  const total = allItems.length;

  const handlePrev = useCallback(() => {
    if (total > 1 && onNavigate && currentIndex >= 0) {
      const prevIdx = (currentIndex - 1 + total) % total;
      onNavigate(allItems[prevIdx]);
    }
  }, [total, onNavigate, currentIndex, allItems]);

  const handleNext = useCallback(() => {
    if (total > 1 && onNavigate && currentIndex >= 0) {
      const nextIdx = (currentIndex + 1) % total;
      onNavigate(allItems[nextIdx]);
    }
  }, [total, onNavigate, currentIndex, allItems]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || !item) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        handlePrev();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, item, onClose, handlePrev, handleNext]);

  const isVideo = item ? (item.mediaType === 'video' || !!item.video || isVideoMediaUrl(item.image)) : false;

  const handleDownload = async () => {
    if (!item) return;
    const url = item.video || item.image;
    if (!url || isDownloading) return;
    setIsDownloading(true);
    try {
      const ext = isVideo ? 'mp4' : 'jpg';
      const filename = `${item.title || 'inspiration'}_${Date.now()}.${ext}`;
      await downloadMediaOrOpen(url, filename);
      setDownloadSuccess(true);
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = setTimeout(() => {
        setDownloadSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('下载素材失败:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const buildVideoUseOpts = (): InspirationUseOptions | undefined => {
    if (!item?.referenceImages?.length) return undefined;
    return {
      referenceImages: item.referenceImages,
      videoRefMode: item.videoRefMode || 'omni',
      videoDuration: item.videoDuration,
      videoModel: item.model,
      videoAspectId: item.aspectRatio,
      videoResolution: (item.quality?.toUpperCase() as InspirationUseOptions['videoResolution']) || '720P',
    };
  };

  const authorName = item?.author?.name && item.author.name !== 'alone' ? item.author.name : '贝壳云图';

  const qualityLabel = useMemo(() => {
    if (isVideo) {
      return item?.quality || '720P';
    }
    if (item?.quality) {
      const q = String(item.quality).toUpperCase();
      if (q.includes('4K')) return '4K';
      if (q.includes('2K')) return '2K';
      if (q.includes('1K')) return '1K';
      return item.quality;
    }
    const model = String(item?.model || '').toLowerCase();
    if (model.includes('4k')) return '4K';
    if (model.includes('2k')) return '2K';
    return '2K';
  }, [isVideo, item?.quality, item?.model]);

  const modelLabel = useMemo(() => {
    if (!item) return '';
    return formatDisplayModel(item.model || (isVideo ? 'Seedance 2.5' : 'gpt-image-2'));
  }, [item, isVideo]);

  const durationLabel = useMemo(() => {
    if (!isVideo || !item) return null;
    const dur = item.actualVideoDuration ?? item.videoDuration;
    if (typeof dur === 'number' && dur > 0) return `${Math.round(dur * 10) / 10}s`;
    return null;
  }, [isVideo, item]);

  const aspectRatio = item?.aspectRatio || null;
  const [mediaWidth,mediaHeight]=(aspectRatio || '').split(':').map(Number);
  const wideVideo=isVideo && mediaWidth>mediaHeight;

  if (!isOpen || !item || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 lg:p-10 select-none font-sans animate-fade-in cursor-zoom-out"
      onClick={onClose}
    >
      {/* 🌟 居中大方的主容器 (左侧媒体展示 + 左右大箭头 + 右侧信息面板) */}
      <div className={`w-full ${wideVideo ? 'max-w-[1680px] gap-4 lg:gap-5' : 'max-w-5xl xl:max-w-6xl 2xl:max-w-7xl gap-4 lg:gap-8'} max-h-[92vh] flex flex-col md:flex-row items-center justify-center relative pointer-events-none`}>
        {/* 🌟 1. 左侧：全尺寸高清大图/高清视频呈现 + 原生对称左右翻页控制器 (外置并列，远离图片边缘) */}
        <div className="flex-1 h-full max-h-[88vh] flex items-center justify-center gap-3 sm:gap-5 lg:gap-7 relative min-w-0 group/canvas pointer-events-none">
          {/* 左翻页按钮 (← 上一个，循环轮播，外置脱离图片) */}
          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className={`${wideVideo ? 'absolute left-3 top-1/2 -translate-y-1/2' : ''} shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-black/90 text-white shadow-xl border border-white/20 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer z-20 backdrop-blur-md group/btn pointer-events-auto`}
              title="上一个 (←)"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.2] group-hover/btn:-translate-x-0.5 transition-transform" />
            </button>
          )}

          {/* 中间媒体展示区 */}
          <div className="relative flex items-center justify-center flex-1 max-w-full h-full min-w-0 overflow-hidden pointer-events-none">
            {isVideo ? (
              <div className="relative max-h-[86vh] max-w-full">
                <video
                  key={item.video || item.image}
                  src={videoLoadFailed ? undefined : (item.video || item.image)}
                  poster={item.poster}
                  controls={!videoLoadFailed}
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                  onError={() => setVideoLoadFailed(true)}
                  onClick={(e) => e.stopPropagation()}
                  className={`max-h-[86vh] ${wideVideo ? 'w-full' : 'w-auto'} max-w-full object-contain rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.22)] border border-white/60 select-none transition-all duration-300 bg-black cursor-default pointer-events-auto`}
                />
                {videoLoadFailed && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/70 pointer-events-auto">
                    <p className="text-sm text-white/90">视频文件缺失</p>
                  </div>
                )}
              </div>
            ) : (
              <img
                key={item.image}
                src={item.image}
                alt={item.title}
                referrerPolicy="no-referrer"
                onError={(e) => handleImgError(e, item.image)}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[86vh] w-auto max-w-full object-contain rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-white/60 select-none transition-all duration-300 bg-slate-100 cursor-default pointer-events-auto dark:bg-white/10"
              />
            )}
          </div>

          {/* 右翻页按钮 (→ 下一个，循环轮播，外置脱离图片) */}
          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className={`${wideVideo ? 'absolute right-3 top-1/2 -translate-y-1/2' : ''} shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-black/90 text-white shadow-xl border border-white/20 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer z-20 backdrop-blur-md group/btn pointer-events-auto`}
              title="下一个 (→)"
            >
              <ChevronRight className="w-6 h-6 stroke-[2.2] group-hover/btn:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        {/* 🌟 2. 右侧：精致大方的信息与操作面板 */}
        <div
          className={`w-full ${wideVideo ? 'md:w-[300px] lg:w-[320px] xl:w-[340px]' : 'md:w-[350px] lg:w-[380px] xl:w-[400px]'} max-h-[86vh] bg-white dark:bg-[#1B1B1E] text-slate-900 dark:text-[#EDEDED] rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200/90 dark:border-white/10 flex flex-col justify-between flex-shrink-0 overflow-y-auto relative pointer-events-auto`}
          onClick={(e) => e.stopPropagation()}
        >

          <div className="space-y-4">
            {/* 顶部 Header: 左侧贝壳云图官方作者信息，右侧仅保留下载按钮（点击空白处退出全屏，无需关闭叉） */}
            <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-white dark:bg-[#26262B] border border-slate-200/80 dark:border-white/10 flex items-center justify-center shadow-xs shrink-0 select-none p-0.5">
                  <img
                    src="/app_logo.png"
                    alt={authorName}
                    draggable={false}
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-[14px] font-semibold text-slate-900 dark:text-white truncate max-w-[150px] sm:max-w-[180px]">
                  {authorName}
                </span>
              </div>

              {/* 右侧：下载按钮 (图 1 方形浅灰圆角外框) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="w-9 h-9 rounded-xl bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-[#C7C7CC] hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  title={isVideo ? '下载高清视频' : '下载高清原图'}
                >
                  {downloadSuccess ? (
                    <Check className="w-4.5 h-4.5 text-emerald-600 stroke-[2.2]" />
                  ) : (
                    <Download className="w-4.5 h-4.5 stroke-[1.8]" />
                  )}
                </button>
              </div>
            </div>

            {/* 日期与生成标记 */}
            <div className="text-xs text-slate-400 dark:text-[#8E8E93] font-sans">
              <span>{item.date || '2026-08-19 | 内容由 AI 生成'}</span>
            </div>

            <InspirationPromptPanel itemId={item.id} prompt={item.prompt} isVideo={isVideo} />

            <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center flex-wrap gap-x-2.5 gap-y-1.5 text-[12px] sm:text-[12.5px] text-slate-500 dark:text-[#8E8E93] select-none">
              {!!item.referenceImages?.length && <>
                <InspirationReferences key={item.id} images={item.referenceImages} labels={item.referenceLabels} mode={item.videoRefMode}/>
                <span className="text-slate-300 dark:text-white/20">|</span>
              </>}
              {/* 2. 模型名称 (图 1: 即梦 Seedance 1.0 Fast / GPT Image 2，纯文本无边框无胶囊) */}
              <span className="text-slate-600 dark:text-[#EDEDED] font-normal truncate max-w-[160px]">{modelLabel}</span>

              {/* 3. 视频时长 或 图片画质 (图 1: 5s / 2K) */}
              {isVideo ? (
                durationLabel && (
                  <>
                    <span className="text-slate-300 dark:text-white/20 font-light select-none">|</span>
                    <span className="text-slate-500 dark:text-[#8E8E93] font-normal">{durationLabel}</span>
                  </>
                )
              ) : (
                qualityLabel && (
                  <>
                    <span className="text-slate-300 dark:text-white/20 font-light select-none">|</span>
                    <span className="text-slate-500 dark:text-[#8E8E93] font-normal">{qualityLabel}</span>
                  </>
                )
              )}

              {/* 4. 画幅比例 (图 1: 9:16 / 3:4) */}
              {aspectRatio && (
                <>
                  <span className="text-slate-300 dark:text-white/20 font-light select-none">|</span>
                  <span className="text-slate-500 dark:text-[#8E8E93] font-normal">{aspectRatio}</span>
                </>
              )}
            </div>
          </div>

          {/* 🌟 底部双按钮 (做同款 / 用作参考图) */}
          <div className="pt-5 mt-4 border-t border-slate-100 dark:border-white/[0.06] flex items-center gap-3">
            {/* 做同款 */}
            <button
              type="button"
              onClick={() => {
                const isVideoItem = item.mediaType === 'video' || !!item.video || isVideoMediaUrl(item.image);
                if (isVideoItem) {
                  onUseAsReference(item.referencePrompt || item.prompt, item.video || item.image, buildVideoUseOpts());
                } else {
                  // 文生图做同款：只填提示词，不把成品图当参考图
                  onUsePromptOnly(item.prompt);
                }
                onClose();
              }}
              className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-[#EDEDED] font-medium text-[13.5px] sm:text-[14px] flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-slate-700 dark:text-[#E5E5EA] stroke-[2.2]" />
              <span>做同款</span>
            </button>

            {/* 用作参考图 */}
            <button
              type="button"
              onClick={() => {
                const isVideoItem = item.mediaType === 'video' || !!item.video || isVideoMediaUrl(item.image);
                onUseAsReference(
                  item.referencePrompt || item.prompt,
                  item.video || item.image,
                  isVideoItem ? buildVideoUseOpts() : undefined,
                );
                onClose();
              }}
              className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-[#EDEDED] font-medium text-[13.5px] sm:text-[14px] flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-slate-700 dark:text-[#E5E5EA] stroke-[2.2]" />
              <span>{isVideo ? '用作参考素材' : '用作参考图'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
