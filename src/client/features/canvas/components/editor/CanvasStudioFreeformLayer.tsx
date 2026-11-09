import { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { nodeBounds } from '../../model/canvasGraph';
import type { CanvasDoodleStroke, CanvasNode, CanvasProject } from '../../model/types';

function asStrokeList(raw: unknown[] | undefined): CanvasDoodleStroke[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is CanvasDoodleStroke =>
      Boolean(item && typeof item === 'object' && Array.isArray((item as CanvasDoodleStroke).points)),
  );
}

function pointsToSvgPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.5} ${p.y + 0.5}`;
  }
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`).join(' ');
}

export interface CanvasStudioFreeformLayerProps {
  project: CanvasProject;
  nodes: CanvasNode[];
}

export function CanvasStudioFreeformLayer({
  project, nodes,
}: CanvasStudioFreeformLayerProps) {
  const strokes = useMemo(() => asStrokeList(project.studioScene?.strokes), [project.studioScene?.strokes]);

  const groupFrames = useMemo(() => {
    const byGroup = new Map<string, CanvasNode[]>();
    for (const n of nodes) {
      if (!n.groupId || n.layerHidden || n.foldedInGroupId) continue;
      const list = byGroup.get(n.groupId) || [];
      list.push(n);
      byGroup.set(n.groupId, list);
    }
    const frames: Array<{ groupId: string; x: number; y: number; width: number; height: number; count: number }> = [];
    for (const [groupId, members] of byGroup.entries()) {
      if (!members.length || members.some((m) => m.isFoldLeader)) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const m of members) {
        const b = nodeBounds(m);
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      }
      frames.push({ groupId, x: minX - 20, y: minY - 36, width: maxX - minX + 40, height: maxY - minY + 56, count: members.length });
    }
    return frames;
  }, [nodes]);

  const handleFoldGroup = (groupId: string) => {
    const members = nodes.filter((n) => n.groupId === groupId && !n.layerHidden);
    if (members.length < 2) return;
    const sorted = [...members].sort((a, b) => a.x - b.x || a.y - b.y);
    const patches: Record<string, Partial<CanvasNode>> = {
      [sorted[0].id]: { isFoldLeader: true, foldedInGroupId: undefined, foldedCount: sorted.length },
    };
    sorted.slice(1).forEach((m) => {
      patches[m.id] = { isFoldLeader: false, foldedInGroupId: groupId, foldedCount: undefined };
    });
    useCanvasStore.getState().patchNodes(project.id, patches);
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {groupFrames.map((frame) => (
        <div
          key={frame.groupId}
          className="pointer-events-none absolute rounded-3xl border border-dashed border-indigo-400/50 dark:border-indigo-400/35 bg-indigo-500/[0.03] dark:bg-indigo-400/[0.03]"
          style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
        >
          <div className="pointer-events-auto absolute -top-3.5 left-4 flex items-center gap-2 rounded-full border border-indigo-300/70 dark:border-indigo-500/40 bg-white dark:bg-[#202024] px-3 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-300 shadow-sm">
            <span data-group-label="true">编组 · {frame.count} 项</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleFoldGroup(frame.groupId);
              }}
              title="折叠为卡片堆叠 (Stack)"
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 cursor-pointer"
            >
              <Layers size={10} />
              <span>堆叠收起</span>
            </button>
          </div>
        </div>
      ))}

      {strokes.length > 0 && (
        <svg className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible z-35" aria-label="画布历史笔迹">
          {strokes.map((stroke) => (
            <path key={stroke.id} d={pointsToSvgPath(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      )}
    </div>
  );
}
