import React, { useState, useRef, useCallback } from 'react';
import { Columns2, Sliders, ImageOff } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasNode } from '../../model/types';

interface Props {
  node: CanvasNode;
  nodes: CanvasNode[];
  projectId: string;
  selected?: boolean;
}

export const CanvasCompareNode: React.FC<Props> = ({ node, nodes, projectId }) => {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Derive before/after images from linked upstream nodes if not explicitly stored
  const linkedImages = (node.referenceNodeIds || [])
    .map((id) => nodes.find((n) => n.id === id)?.imageUrl)
    .filter(Boolean) as string[];

  const beforeUrl = node.compareBeforeUrl || linkedImages[0] || node.imageUrl;
  const afterUrl = node.compareAfterUrl || linkedImages[1] || linkedImages[0];
  const split = node.compareSplit ?? 50;
  const mode = node.compareMode || 'split';

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width < 1) return;
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = Math.round((x / rect.width) * 100);
      updateNode(projectId, node.id, { compareSplit: percentage });
    },
    [isDragging, node.id, projectId, updateNode],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
  }, []);

  const toggleMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNode(projectId, node.id, {
      compareMode: mode === 'split' ? 'side-by-side' : 'split',
    });
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative flex flex-col w-full h-full rounded-2xl bg-white dark:bg-[#1B1B1E] border border-slate-200/90 dark:border-white/10 shadow-lg overflow-hidden select-none"
      style={{ minHeight: `${node.height || 360}px` }}
    >
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-white/5 border-b border-slate-200/80 dark:border-white/10 text-xs">
        <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
          <Sliders className="w-3.5 h-3.5 text-indigo-500" />
          <span>{node.title || '前后画质对比'}</span>
        </div>
        <button
          type="button"
          onClick={toggleMode}
          title={mode === 'split' ? '切换为并排对比' : '切换为卷帘对比'}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition-colors cursor-pointer"
        >
          <Columns2 className="w-3 h-3" />
          <span>{mode === 'split' ? '卷帘模式' : '并排模式'}</span>
        </button>
      </div>

      {/* 对比主体视口 */}
      <div className="relative flex-1 w-full h-full min-h-[280px] bg-slate-900/90 overflow-hidden">
        {!beforeUrl && !afterUrl ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs p-6 text-center">
            <ImageOff className="w-8 h-8 mb-2 opacity-50" />
            <p className="font-medium text-slate-300">请连接至少一张图片</p>
            <p className="text-[11px] text-slate-500 mt-1 dark:text-slate-400">从上游生成节点拖动连线到本节点左侧端口</p>
          </div>
        ) : mode === 'side-by-side' ? (
          <div className="grid grid-cols-2 w-full h-full gap-0.5 p-1 bg-slate-950">
            <div className="relative w-full h-full overflow-hidden rounded-lg bg-black/40 flex items-center justify-center">
              {beforeUrl ? (
                <img src={proxyMediaUrl(beforeUrl)} alt="Before" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">待连入修前图</span>
              )}
              <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white">原图 / 镜头 A</span>
            </div>
            <div className="relative w-full h-full overflow-hidden rounded-lg bg-black/40 flex items-center justify-center">
              {afterUrl ? (
                <img src={proxyMediaUrl(afterUrl)} alt="After" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">待连入修后图</span>
              )}
              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-indigo-600/80 text-[10px] text-white">精修 / 镜头 B</span>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* 底图（After） */}
            {afterUrl && (
              <img
                src={proxyMediaUrl(afterUrl)}
                alt="After"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
            )}
            {/* 顶图（Before，根据 split 裁剪） */}
            {beforeUrl && (
              <img
                src={proxyMediaUrl(beforeUrl)}
                alt="Before"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{
                  clipPath: `inset(0 ${100 - split}% 0 0)`,
                }}
              />
            )}

            {/* 卷帘滑动分割线 */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white cursor-ew-resize z-20 group/slider"
              style={{ left: `${split}%` }}
              onPointerDown={handlePointerDown}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.3)] border border-slate-300 flex items-center justify-center group-hover/slider:scale-110 transition-transform dark:border-white/40">
                <Sliders className="w-3.5 h-3.5 text-indigo-600 rotate-90" />
              </div>
            </div>

            {/* 浮动标签 */}
            <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] text-white pointer-events-none">
              原版 ({split}%)
            </span>
            <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-indigo-600/80 backdrop-blur-xs text-[10px] text-white pointer-events-none">
              精修 ({100 - split}%)
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
