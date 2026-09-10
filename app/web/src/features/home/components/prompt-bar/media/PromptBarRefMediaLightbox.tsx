import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { normalizeImageUrlToStandardJpg } from '@beike/domain/drawing';
import { isImageFile, isVideoFile, type RefMediaKind } from '@/lib/mediaUpload';
import { isVideoRef, RefMediaThumb } from './PromptBarRefMediaThumb';

export interface PromptBarRefMediaLightboxProps {
  items: string[];
  currentIndex: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  resolveMediaFile?: (url: string) => File | undefined;
  resolveMediaKind?: (url: string) => RefMediaKind | undefined;
}

export function PromptBarRefMediaLightbox({
  items,
  currentIndex,
  onClose,
  onIndexChange,
  resolveMediaFile,
  resolveMediaKind,
}: PromptBarRefMediaLightboxProps) {
  const [activeIndex, setActiveIndex] = useState<number>(currentIndex);

  useEffect(() => {
    setActiveIndex(currentIndex);
  }, [currentIndex]);

  const count = items.length;
  const currentUrl = items[activeIndex] || items[0] || '';
  const currentFile = currentUrl ? resolveMediaFile?.(currentUrl) : undefined;
  const currentKind = currentUrl ? resolveMediaKind?.(currentUrl) : undefined;
  const isVideo = isVideoRef(currentUrl, currentFile, currentKind);

  // 解析当前媒体真实 src（支持本地 Blob URL 自动释放）
  const [mediaSrc, setMediaSrc] = useState<string>(() => {
    if (!currentUrl) return '';
    if (isVideo) return currentUrl;
    return normalizeImageUrlToStandardJpg(currentUrl) || currentUrl;
  });

  useEffect(() => {
    if (!currentUrl) {
      setMediaSrc('');
      return;
    }

    let blobUrl: string | null = null;

    if (isVideo) {
      if (currentUrl.startsWith('blob:') || currentUrl.startsWith('data:')) {
        setMediaSrc(currentUrl);
      } else if (currentFile && isVideoFile(currentFile)) {
        blobUrl = URL.createObjectURL(currentFile);
        setMediaSrc(blobUrl);
      } else {
        setMediaSrc(currentUrl);
      }
    } else {
      const normalized = normalizeImageUrlToStandardJpg(currentUrl);
      if (normalized) {
        setMediaSrc(normalized);
      } else if (currentFile && isImageFile(currentFile)) {
        blobUrl = URL.createObjectURL(currentFile);
        setMediaSrc(blobUrl);
      } else {
        setMediaSrc(currentUrl);
      }
    }

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [currentUrl, currentFile, isVideo]);

  // 上一张 / 下一张
  const handlePrev = useCallback(() => {
    if (count <= 1) return;
    setActiveIndex((prev) => {
      const next = prev > 0 ? prev - 1 : count - 1;
      onIndexChange?.(next);
      return next;
    });
  }, [count, onIndexChange]);

  const handleNext = useCallback(() => {
    if (count <= 1) return;
    setActiveIndex((prev) => {
      const next = prev < count - 1 ? prev + 1 : 0;
      onIndexChange?.(next);
      return next;
    });
  }, [count, onIndexChange]);

  // 键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, onClose]);

  if (!items || items.length === 0 || !currentUrl) {
    return null;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs select-none animate-fade-in text-white p-4 sm:p-6 cursor-zoom-out"
      onClick={onClose}
    >
      {/* 🌟 中间大图主展示区 (点击图片外部任何空白处均可直接退出全屏) */}
      <div className="relative flex-1 w-full max-w-7xl flex items-center justify-center my-auto min-h-0 overflow-hidden">
        {/* 左侧切图悬浮箭头 */}
        {count > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-3 sm:left-6 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 flex items-center justify-center transition-all cursor-pointer shadow-lg hover:scale-110 active:scale-95 group"
            title="上一张 (←)"
          >
            <ChevronLeft className="w-6 h-6 stroke-[2.2] group-hover:-translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* 媒体主体内容 (仅媒体自身阻止冒泡，避免误关闭) */}
        <div
          className="relative max-w-full max-h-[86vh] flex items-center justify-center cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          {isVideo ? (
            <video
              key={mediaSrc}
              src={mediaSrc}
              controls
              autoPlay
              playsInline
              className="max-w-[92vw] max-h-[84vh] w-auto h-auto rounded-2xl shadow-2xl border border-white/20 bg-black object-contain"
            />
          ) : (
            <img
              key={mediaSrc}
              src={mediaSrc}
              alt={`参考素材-${activeIndex + 1}`}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.hasRetried && currentUrl) {
                  target.dataset.hasRetried = 'true';
                  target.src = proxyMediaUrl(currentUrl);
                }
              }}
              className="max-w-[92vw] max-h-[84vh] w-auto h-auto object-contain rounded-2xl shadow-2xl border border-white/20 select-none transition-transform duration-200"
            />
          )}
        </div>

        {/* 右侧切图悬浮箭头 */}
        {count > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-3 sm:right-6 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 flex items-center justify-center transition-all cursor-pointer shadow-lg hover:scale-110 active:scale-95 group"
            title="下一张 (→)"
          >
            <ChevronRight className="w-6 h-6 stroke-[2.2] group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </div>

      {/* 🌟 3. 底部快捷缩略图条 (当素材 > 1 时提供快速跳转) */}
      {count > 1 && (
        <div
          className="w-full max-w-4xl flex items-center justify-center py-1 z-10 cursor-default shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 max-w-full overflow-x-auto px-3 py-1.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 scrollbar-none shadow-lg">
            {items.map((url, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => {
                    setActiveIndex(idx);
                    onIndexChange?.(idx);
                  }}
                  className={`relative w-11 h-13 sm:w-12 sm:h-14 rounded-lg overflow-hidden flex-shrink-0 transition-all cursor-pointer border ${
                    isSelected
                      ? 'ring-2 ring-sky-400 border-white scale-105 shadow-md opacity-100'
                      : 'border-white/20 opacity-55 hover:opacity-90 hover:scale-102'
                  }`}
                  title={`切换到第 ${idx + 1} 个素材`}
                >
                  <RefMediaThumb
                    url={url}
                    file={resolveMediaFile?.(url)}
                    mediaKind={resolveMediaKind?.(url)}
                    alt={`素材缩略图-${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/70 text-[8px] font-bold text-white leading-tight">
                    {idx + 1}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
