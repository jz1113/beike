'use client';
import { useState, useEffect } from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { 
  X, 
  Sparkles, 
  Image as ImageIcon, 
  Heart, 
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Info
} from 'lucide-react';
import { formatPromptParagraphs, formatDisplayModel } from '@/lib/drawing';

export interface InspirationUseOptions {
  referenceImages?: string[];
  videoRefMode?: string;
  videoDuration?: number;
  videoModel?: string;
  videoAspectId?: string;
  videoResolution?: '480P' | '720P' | '1080P' | '4K';
}

export interface InspirationItem {
  id: string | number;
  isBanner?: boolean;
  category: string;
  tag: string;
  title: string;
  prompt: string;
  image: string;
  video?: string;
  mediaType?: 'image' | 'video';
  referenceImages?: string[];
  referenceLabels?: string[];
  videoRefMode?: string;
  videoDuration?: number;
  author?: {
    name: string;
    avatar?: string;
    badge?: string;
  };
  likes?: number;
  date?: string;
  aspectRatio?: string;
  model?: string;
  quality?: string;
}

interface Props {
  item: InspirationItem | null;
  allItems: InspirationItem[];
  isOpen: boolean;
  onClose: () => void;
  onUsePromptOnly: (prompt: string) => void;
  onUseAsReference: (prompt: string, imageUrl: string, opts?: InspirationUseOptions) => void;
  onNavigate?: (newItem: InspirationItem) => void;
}

export default function InspirationModal({
  item,
  allItems,
  isOpen,
  onClose,
  onUsePromptOnly,
  onUseAsReference,
  onNavigate
}: Props) {
  const [likes, setLikes] = useState(119);
  const [isLiked, setIsLiked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    if (item) {
      const baseLikes = item.likes || (typeof item.id === 'number' ? item.id * 17 + 52 : 119);
      setLikes(baseLikes);
      setIsLiked(false);
      setIsFollowing(false);
    }
  }, [item?.id, item?.likes]);

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
  }, [isOpen, item, allItems]);

  if (!isOpen || !item) return null;

  const currentIndex = allItems.findIndex(i => i.id === item.id);
  const total = allItems.length;

  const handlePrev = () => {
    if (total > 1 && onNavigate) {
      const prevIdx = (currentIndex - 1 + total) % total;
      onNavigate(allItems[prevIdx]);
    }
  };

  const handleNext = () => {
    if (total > 1 && onNavigate) {
      const nextIdx = (currentIndex + 1) % total;
      onNavigate(allItems[nextIdx]);
    }
  };

  const handleToggleLike = () => {
    if (isLiked) {
      setLikes(prev => prev - 1);
      setIsLiked(false);
    } else {
      setLikes(prev => prev + 1);
      setIsLiked(true);
    }
  };

  const isVideo = item.mediaType === 'video' || item.video || item.image.endsWith('.mp4');

  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 lg:p-10 select-none font-sans animate-fade-in"
      onClick={onClose}
    >
      {/* 🌟 居中大方的主容器 (左侧媒体展示 + 左右大箭头 + 右侧信息面板) */}
      <div 
        className="w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl max-h-[92vh] flex flex-col md:flex-row items-center justify-center gap-4 lg:gap-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🌟 1. 左侧：全尺寸高清大图/高清视频呈现 + 原生对称左右翻页控制器 */}
        <div className="flex-1 h-full max-h-[88vh] flex items-center justify-center relative min-w-0 group/canvas">
          {/* 左翻页按钮 (← 上一个，循环轮播) */}
          {total > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/55 hover:bg-black/85 text-white shadow-2xl border border-white/25 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer z-30 backdrop-blur-md group/btn"
              title="上一个 (←)"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.5] -translate-x-0.5 group-hover/btn:-translate-x-1 transition-transform" />
            </button>
          )}

          {/* 右翻页按钮 (→ 下一个，循环轮播) */}
          {total > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/55 hover:bg-black/85 text-white shadow-2xl border border-white/25 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer z-30 backdrop-blur-md group/btn"
              title="下一个 (→)"
            >
              <ChevronRight className="w-6 h-6 stroke-[2.5] translate-x-0.5 group-hover/btn:translate-x-1 transition-transform" />
            </button>
          )}

          {isVideo ? (
            <video 
              src={item.video || item.image} 
              controls 
              autoPlay 
              loop 
              playsInline
              className="max-h-[86vh] w-auto max-w-full object-contain rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.22)] border border-white/60 select-none transition-all duration-300 bg-black"
            />
          ) : (
            <img 
              src={item.image} 
              alt={item.title}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.hasRetried && item.image) {
                  target.dataset.hasRetried = 'true';
                  if (item.image.startsWith('http://') || item.image.startsWith('https://') || item.image.startsWith('//')) {
                    target.src = proxyMediaUrl(item.image);
                  }
                }
              }}
              className="max-h-[86vh] w-auto max-w-full object-contain rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-white/60 select-none transition-all duration-300 bg-slate-100"
            />
          )}
        </div>

        {/* 🌟 2. 右侧：精致大方的信息与操作面板 */}
        <div className="w-full md:w-[350px] lg:w-[380px] xl:w-[400px] max-h-[86vh] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200/90 flex flex-col justify-between flex-shrink-0 overflow-y-auto relative">
          
          <div className="space-y-4">
            {/* 顶部 Header: 左侧作者信息，右侧翻页胶囊与关闭按钮 (单行自适应弹性布局，彻底杜绝重叠) */}
            <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-[11px] shadow-xs shrink-0">
                  {item.author?.name ? item.author.name.slice(0, 1) : '贝'}
                </div>
                <span className="text-xs font-bold text-slate-900 truncate">
                  {item.author?.name || '贝壳云图'}
                </span>
                <button
                  onClick={() => setIsFollowing(!isFollowing)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                    isFollowing 
                      ? 'bg-slate-100 text-slate-500' 
                      : 'bg-[#F2F4F7] hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  {isFollowing ? '已关注' : '+ 关注'}
                </button>
              </div>

              {/* 右侧：关闭按钮 */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer"
                  title="关闭 (Esc)"
                >
                  <X className="w-4 h-4 stroke-[2.2]" />
                </button>
              </div>
            </div>

            {/* 日期与生成标记 + 点赞互动 */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-sans">
              <span>{item.date || '2026-08-19 | 内容由 AI 生成'}</span>
              <button
                onClick={handleToggleLike}
                className="flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
                title="点赞"
              >
                <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-500 text-rose-500 stroke-rose-500' : 'text-slate-600 stroke-[1.8]'}`} />
                <span>{likes}</span>
              </button>
            </div>

            {/* 提示词正文 */}
            <div className="space-y-2 pt-1">
              <div className="text-xs font-medium text-slate-400">
                {isVideo ? '视频提示词' : '图片提示词'}
              </div>
              <div className="text-[13px] sm:text-[13.5px] text-slate-800 leading-relaxed font-normal select-text max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 pr-1 space-y-2.5">
                {formatPromptParagraphs(item.prompt).map((para, pIdx) => (
                  <p key={pIdx} className="break-words leading-relaxed">
                    {para}
                  </p>
                ))}
              </div>
            </div>

            {/* 参考素材（视频全能参考 / 多帧） */}
            {item.referenceImages && item.referenceImages.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-xs font-medium text-slate-400">
                  参考素材 ({item.referenceImages.length})
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {item.referenceImages.map((refUrl, refIdx) => (
                    <div key={refIdx} className="space-y-1">
                      <div className="aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80">
                        <img
                          src={refUrl}
                          alt={item.referenceLabels?.[refIdx] || `参考素材 ${refIdx + 1}`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium text-center truncate px-0.5">
                        {item.referenceLabels?.[refIdx] || `@${refIdx + 1}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 参数规格标签条 */}
            <div className="pt-2.5 flex items-center gap-2.5 text-xs text-slate-400 font-sans border-t border-slate-100">
              <span className="font-medium text-slate-700">{formatDisplayModel(item.model || (isVideo ? 'Seedance 2.5' : 'gpt-image-2'))}</span>
              <span className="text-slate-300">|</span>
              <span className="font-mono text-slate-600">{item.aspectRatio || '3:4'}</span>
              {item.quality && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="font-mono text-slate-600">{item.quality}</span>
                </>
              )}
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-0.5 text-slate-500">
                <span>更多</span>
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* 🌟 底部双按钮 (做同款 / 用作参考图) */}
          <div className="pt-6 mt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
            {/* 做同款 */}
            <button
              onClick={() => {
                const isVideoItem = item.mediaType === 'video' || !!item.video || item.image.endsWith('.mp4');
                if (isVideoItem) {
                  const useOpts: InspirationUseOptions | undefined = item.referenceImages?.length
                    ? {
                        referenceImages: item.referenceImages,
                        videoRefMode: item.videoRefMode || 'omni',
                        videoDuration: item.videoDuration,
                        videoModel: item.model,
                        videoAspectId: item.aspectRatio,
                        videoResolution: (item.quality?.toUpperCase() as InspirationUseOptions['videoResolution']) || '720P',
                      }
                    : undefined;
                  onUseAsReference(item.prompt, item.video || item.image, useOpts);
                } else {
                  // 文生图做同款：只填提示词，不把成品图当参考图
                  onUsePromptOnly(item.prompt);
                }
                onClose();
              }}
              className="py-2.5 px-3 rounded-xl bg-[#F0F2F5] hover:bg-[#E4E7EB] text-slate-900 font-bold text-xs sm:text-[13px] flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-slate-700" />
              <span>做同款</span>
            </button>

            {/* 用作参考图 */}
            <button
              onClick={() => {
                onUseAsReference(item.prompt, item.video || item.image);
                onClose();
              }}
              className="py-2.5 px-3 rounded-xl bg-[#F0F2F5] hover:bg-[#E4E7EB] text-slate-900 font-bold text-xs sm:text-[13px] flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <ImageIcon className="w-3.5 h-3.5 text-slate-700" />
              <span>{isVideo ? '用作参考素材' : '用作参考图'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
