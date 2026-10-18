import React, { useRef, useState } from 'react';
import {
  Clock,
  History,
  Paintbrush,
  RotateCcw,
  X,
} from 'lucide-react';
import type { PptBoundingBox } from '@shared/contracts/pptGeneration';
import { usePptStore } from '../store/usePptStore';

export const PptSlideStudioStage: React.FC<{ onStartPresentation?: () => void }> = () => {
  const {
    pages,
    currentPageIndex,
    setCurrentPageIndex,
    generateSingleSlide,
    switchPageVersion,
    isGeneratingSlides,
    slideProgressText,
  } = usePptStore();

  const currentPage = pages.find((p) => p.pageIndex === currentPageIndex) || pages[0];
  const activeVersion =
    currentPage?.versions.find((v) => v.id === currentPage.currentVersionId) ||
    currentPage?.versions[currentPage?.versions.length - 1];

  // 框选相关状态
  const boardRef = useRef<HTMLDivElement>(null);
  const [isDrawingBox, setIsDrawingBox] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<PptBoundingBox | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  // 鼠标拖拽框选
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setIsDrawingBox(true);
    setStartPos({ x, y });
    setCurrentBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingBox || !startPos || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const curX = ((e.clientX - rect.left) / rect.width) * 100;
    const curY = ((e.clientY - rect.top) / rect.height) * 100;

    const x = Math.min(startPos.x, curX);
    const y = Math.min(startPos.y, curY);
    const width = Math.abs(curX - startPos.x);
    const height = Math.abs(curY - startPos.y);

    setCurrentBox({ x, y, width, height });
  };

  const handleMouseUp = () => {
    setIsDrawingBox(false);
    if (currentBox && (currentBox.width < 3 || currentBox.height < 3)) {
      setCurrentBox(null);
    }
  };

  const handleTriggerInpaint = () => {
    if (!editInstruction.trim() || !currentPage) return;
    generateSingleSlide(currentPage.pageIndex, editInstruction.trim(), activeVersion?.url);
    setCurrentBox(null);
    setEditInstruction('');
  };

  if (!currentPage) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 select-none relative">
      {/* 顶部状态条 */}
      {isGeneratingSlides && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-indigo-600/90 backdrop-blur-md text-white text-xs px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>{slideProgressText || '正在渲染幻灯片...'}</span>
        </div>
      )}

      {/* 中央主画板 */}
      <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden">
        <div
          ref={boardRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="relative aspect-[16/9] w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-slate-950 flex items-center justify-center cursor-crosshair group/board"
        >
          {activeVersion?.url ? (
            <img
              src={activeVersion.url}
              alt={currentPage.title}
              className="w-full h-full object-contain pointer-events-none"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
              <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-indigo-500 animate-spin" />
              <p className="text-xs">等待生成本页渲染画面...</p>
            </div>
          )}

          {/* 用户拉取的矩形框选区 */}
          {currentBox && (
            <div
              style={{
                left: `${currentBox.x}%`,
                top: `${currentBox.y}%`,
                width: `${currentBox.width}%`,
                height: `${currentBox.height}%`,
              }}
              className="absolute border-2 border-indigo-400 bg-indigo-500/20 rounded shadow-md pointer-events-none"
            />
          )}

          {/* 框选完成后浮出的编辑气泡 */}
          {currentBox && !isDrawingBox && (
            <div
              style={{
                left: `${Math.min(75, Math.max(5, currentBox.x))}%`,
                top: `${Math.min(75, currentBox.y + currentBox.height + 2)}%`,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute z-40 bg-slate-950/95 border border-white/15 rounded-2xl p-3 shadow-2xl backdrop-blur-xl w-72 space-y-2 cursor-default animate-fade-in"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-400 flex items-center gap-1">
                  <Paintbrush className="h-3 w-3" />
                  <span>框选区域 Vibe 修改</span>
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentBox(null)}
                  className="text-slate-400 hover:text-white p-0.5 rounded"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              <input
                type="text"
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTriggerInpaint()}
                placeholder="例如：将此处的数字改成 85%..."
                className="w-full bg-white/10 text-xs text-white placeholder:text-slate-400 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:placeholder:text-slate-500 dark:bg-[#18191c]/95"
              />

              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentBox(null)}
                  className="px-2 py-1 text-[11px] text-slate-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!editInstruction.trim()}
                  onClick={handleTriggerInpaint}
                  className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
                >
                  应用修改
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 悬浮工具小胶囊 */}
        <div className="absolute right-8 top-8 flex flex-col gap-2 z-20">
          <button
            type="button"
            onClick={() => setShowHistoryDrawer((h) => !h)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-white text-xs border border-white/10 backdrop-blur-md shadow-lg transition-colors"
          >
            <History className="h-3.5 w-3.5 text-indigo-400" />
            <span>版本时光机 ({currentPage.versions.length})</span>
          </button>

          <button
            type="button"
            disabled={currentPage.isGenerating}
            onClick={() => generateSingleSlide(currentPage.pageIndex)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs border border-indigo-400/20 backdrop-blur-md shadow-lg transition-colors"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${currentPage.isGenerating ? 'animate-spin' : ''}`} />
            <span>重新渲染本页</span>
          </button>
        </div>
      </div>

      {/* 底部胶卷缩略图滑动列表 */}
      <div className="h-28 shrink-0 bg-slate-950/80 border-t border-white/10 px-6 flex items-center gap-4 overflow-x-auto z-20">
        {pages.map((p) => {
          const isSelected = p.pageIndex === currentPageIndex;
          const ver = p.versions.find((v) => v.id === p.currentVersionId) || p.versions[p.versions.length - 1];

          return (
            <button
              key={p.pageIndex}
              type="button"
              onClick={() => setCurrentPageIndex(p.pageIndex)}
              className={`group/thumb relative aspect-[16/9] h-20 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                isSelected
                  ? 'border-indigo-500 shadow-lg shadow-indigo-500/20 scale-105'
                  : 'border-white/10 opacity-70 hover:opacity-100'
              }`}
            >
              {ver?.url ? (
                <img src={ver.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-slate-900 flex items-center justify-center text-[10px] text-slate-500 dark:text-slate-400 dark:bg-white">
                  第 {p.pageIndex} 页
                </div>
              )}
              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-mono text-white">
                {p.pageIndex}
              </div>
            </button>
          );
        })}
      </div>

      {/* 右侧时光机版本抽屉 */}
      {showHistoryDrawer && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-950/95 border-l border-white/10 p-5 z-40 backdrop-blur-2xl flex flex-col animate-slide-left space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-400" />
              <span>第 {currentPage.pageIndex} 页历史版本</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowHistoryDrawer(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3">
            {currentPage.versions.map((v, i) => {
              const isCurrent = v.id === activeVersion?.id;
              return (
                <div
                  key={v.id}
                  onClick={() => switchPageVersion(currentPage.pageIndex, v.id)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                    isCurrent
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-md'
                      : 'border-white/10 hover:border-white/20 bg-white/5 dark:bg-[#18191c]/95'
                  }`}
                >
                  <div className="aspect-[16/9] w-full rounded-lg overflow-hidden bg-slate-900 mb-2">
                    <img src={v.url} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center justify-between text-white text-[11px]">
                    <span className="font-semibold">版本 {i + 1}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(v.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {v.editInstruction && (
                    <p className="text-[10px] text-indigo-300 mt-1 truncate">
                      修改指令：{v.editInstruction}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
