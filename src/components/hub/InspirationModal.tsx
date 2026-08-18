'use client';
import { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Image as ImageIcon, 
  Heart, 
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Info
} from 'lucide-react';
import { formatPromptParagraphs, formatDisplayModel } from '@/lib/drawing';

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
  onUseAsReference: (prompt: string, imageUrl: string) => void;
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
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allItems.length - 1;

  const handlePrev = () => {
    if (hasPrev && onNavigate) {
      onNavigate(allItems[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext && onNavigate) {
      onNavigate(allItems[currentIndex + 1]);
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
      {/* 🌟 居中大方的主容器 (严格对标截图：图/视频与信息面板并排紧凑美观) */}
      <div 
        className="w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl max-h-[92vh] flex flex-col md:flex-row items-center justify-center gap-4 lg:gap-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🌟 1. 左侧：全尺寸高清大图/高清视频呈现 */}
        <div className="flex-1 h-full max-h-[88vh] flex items-center justify-center relative min-w-0">
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
              className="max-h-[86vh] w-auto max-w-full object-contain rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-white/60 select-none transition-all duration-300"
            />
          )}
        </div>

        {/* 🌟 2. 中间/右侧翻页与关闭浮动按钮组 */}
        <div className="flex md:flex-col items-center justify-center gap-3 z-30 flex-shrink-0">
          {/* 关闭按钮 (✕) */}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/90 hover:bg-white text-slate-700 shadow-md border border-slate-200/80 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="关闭 (Esc)"
          >
            <X className="w-4.5 h-4.5 stroke-[2.2]" />
          </button>

          {/* 向上/上一个 */}
          <button
            onClick={handlePrev}
            disabled={!hasPrev}
            className={`w-8 h-8 rounded-full bg-white/80 hover:bg-white shadow-sm border border-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer ${
              !hasPrev ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105 active:scale-95'
            }`}
            title="查看上一个 (↑)"
          >
            <ChevronUp className="w-4.5 h-4.5 stroke-[2]" />
          </button>

          {/* 向下/下一个 */}
          <button
            onClick={handleNext}
            disabled={!hasNext}
            className={`w-8 h-8 rounded-full bg-white/80 hover:bg-white shadow-sm border border-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer ${
              !hasNext ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105 active:scale-95'
            }`}
            title="查看下一个 (↓)"
          >
            <ChevronDown className="w-4.5 h-4.5 stroke-[2]" />
          </button>
        </div>

        {/* 🌟 3. 右侧：精致大方的信息与操作面板 (严格对标截图) */}
        <div className="w-full md:w-[350px] lg:w-[380px] xl:w-[400px] max-h-[86vh] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200/90 flex flex-col justify-between flex-shrink-0 overflow-y-auto">
          <div className="space-y-5">
            {/* 作者信息与右侧互动 */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-red-500 to-orange-500 text-white flex items-center justify-center font-bold text-[11px] shadow-xs">
                  {item.author?.name ? item.author.name.slice(0, 1) : '贝'}
                </div>
                <span className="text-xs font-bold text-slate-900">
                  {item.author?.name || '贝壳云图'}
                </span>
                <button
                  onClick={() => setIsFollowing(!isFollowing)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                    isFollowing 
                      ? 'bg-slate-100 text-slate-500' 
                      : 'bg-[#F2F4F7] hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  {isFollowing ? '已关注' : '+ 关注'}
                </button>
              </div>

              {/* 点赞与更多 */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleToggleLike}
                  className="flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
                  title="点赞"
                >
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500 stroke-rose-500' : 'text-slate-600 stroke-[1.8]'}`} />
                  <span>{likes}</span>
                </button>
                <button className="text-slate-400 hover:text-slate-800 transition-colors cursor-pointer">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 日期与生成标记 */}
            <div className="text-[11px] text-slate-400 font-sans">
              {item.date || '2026-08-16 | 内容由 AI 生成'}
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
                onUsePromptOnly(item.prompt);
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
