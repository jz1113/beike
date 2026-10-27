import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { HomeCanvasNode, PublishedHomeItem } from '@client/shared/home-publish/homePublish';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { useScrollLock } from '@client/shared/hooks/useScrollLock';
import { videoPlaybackManager } from '@client/shared/media/videoPlaybackManager';
import { fitShowcaseCanvas } from '../../model/showcaseCanvas';

interface Props {
  item: PublishedHomeItem;
  onClose: () => void;
}

function ReadonlyCanvas({ nodes, onClose }: { nodes: HomeCanvasNode[]; onClose: () => void }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.16);
  const [pan, setPan] = useState({ x: 80, y: 80 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const fit = () => {
      const view = fitShowcaseCanvas(nodes, board.clientWidth, board.clientHeight);
      setZoom(view.zoom);
      setPan(view.pan);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(board);
    return () => observer.disconnect();
  }, [nodes]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const zoom = (event: WheelEvent) => {
      event.preventDefault();
      setZoom(value => Math.min(1.4, Math.max(0.001, value * (event.deltaY > 0 ? 0.92 : 1.08))));
    };
    board.addEventListener('wheel', zoom, { passive: false });
    return () => board.removeEventListener('wheel', zoom);
  }, []);

  return (
    <div className="fixed inset-0 z-[90] bg-[#0c0c0e] text-white">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 text-sm">
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/80 dark:bg-[#18191c]/95">只读模式</span>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭画布" className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 dark:bg-[#18191c]/95">
        <X className="h-4 w-4" />
      </button>
      <div
        ref={boardRef}
        className="h-full w-full cursor-grab overflow-hidden touch-none"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
            {nodes.flatMap(node => (node.referenceNodeIds || []).flatMap(sourceId => {
              const source = nodes.find(item => item.id === sourceId);
              if (!source) return [];
              const x1 = source.x + source.width;
              const y1 = source.y + source.height / 2;
              const x2 = node.x;
              const y2 = node.y + node.height / 2;
              return [<path key={`${source.id}-${node.id}`} d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} />];
            }))}
          </svg>
          {nodes.map(node => (
            <div key={node.id} className="absolute overflow-hidden rounded-xl border border-white/10 bg-[#2a2a2e]" style={{ left: node.x, top: node.y, width: node.width, height: node.height }}>
              {node.videoUrl ? <video src={node.videoUrl} className="h-full w-full object-cover" muted /> : node.imageUrl ? <img src={node.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="p-3 text-xs text-white/70">{node.title || node.content || node.type}</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-4 left-4 rounded-full bg-white/10 px-3 py-1 text-xs dark:bg-[#18191c]/95">{Math.round(zoom * 100)}%</div>
    </div>
  );
}

export function CanvasShowcase({ item, onClose }: Props) {
  const [openCanvas, setOpenCanvas] = useState(false);
  const dialogRef = useModalDialog(true, openCanvas ? () => setOpenCanvas(false) : onClose);
  useScrollLock(true, '[data-hub-scroll]');
  useEffect(() => videoPlaybackManager.suspend(), []);
  const synopsis = item.synopsis || item.prompt;
  const share = async () => {
    const text = [item.title, synopsis].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ }
  };
  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={item.title} tabIndex={-1} className="fixed inset-0 z-[9999] bg-black text-white">
      {openCanvas && item.canvasNodes?.length ? <ReadonlyCanvas nodes={item.canvasNodes} onClose={() => setOpenCanvas(false)} /> : <>
      <button type="button" aria-label="关闭" onClick={onClose} className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 hover:bg-black/60">
        <X className="h-4 w-4" />
      </button>
      {item.mediaType === 'video' && item.video ? <video src={item.video} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline /> : <img src={item.image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />
      <div className="relative flex h-full max-w-xl flex-col justify-end p-8 sm:p-12">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">{item.title}</h2>
        {synopsis && <p className="mt-4 max-h-40 overflow-auto text-sm leading-6 text-white/80">{synopsis}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => void share()} className="rounded-full bg-white/15 px-4 py-2 text-sm hover:bg-white/25 dark:bg-[#18191c]/95">分享</button>
          <button type="button" onClick={() => setOpenCanvas(true)} disabled={!item.canvasNodes?.length} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50 dark:text-slate-100 dark:bg-[#18191c]">查看画布</button>
        </div>
      </div>
      </>}
    </div>, document.body
  );
}
