import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { PptSlidePage } from '@shared/contracts/pptGeneration';

interface Props {
  pages: PptSlidePage[];
  initialPageIndex?: number;
  onClose: () => void;
}

export const PptPresentationModal: React.FC<Props> = ({
  pages,
  initialPageIndex = 1,
  onClose,
}) => {
  const [currentIdx, setCurrentIdx] = useState(
    Math.max(0, Math.min(pages.length - 1, initialPageIndex - 1))
  );
  const [isBlackout, setIsBlackout] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const currentPage = pages[currentIdx];
  const activeVersion =
    currentPage?.versions.find((v) => v.id === currentPage.currentVersionId) ||
    currentPage?.versions[currentPage?.versions.length - 1];

  const goNext = () => {
    if (currentIdx < pages.length - 1) setCurrentIdx((i) => i + 1);
  };

  const goPrev = () => {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (pages.length === 0) {
        if (e.key === 'Escape') onCloseRef.current();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrentIdx((i) => Math.min(pages.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIdx((i) => Math.max(0, i - 1));
      } else if (e.key.toLowerCase() === 'b') {
        setIsBlackout((b) => !b);
      } else if (e.key.toLowerCase() === 'n') {
        setShowNotes((n) => !n);
      } else if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pages.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black select-none">
      {/* 黑屏遮罩模式 */}
      {isBlackout ? (
        <div className="absolute inset-0 bg-black flex items-center justify-center text-slate-300 text-sm">
          <span>演讲黑屏暂停中（按 B 恢复）</span>
        </div>
      ) : (
        <div className="relative w-full h-full flex items-center justify-center p-4">
          {activeVersion?.url ? (
            <img
              src={activeVersion.url}
              alt={currentPage.title}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-opacity duration-200"
            />
          ) : (
            <div className="w-full max-w-4xl aspect-[16/9] rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
              <span>该页尚未生成幻灯片渲染图</span>
            </div>
          )}
        </div>
      )}

      {/* 顶部悬浮控制栏 */}
      <div className="absolute top-4 left-6 right-6 flex items-center justify-between text-white/80 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 pointer-events-auto text-xs font-mono">
          {pages.length === 0 ? '0 / 0' : `${currentIdx + 1} / ${pages.length}`}
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowNotes((n) => !n)}
            className={`px-3 py-1.5 rounded-xl text-xs backdrop-blur-md border border-white/10 transition-colors ${
              showNotes ? 'bg-indigo-600 text-white' : 'bg-black/60 text-white/80 hover:bg-black/80'
            }`}
          >
            演讲备注 (N)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 左右翻页热区按钮 */}
      {currentIdx > 0 && (
        <button
          type="button"
          onClick={goPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 hover:bg-black/70 text-white/70 hover:text-white backdrop-blur-md transition-all"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {currentIdx < pages.length - 1 && (
        <button
          type="button"
          onClick={goNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 hover:bg-black/70 text-white/70 hover:text-white backdrop-blur-md transition-all"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* 演讲备注抽屉 */}
      {showNotes && currentPage?.detail.speakerNotes && (
        <div className="absolute bottom-6 left-6 right-6 max-w-xl mx-auto rounded-2xl bg-black/80 backdrop-blur-xl border border-white/15 p-4 text-white shadow-2xl animate-fade-in">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">
            本页口播要点
          </span>
          <p className="text-xs leading-relaxed text-slate-200">
            {currentPage.detail.speakerNotes}
          </p>
        </div>
      )}
    </div>
  );
};
