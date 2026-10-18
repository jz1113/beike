import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Group, Ungroup, X, AlignLeft, AlignCenter, AlignRight,
  ArrowUpToLine, ArrowDownToLine, LayoutGrid,
} from 'lucide-react';
import { useCanvasStore } from '../store/useCanvasStore';
import { nodeBounds } from '../model/canvasGraph';
import { canvasGroupPatches, canvasUngroupPatches, expandCanvasGroups, isCanvasSelectionGrouped } from '../model/canvasGroups';
import { alignSelectedNodes, distributeSelectedNodes, autoArrangeCanvasNodes, type AlignmentType } from '../model/canvasAlignment';
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
  const [size, setSize] = useState({width: 0, height: 0, toolbarWidth: 460, toolbarHeight: 44});
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

  const handleAlign = (type: AlignmentType) => {
    const state = useCanvasStore.getState();
    const current = state.projects.find(p => p.id === projectId)?.nodes || [];
    const patches = alignSelectedNodes(current, selectedIds, type);
    if (Object.keys(patches).length > 0) {
      state.patchNodes(projectId, patches);
    }
  };

  const handleDistribute = () => {
    const state = useCanvasStore.getState();
    const current = state.projects.find(p => p.id === projectId)?.nodes || [];
    const patches = distributeSelectedNodes(current, selectedIds, 'horizontal');
    if (Object.keys(patches).length > 0) {
      state.patchNodes(projectId, patches);
    }
  };

  const handleAutoArrange = () => {
    const state = useCanvasStore.getState();
    const currentProject = state.projects.find(p => p.id === projectId);
    if (!currentProject) return;
    const patches = autoArrangeCanvasNodes(currentProject.nodes, currentProject.edges);
    if (Object.keys(patches).length > 0) {
      state.patchNodes(projectId, patches);
    }
  };

  const button = 'flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-indigo-400 cursor-pointer';
  const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer';

  return <>
    <div aria-hidden="true" className="pointer-events-none absolute z-30 rounded-2xl border border-indigo-400/80 bg-indigo-400/5" style={{left: screen.left-8, top: screen.top-8, width: screen.width+16, height: screen.height+16}} />
    <div ref={toolbar} role="toolbar" aria-label="多选操作" className="canvas-fixed-ui absolute z-50 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#1B1B1E]/95 backdrop-blur-md p-1.5 shadow-xl dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)]" style={{left: x, top: y}} onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <span className="px-2 text-xs text-slate-500 dark:text-slate-400">{grouped ? '已成组' : '已选'} {selected.length} 个</span>

      {/* 批量对齐工具组 */}
      <div className="flex items-center gap-0.5 px-1 border-l border-r border-slate-200 dark:border-white/10">
        <button type="button" className={iconBtn} onClick={() => handleAlign('left')} title="左对齐"><AlignLeft size={14} /></button>
        <button type="button" className={iconBtn} onClick={() => handleAlign('center')} title="水平居中对齐"><AlignCenter size={14} /></button>
        <button type="button" className={iconBtn} onClick={() => handleAlign('right')} title="右对齐"><AlignRight size={14} /></button>
        <button type="button" className={iconBtn} onClick={() => handleAlign('top')} title="顶对齐"><ArrowUpToLine size={14} /></button>
        <button type="button" className={iconBtn} onClick={() => handleAlign('bottom')} title="底对齐"><ArrowDownToLine size={14} /></button>
        {selected.length >= 3 && (
          <button type="button" className={iconBtn} onClick={handleDistribute} title="水平等间距分布">
            <span className="text-[11px] font-mono font-bold tracking-tighter">|||</span>
          </button>
        )}
      </div>

      {/* 智能拓扑自动整理 */}
      <button
        type="button"
        className={`${button} text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40`}
        title="按工作流连接关系自动排列节点"
        onClick={handleAutoArrange}
      >
        <LayoutGrid size={14} />
        <span>自动整理</span>
      </button>

      {/* 成组 / 解组 */}
      {grouped ? (
        <button type="button" className={`${button} text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10`} disabled={!canUngroup} title="解除成组 · Shift + ⌘/Ctrl + G" onClick={() => apply(true)}>
          <Ungroup size={14} />解除组
        </button>
      ) : (
        <button type="button" className={`${button} bg-indigo-600 text-white hover:bg-indigo-500`} disabled={!canGroup} title={canGroup ? '创建组 · ⌘/Ctrl + G' : '请先解锁所选节点或组内成员'} onClick={() => apply(false)}>
          <Group size={14} />成组
        </button>
      )}

      <button type="button" aria-label="取消多选" title="取消多选 · Esc" className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white ml-0.5 cursor-pointer" onClick={() => onSelect([])}><X size={15} /></button>
    </div>
  </>;
}
