import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Group, Ungroup, X } from 'lucide-react';
import { useCanvasStore } from '../store/useCanvasStore';
import { nodeBounds } from '../model/canvasGraph';
import { canvasGroupPatches, canvasUngroupPatches, expandCanvasGroups, isCanvasSelectionGrouped } from '../model/canvasGroups';
import type { CanvasNode } from '../model/types';

interface Props {
  projectId: string;
  nodes: CanvasNode[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  pan: {x: number; y: number};
  zoom: number;
  positions: Record<string, {x: number; y: number}>;
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function CanvasSelectionToolbar({projectId, nodes, selectedIds, onSelect, pan, zoom, positions, viewportRef}: Props) {
  const toolbar = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({width: 0, height: 0, toolbarWidth: 300, toolbarHeight: 44});
  const selected = useMemo(() => {
    const ids = new Set(selectedIds);
    return nodes.filter(node => ids.has(node.id) && !node.layerHidden);
  }, [nodes, selectedIds]);
  const grouped = isCanvasSelectionGrouped(nodes, selectedIds);
  const canGroup = !grouped && Object.keys(canvasGroupPatches(nodes, selectedIds, 'group-availability')).length > 0;
  const canUngroup = Object.keys(canvasUngroupPatches(nodes, selectedIds)).length > 0;
  useLayoutEffect(() => {
    const viewport = viewportRef.current, element = toolbar.current;
    if (!viewport || !element) return;
    const measure = () => {
      const next = {width: viewport.clientWidth, height: viewport.clientHeight, toolbarWidth: element.offsetWidth, toolbarHeight: element.offsetHeight};
      setSize(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport); observer.observe(element);
    return () => observer.disconnect();
  }, [viewportRef, selected.length, grouped]);
  if (selected.length < 2) return null;

  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const node of selected) {
    const box = nodeBounds(positions[node.id] ? {...node, ...positions[node.id]} : node);
    left = Math.min(left, box.x); top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width); bottom = Math.max(bottom, box.y + box.height);
  }
  const screen = {left: pan.x + left * zoom, top: pan.y + top * zoom, width: (right-left) * zoom, height: (bottom-top) * zoom};
  const padding = size.width > 480 ? 80 : 12;
  const x = Math.max(padding, Math.min(size.width-size.toolbarWidth-12, screen.left+screen.width/2-size.toolbarWidth/2));
  const y = Math.max(80, Math.min(size.height-size.toolbarHeight-16, screen.top-size.toolbarHeight-14));
  const apply = (ungroup: boolean) => {
    const state = useCanvasStore.getState();
    const current = state.projects.find(project => project.id === projectId)?.nodes || [];
    const patches = ungroup ? canvasUngroupPatches(current, selectedIds) : canvasGroupPatches(current, selectedIds, crypto.randomUUID());
    if (!Object.keys(patches).length) return;
    state.patchNodes(projectId, patches);
    onSelect(ungroup ? selectedIds : expandCanvasGroups(current, selectedIds));
  };
  const button = 'flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-indigo-400';
  return <>
    <div aria-hidden="true" className="pointer-events-none absolute z-30 rounded-2xl border border-indigo-400/80 bg-indigo-400/5" style={{left: screen.left-8, top: screen.top-8, width: screen.width+16, height: screen.height+16}} />
    <div ref={toolbar} role="toolbar" aria-label="多选操作" className="canvas-fixed-ui absolute z-50 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg" style={{left: x, top: y}} onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <span className="px-2 text-xs text-slate-500">{grouped ? '已成组' : '已选'} {selected.length} 个节点</span>
      {grouped ? <button type="button" className={`${button} text-slate-700 hover:bg-slate-100`} disabled={!canUngroup} title="解除成组 · Shift + ⌘/Ctrl + G" onClick={() => apply(true)}><Ungroup size={15} />解除成组</button> : <>
        <button type="button" className={`${button} bg-indigo-600 text-white hover:bg-indigo-500`} disabled={!canGroup} title={canGroup ? '创建组 · ⌘/Ctrl + G' : '请先解锁所选节点或组内成员'} onClick={() => apply(false)}><Group size={15} />创建组</button>
        {canUngroup && <button type="button" className={`${button} text-slate-700 hover:bg-slate-100`} title="解除所选节点的分组 · Shift + ⌘/Ctrl + G" onClick={() => apply(true)}><Ungroup size={15} />解除成组</button>}
      </>}
      <button type="button" aria-label="取消多选" title="取消多选 · Esc" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" onClick={() => onSelect([])}><X size={16} /></button>
    </div>
  </>;
}
