import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { HomeCanvasNode, PublishedHomeItem } from '@client/shared/home-publish/homePublish';

interface Props {
  item: PublishedHomeItem;
  onClose: () => void;
}

function bounds(nodes: HomeCanvasNode[]) {
  const minX = Math.min(...nodes.map(node => node.x));
  const minY = Math.min(...nodes.map(node => node.y));
  const maxX = Math.max(...nodes.map(node => node.x + node.width));
  const maxY = Math.max(...nodes.map(node => node.y + node.height));
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function ReadonlyCanvas({ nodes, onClose }: { nodes: HomeCanvasNode[]; onClose: () => void }) {
  const frame = useMemo(() => bounds(nodes), [nodes]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.16);
  const [pan, setPan] = useState({ x: 80, y: 80 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const fit = Math.min((board.clientWidth - 120) / frame.width, (board.clientHeight - 120) / frame.height, 1);
    setZoom(Number.isFinite(fit) && fit > 0 ? Math.max(0.08, Math.min(fit, 0.4)) : 0.16);
  }, [frame.width, frame.height]);

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
        className="h-full w-full cursor-grab overflow-hidden"
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
        onWheel={(event) => {
          event.preventDefault();
          setZoom(value => Math.min(1.4, Math.max(0.06, value * (event.deltaY > 0 ? 0.92 : 1.08))));
        }}
      >
        <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <svg className="pointer-events-none absolute overflow-visible" width={frame.width} height={frame.height} style={{ left: -frame.minX, top: -frame.minY }}>
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
  const synopsis = item.synopsis || item.prompt;
  const share = async () => {
    const text = [item.title, synopsis].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ }
  };
  if (openCanvas && item.canvasNodes?.length) return <ReadonlyCanvas nodes={item.canvasNodes} onClose={() => setOpenCanvas(false)} />;
  return (
    <div className="fixed inset-0 z-[80] bg-black text-white">
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
    </div>
  );
}
