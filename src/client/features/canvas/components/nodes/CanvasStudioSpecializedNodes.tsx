import { useEffect, useRef, useState } from 'react';
import { Download, Eraser, RotateCcw } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasNode } from '../../model/types';
export { CanvasVideoTimelineNode, CanvasStoryboardTableNode } from './CanvasStudioProductionNodes';

const DOODLE_COLORS = ['#ffffff', '#18181b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];

export function CanvasDoodlePadNode({
  node,
  projectId,
  updateNode,
}: {
  node: CanvasNode;
  projectId: string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState('#ffffff');
  const [size, setSize] = useState(4);
  const [eraser, setEraser] = useState(false);
  const drawingRef = useRef(false);

  const initialImage = useRef(node.imageUrl);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!initialImage.current) return;
    const saved = new Image();
    saved.onload = () => ctx.drawImage(saved, 0, 0, canvas.width, canvas.height);
    saved.src = proxyMediaUrl(initialImage.current) || initialImage.current;
    return () => { saved.onload = null; };
  }, []);

  const commitCanvasToImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    updateNode(projectId, node.id, { imageUrl: dataUrl, status: 'success' });
  };

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  };

  const clearBoard = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    commitCanvasToImage();
  };

  return (
    <div
      className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1f1f1f]"
      style={{ width: node.width, height: node.height }}
    >
      <div className="flex items-center justify-between gap-1 border-b border-slate-100 dark:border-white/10 px-3 py-2 text-xs">
        <div className="flex items-center gap-1">
          {DOODLE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                setEraser(false);
              }}
              className={`h-4 w-4 rounded-full border cursor-pointer ${
                !eraser && color === c ? 'ring-2 ring-indigo-500 scale-110' : 'border-slate-300 dark:border-white/20'
              }`}
              style={{ backgroundColor: c }}
              title={`画笔颜色 ${c}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEraser((v) => !v)}
            className={`rounded-lg p-1.5 cursor-pointer ${
              eraser ? 'bg-indigo-500 text-white' : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
            title="橡皮擦"
          >
            <Eraser size={13} />
          </button>
          <input
            type="range"
            min={2}
            max={24}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-14 accent-indigo-500"
            title={`笔刷粗细 ${size}px`}
          />
          <button
            type="button"
            onClick={clearBoard}
            className="rounded-lg p-1.5 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
            title="清空画板"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={700}
        height={224}
        className="min-h-0 w-full flex-1 cursor-crosshair touch-none bg-[#18181b]"
        onMouseDown={event=>event.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          drawingRef.current = true;
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          const p = getPos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.strokeStyle = eraser ? '#18181b' : color;
          ctx.lineWidth = eraser ? size * 2.5 : size;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current) return;
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          const p = getPos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onLostPointerCapture={() => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          commitCanvasToImage();
        }}
      />
      <div className="flex items-center justify-between px-3 py-2 text-[11px] text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-[#19191c]">
        <span>{size}px · 背景</span>
        <button
          type="button"
          onClick={() => {
            commitCanvasToImage();
            const currentUrl = canvasRef.current?.toDataURL('image/png');
            if (!currentUrl) return;
            const store=useCanvasStore.getState();
            const id=crypto.randomUUID();
            store.addNode(projectId, {
              id,
              type: 'image',
              title: '涂鸦画板',
              imageUrl: currentUrl,
              x: node.x + (node.width || 360) + 60,
              y: node.y,
              width: 350,
              height: 112,
            });
            store.addEdge(projectId,{sourceNodeId:node.id, targetNodeId:id, sourceHandle:'output-image',targetHandle:'input',createdAt:Date.now()});
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-white font-medium hover:bg-indigo-500 cursor-pointer"
        >
          <Download size={12} />
          <span>导出</span>
        </button>
      </div>
    </div>
  );
}
