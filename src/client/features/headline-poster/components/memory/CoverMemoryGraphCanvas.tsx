import { useRef, useState, type MouseEvent, type WheelEvent } from 'react';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { COVER_MEMORY_BRANCHES, type CoverMemoryBranch, type CoverMemoryEntry, type CoverMemorySample } from '@shared/contracts/coverMemory';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { CoverBranchDetailPopover } from './CoverBranchDetailPopover';

interface Props {
  entries: CoverMemoryEntry[];
  samples: CoverMemorySample[];
  selected: CoverMemoryBranch | null;
  onSelect: (branch: CoverMemoryBranch | null) => void;
  onSetStatus: (entry: CoverMemoryEntry, status: CoverMemoryEntry['status']) => void;
  onAddCorrection: (rule: string) => void;
  busy: boolean;
}

const CENTER = { x: 520, y: 320 };

function nodePosition(index: number) {
  const angle = ((-90 + index * 60) * Math.PI) / 180;
  return { x: CENTER.x + Math.cos(angle) * 280, y: CENTER.y + Math.sin(angle) * 190 };
}

export function CoverMemoryGraphCanvas({ entries, samples, selected, onSelect, onSetStatus, onAddCorrection, busy }: Props) {
  const { isDark } = useAppTheme();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const adopted = entries.filter((entry) => entry.status === 'adopted').length;
  const empty = entries.length === 0;

  const onMouseDown = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('[data-interactive="true"]')) return;
    setDragging(true);
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    setZoom((value) => Math.min(1.6, Math.max(0.6, value * (event.deltaY < 0 ? 1.08 : 0.92))));
  };

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseMove={(event) => { if (dragging) setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y }); }}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
      onWheel={onWheel}
      className={`relative h-full w-full overflow-hidden ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-30" style={{
        backgroundImage: isDark ? 'radial-gradient(rgba(255,255,255,0.28) 1.1px, transparent 1.1px)' : 'radial-gradient(#a1a1aa 1.1px, transparent 1.1px)',
        backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }} />
      <div className="absolute left-0 top-0 h-[760px] w-[1100px]" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {COVER_MEMORY_BRANCHES.map((branch, index) => {
            const node = nodePosition(index);
            const path = `M ${CENTER.x} ${CENTER.y} C ${CENTER.x + (node.x - CENTER.x) * 0.45} ${CENTER.y}, ${node.x - (node.x - CENTER.x) * 0.2} ${node.y}, ${node.x} ${node.y}`;
            return <path key={branch.id} d={path} fill="none" stroke={selected === branch.id ? '#f59e0b' : 'rgba(161,161,170,0.45)'} strokeWidth={selected === branch.id ? 2 : 1.2} />;
          })}
        </svg>
        <div data-interactive="true" className="absolute flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border border-amber-400/70 bg-[#1c140c] text-amber-100 shadow-[0_0_32px_rgba(245,158,11,0.35)]" style={{ left: CENTER.x, top: CENTER.y }}>
          <span className="text-[10px] font-bold tracking-wide text-amber-300">封面技能</span>
          <span className="mt-1 text-lg font-black">{adopted}</span>
          <span className="text-[10px] text-amber-200/80">已采纳</span>
        </div>
        {COVER_MEMORY_BRANCHES.map((branch, index) => {
          const node = nodePosition(index);
          const count = entries.filter((entry) => entry.branch === branch.id && entry.status !== 'trashed').length;
          const active = selected === branch.id;
          return (
            <button
              key={branch.id}
              type="button"
              data-interactive="true"
              onClick={() => onSelect(active ? null : branch.id)}
              className={`absolute flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border text-xs font-bold ${active ? 'border-amber-400 bg-amber-500 text-slate-950' : 'border-white/10 bg-[#2a2a2e] text-slate-100'}`}
              style={{ left: node.x, top: node.y }}
            >
              <span>{branch.label}</span>
              <span className="text-[10px] font-medium opacity-70">{count}</span>
            </button>
          );
        })}
        {selected && (
          <div data-interactive="true" className="absolute z-20" style={{ left: nodePosition(COVER_MEMORY_BRANCHES.findIndex((branch) => branch.id === selected)).x + 48, top: nodePosition(COVER_MEMORY_BRANCHES.findIndex((branch) => branch.id === selected)).y - 20 }}>
            <CoverBranchDetailPopover
              branch={selected}
              entries={entries.filter((entry) => entry.branch === selected)}
              samples={samples}
              busy={busy}
              onClose={() => onSelect(null)}
              onSetStatus={onSetStatus}
              onAddCorrection={onAddCorrection}
            />
          </div>
        )}
      </div>
      <div className="absolute bottom-5 left-5 z-20 flex items-center gap-1 rounded-2xl border border-white/10 bg-[#1a1a1d]/90 p-1.5 text-slate-200 shadow-lg">
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded-xl hover:bg-white/10" onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))} aria-label="放大"><Plus className="h-3.5 w-3.5" /></button>
        <span className="w-11 text-center text-xs font-bold tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded-xl hover:bg-white/10" onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} aria-label="缩小"><Minus className="h-3.5 w-3.5" /></button>
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded-xl hover:bg-white/10" onClick={() => { setZoom(1); setPan({ x: 40, y: 20 }); }} aria-label="还原"><Maximize2 className="h-3.5 w-3.5" /></button>
      </div>
      {empty && <p className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#1a1a1d]/90 px-4 py-2 text-xs text-slate-300">还没有封面记忆。投喂样张，或在「纠正」里写下不要再犯的错。</p>}
    </div>
  );
}
