import { useEffect } from 'react';
import { proxyMediaUrl } from '@/shared/api/apiClient';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
} from 'lucide-react';

export interface BatchPreviewLightboxProps {
  previewImageUrl: string | null;
  previewGallery: { images: string[]; currentIndex: number; title?: string } | null;
  closeGalleryPreview: () => void;
  setGalleryIndex: (index: number) => void;
  handleDownloadSingleTaskImage: (url: string, name: string) => void;
}

export function BatchPreviewLightbox({
  previewImageUrl,
  previewGallery,
  closeGalleryPreview,
  setGalleryIndex,
  handleDownloadSingleTaskImage,
}: BatchPreviewLightboxProps) {
  // 键盘事件快捷切换或关闭大图预览
  useEffect(() => {
    if (!previewImageUrl && !previewGallery) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeGalleryPreview();
      } else if (e.key === 'ArrowLeft') {
        if (previewGallery && previewGallery.images.length > 1) {
          setGalleryIndex(previewGallery.currentIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (previewGallery && previewGallery.images.length > 1) {
          setGalleryIndex(previewGallery.currentIndex + 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImageUrl, previewGallery, setGalleryIndex, closeGalleryPreview]);

  if (!previewImageUrl && !previewGallery) return null;

  const currentImageUrl = previewGallery
    ? previewGallery.images[previewGallery.currentIndex]
    : previewImageUrl;

  return (
    <div
      className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in duration-200 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeGalleryPreview();
      }}
    >
      {/* 顶栏操作条 */}
      <div className="w-full max-w-6xl flex items-center justify-between text-white/90 py-2 z-10">
        <div className="flex items-center gap-3">
          <span className="text-xs sm:text-sm font-bold bg-white/10 px-3 py-1 rounded-full backdrop-blur-md">
            {previewGallery?.title || '图片高清大图预览'}
          </span>
          {previewGallery && previewGallery.images.length > 1 && (
            <span className="text-xs font-mono bg-indigo-600/80 text-white px-2.5 py-0.5 rounded-full font-bold">
              {previewGallery.currentIndex + 1} / {previewGallery.images.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (currentImageUrl) {
                handleDownloadSingleTaskImage(currentImageUrl, `beike_preview_${Date.now()}`);
              }
            }}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-md"
            title="下载当前原图"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">下载原图</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (currentImageUrl) window.open(currentImageUrl, '_blank');
            }}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-md"
            title="在新标签页打开"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden sm:inline">原图外链</span>
          </button>

          <button
            type="button"
            onClick={closeGalleryPreview}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition-all cursor-pointer backdrop-blur-md ml-1"
            title="关闭预览 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 中间图片区域与左右箭头 */}
      <div className="flex-1 w-full max-w-6xl flex items-center justify-between relative min-h-0 py-2">
        {previewGallery && previewGallery.images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setGalleryIndex(previewGallery.currentIndex - 1);
            }}
            className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shrink-0 shadow-lg"
            title="上一张 (← 键盘左方向键)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <div
          className="flex-1 h-full flex items-center justify-center px-4 min-w-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeGalleryPreview();
          }}
        >
          {currentImageUrl && (
            <img
              src={proxyMediaUrl(currentImageUrl)}
              alt="高清大图预览"
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl transition-all duration-200"
            />
          )}
        </div>

        {previewGallery && previewGallery.images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setGalleryIndex(previewGallery.currentIndex + 1);
            }}
            className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shrink-0 shadow-lg"
            title="下一张 (→ 键盘右方向键)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* 底部缩略图导航栏 (当多于 1 张图时) */}
      {previewGallery && previewGallery.images.length > 1 && (
        <div className="w-full max-w-2xl flex items-center justify-center gap-2 overflow-x-auto py-2 px-4 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 shrink-0">
          {previewGallery.images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setGalleryIndex(idx)}
              className={`w-12 h-12 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                idx === previewGallery.currentIndex
                  ? 'border-indigo-400 scale-105 shadow-md shadow-indigo-500/30'
                  : 'border-transparent opacity-40 hover:opacity-80'
              }`}
            >
              <img src={proxyMediaUrl(img)} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
