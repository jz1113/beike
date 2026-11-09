import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Plus } from 'lucide-react';
import { useCanvasStore } from '../../store/useCanvasStore';
import {
  canConnect, connectionError, nodeBounds, isTextSource,
  getNodeOutputPorts, getNodeInputPorts, type CanvasPortDefinition,
} from '../../model/canvasGraph';
import { buildQuickCanvasNode } from '../../model/canvasNodeFactory';
import { CanvasNodeMenu } from './CanvasNodeMenu';
import type { CanvasNode, CanvasPortType, CanvasQuickNodeType } from '../../model/types';

type Point = { x: number; y: number };

const portPoint = (node: CanvasNode, _port: CanvasPortDefinition, isInput: boolean): Point => {
  const b = nodeBounds(node);
  return { x: isInput ? b.x : b.x + b.width, y: b.y + b.height / 2 };
};

const curve = (a: Point, b: Point) => {
  const bend = Math.max(32, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`;
};

interface TargetHit {
  node: CanvasNode;
  port: CanvasPortDefinition;
  point: Point;
  blocked?: boolean;
}

export function findPortTarget(
  nodes: CanvasNode[],
  sourceId: string,
  sourceType: CanvasPortType,
  point: Point,
  zoom: number,
): TargetHit | null {
  const tolerance = 32 / Math.max(zoom, 0.2);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.id === sourceId || node.layerHidden || node.layerLocked) continue;
    const inPorts = getNodeInputPorts(node);
    if (inPorts.length === 0) continue;
    const b = nodeBounds(node);
    if (
      point.x < b.x - tolerance || point.x > b.x + b.width + tolerance ||
      point.y < b.y - tolerance || point.y > b.y + b.height + tolerance
    ) continue;
    const bestPort = inPorts.find((p) => p.type === sourceType || p.type === 'any') || inPorts[0];
    if (bestPort) {
      return {
        node,
        port: bestPort,
        point: portPoint(node, bestPort, true),
        blocked: Boolean(node.referenceNodeIds?.includes(sourceId)),
      };
    }
  }
  return null;
}

export function CanvasConnections({
  nodes, projectId, zoom, selectedNodeIds, visibleBounds, onSelectCreatedNode,
}: {
  nodes: CanvasNode[];
  projectId: string;
  zoom: number;
  selectedNodeIds: string[];
  visibleBounds: { left: number; top: number; right: number; bottom: number };
  onSelectCreatedNode?: (nodeId: string, isDrawing: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<'input' | 'output'>('output');
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourcePort, setSourcePort] = useState<CanvasPortDefinition | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hoverTarget, setHoverTarget] = useState<TargetHit | null>(null);
  const [selected, setSelected] = useState<{ from: string; to: string } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ from: string; to: string } | null>(null);
  const [menu, setMenu] = useState<(Point & { world: Point }) | null>(null);
  const [message, setMessage] = useState('');
  const [highlightedRefNodeId, setHighlightedRefNodeId] = useState<string | null>(null);

  const nodeById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const source = sourceId ? nodeById.get(sourceId) : undefined;
  const batch = useMemo(() => selectedNodeIds.flatMap(id => {
    const node = nodeById.get(id);
    return node && !node.layerLocked && canConnect(node) ? [node] : [];
  }), [nodeById, selectedNodeIds]);

  useEffect(() => {
    const onHighlight = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string | null }>).detail;
      setHighlightedRefNodeId(detail?.nodeId || null);
    };
    window.addEventListener('canvas:highlight-ref-node', onHighlight);
    return () => window.removeEventListener('canvas:highlight-ref-node', onHighlight);
  }, []);

  const dismiss = useCallback(() => {
    setSourceId(null); setBatchIds([]); setSourcePort(null); setCursor(null); setMenu(null); setHoverTarget(null);
  }, []);

  const connect = useCallback((target: CanvasNode, targetPort?: CanvasPortDefinition) => {
    if (!sourceId) return;
    const store = useCanvasStore.getState();
    const project = store.projects.find(item => item.id === projectId);
    if (!project) { dismiss(); return; }
    const pairs = direction === 'input' ? [{ from: target.id, to: sourceId }] :
      (batchIds.length ? batchIds : [sourceId]).map(from => ({ from, to: target.id }));
    let firstError = '';
    const additions = pairs.flatMap(({ from, to }) => {
      const error = connectionError(project.nodes, from, to, project.edges);
      if (error) { firstError ||= error; return []; }
      const output = direction === 'input' ? getNodeOutputPorts(target)[0] : getNodeOutputPorts(nodeById.get(from) ?? target)[0];
      const destination = nodeById.get(to) ?? target;
      const input = direction === 'input' ? sourcePort : destination.studioSubType === 'motion-control'
        ? getNodeInputPorts(destination).find(port => port.type === output?.type) : targetPort;
      if (destination.studioSubType === 'motion-control' && input?.type !== output?.type) {
        firstError ||= '请连接与角色图、动作视频或描述端口匹配的素材';
        return [];
      }
      return [{ sourceNodeId: from, sourceHandle: output?.id || 'output', targetNodeId: to, targetHandle: input?.id || 'input' }];
    });
    if (additions.length) store.addEdges(projectId, additions);
    if (firstError) setMessage(additions.length ? `已连接 ${additions.length} 个节点，其余跳过：${firstError}` : firstError);
    dismiss();
  }, [sourceId, sourcePort, nodeById, direction, batchIds, projectId, dismiss]);

  const disconnectEdge = useCallback((edgePair: { from: string; to: string } | null) => {
    if (!edgePair) return;
    const node = nodes.find((n) => n.id === edgePair.to);
    if (node?.layerLocked) { setMessage('请先解锁节点'); return; }
    const project = useCanvasStore.getState().projects.find((p) => p.id === projectId);
    const edges = (project?.edges || []).filter((e) => e.sourceNodeId === edgePair.from && e.targetNodeId === edgePair.to);
    if (edges.length > 0) {
      edges.forEach((edge) => useCanvasStore.getState().deleteEdge(projectId, edge.id));
    } else if (node) {
      useCanvasStore.getState().updateNode(projectId, node.id, {
        referenceNodeIds: node.referenceNodeIds?.filter((id) => id !== edgePair.from),
      });
    }
    setSelected(null);
    setHoveredEdge(null);
  }, [nodes, projectId]);

  const disconnect = useCallback(() => {
    disconnectEdge(selected || hoveredEdge);
  }, [disconnectEdge, selected, hoveredEdge]);

  useEffect(() => { dismiss(); setSelected(null); setHoveredEdge(null); setMessage(''); }, [projectId, dismiss]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 3500);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!selected) return;
    const key = (e: KeyboardEvent) => {
      if (!root.current?.getClientRects().length) return;
      if ((e.target as HTMLElement)?.closest?.('input,textarea,[contenteditable="true"],[role="dialog"],[role="menu"]')) return;
      if (['Delete', 'Backspace'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); disconnect(); }
      if (e.key === 'Escape') setSelected(null);
    };
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element)?.closest?.('[data-connection-edge]')) setSelected(null);
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('pointerdown', outside); };
  }, [selected, disconnect]);

  useEffect(() => {
    if (!sourceId || !sourcePort) return;
    const getPoint = (e: MouseEvent) => {
      const element = root.current;
      const rect = element?.getBoundingClientRect();
      const liveZoom = rect && element?.offsetWidth ? rect.width / element.offsetWidth : zoom;
      return rect ? { x: (e.clientX - rect.left) / liveZoom, y: (e.clientY - rect.top) / liveZoom } : null;
    };
    const findTarget = (point: Point) => {
      if (direction === 'output') return findPortTarget(nodes, sourceId, sourcePort.type, point, zoom);
      const tolerance = 32 / zoom;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (node.id === sourceId || node.layerLocked || !canConnect(node)) continue;
        const bounds = nodeBounds(node);
        if (point.x < bounds.x - tolerance || point.x > bounds.x + bounds.width + tolerance ||
          point.y < bounds.y - tolerance || point.y > bounds.y + bounds.height + tolerance) continue;
        const port = getNodeOutputPorts(node)[0];
        if (port) return { node, port, point: portPoint(node, port, false) };
      }
      return null;
    };
    const move = (e: MouseEvent) => {
      if (menu) return;
      const p = getPoint(e);
      if (!p) return;
      const hit = findTarget(p);
      setHoverTarget(hit);
      setCursor(hit ? hit.point : p);
    };
    const up = (e: MouseEvent) => {
      if (menu) return;
      const element = e.target as Element;
      const p = getPoint(e);
      if (element.closest?.('[data-connection-port]')?.getAttribute('data-port-node') === sourceId) {
        if (source && e.button === 0) {
          const anchor = portPoint(source, sourcePort, direction === 'input');
          const world = { x: anchor.x + (direction === 'output' ? 110 : -110), y: anchor.y };
          setCursor(world);
          setMenu({
            x: e.clientX + (direction === 'output' ? 72 : -252),
            y: Math.max(16, e.clientY - 24),
            world,
          });
        } else {
          dismiss();
        }
        return;
      }
      if (!p || e.button !== 0) return;
      const hit = findTarget(p);
      if (hit) { connect(hit.node, hit.port); return; }
      if (element.closest?.('[data-testid="canvas-viewport"]') && !element.closest('.canvas-node-card,.canvas-fixed-ui,button,input,textarea')) {
        setMenu({ x: e.clientX, y: e.clientY, world: p });
      } else { dismiss(); }
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up, true);
      window.removeEventListener('keydown', key);
    };
  }, [sourceId, source, sourcePort, zoom, nodes, menu, direction, connect, dismiss]);

  const handleSelectDownstreamNode = useCallback((kind: CanvasQuickNodeType) => {
    if (!source || !menu) return;
    const baseNode = buildQuickCanvasNode(kind, menu.world, direction === 'output'
      ? { sourceImageUrl: source.imageUrl, sourceVideoUrl: source.videoUrl } : undefined);
    const alignedX = direction === 'output'
      ? Math.max(source.x + source.width + 64, Math.round(menu.world.x))
      : Math.min(source.x - baseNode.width - 64, Math.round(menu.world.x - baseNode.width));
    const inheritTextConfig =
      source.textModel && ['prompt', 'video-prompt-optimizer', 'script-parse', 'table-editor-node', 'video-analyze', 'director-3d'].includes(kind)
        ? { textModel: source.textModel, ...(source.textReasoningEffort ? { textReasoningEffort: source.textReasoningEffort } : {}) }
        : {};
    const newNode = { ...baseNode, ...inheritTextConfig, x: alignedX };
    const store = useCanvasStore.getState();
    const project = store.projects.find(item => item.id === projectId);
    if (!project) { dismiss(); return; }
    const candidates = [...project.nodes, newNode];
    const first = direction === 'input' ? newNode.id : source.id;
    const second = direction === 'input' ? source.id : newNode.id;
    const error = connectionError(candidates, first, second, project.edges);
    if (error && batchIds.length === 0) { setMessage(error); dismiss(); return; }
    store.addNode(projectId, newNode);
    connect(newNode, getNodeInputPorts(newNode)[0]);
    onSelectCreatedNode?.(newNode.id, newNode.type === 'drawing');
    dismiss();
  }, [source, menu, projectId, direction, batchIds, connect, onSelectCreatedNode, dismiss]);

  const openPortMenu = (event: ReactKeyboardEvent<HTMLButtonElement>, node: CanvasNode, port: CanvasPortDefinition, side: 'input' | 'output') => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = portPoint(node, port, side === 'input');
    const world = { x: anchor.x + (side === 'output' ? 110 : -110), y: anchor.y };
    setDirection(side);
    setBatchIds(side === 'output' && batch.length > 1 && batch.some(item => item.id === node.id) ? batch.map(item => item.id) : []);
    setSourceId(node.id);
    setSourcePort(port);
    setCursor(world);
    setMenu({ x: rect.left + (side === 'output' ? 72 : -252), y: Math.max(16, rect.top - 24), world });
  };

  return (
    <div ref={root} className="pointer-events-none absolute inset-0">
      {message && createPortal(
        <div role="status" className="pointer-events-none fixed left-1/2 top-20 z-[200] -translate-x-1/2 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-[#202024] px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-xl">
          {message}
        </div>,
        document.body,
      )}

      {menu && source && (
        <CanvasNodeMenu
          x={menu.x} y={menu.y}
          sourcePortType={sourcePort?.type || 'any'}
          sourceNodeTitle={source.title}
          sourceNode={source}
          direction={direction}
          onClose={dismiss}
          onSelect={handleSelectDownstreamNode}
        />
      )}

      {hoverTarget && (() => {
        const b = nodeBounds(hoverTarget.node);
        return (
          <div
            className={`pointer-events-none absolute z-30 rounded-2xl transition-all duration-150 ${
              hoverTarget.blocked ? 'ring-2 ring-amber-400/90 bg-amber-400/5' : 'ring-2 ring-white/80 shadow-[0_0_24px_rgba(255,255,255,0.28)] bg-white/[0.03]'
            }`}
            style={{ left: b.x - 3, top: b.y - 3, width: b.width + 6, height: b.height + 6 }}
          />
        );
      })()}

      {highlightedRefNodeId && (() => {
        const refNode = nodes.find((n) => n.id === highlightedRefNodeId);
        if (!refNode) return null;
        const b = nodeBounds(refNode);
        return (
          <div
            data-reference-pick-role="highlighted"
            className="pointer-events-none absolute z-30 rounded-2xl ring-2 ring-sky-400 shadow-[0_0_28px_rgba(56,189,248,0.5)] bg-sky-400/5 transition-all duration-150"
            style={{ left: b.x - 4, top: b.y - 4, width: b.width + 8, height: b.height + 8 }}
          />
        );
      })()}

      <svg className="absolute left-0 top-0 h-px w-px overflow-visible" aria-label="画布参考连线">
        <defs>
          <linearGradient id="flow-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a1a1aa" />
            <stop offset="50%" stopColor="#f4f4f5" />
            <stop offset="100%" stopColor="#a1a1aa" />
          </linearGradient>
          <linearGradient id="canvas-edge-pulse-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.65" />
            <stop offset="50%" stopColor="#e0f2fe" stopOpacity="1" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.85" />
          </linearGradient>
          <filter id="canvas-edge-glow" x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {nodes.flatMap((target) =>
          (target.referenceNodeIds || []).map((id) => {
            const from = nodeById.get(id);
            if (!from || from.layerHidden || target.layerHidden) return null;
            const isHovered = hoveredEdge?.from === id && hoveredEdge.to === target.id;
            const active = (selected?.from === id && selected.to === target.id) || isHovered || highlightedRefNodeId === id;
            const isEndpointSelected = selectedNodeIds.includes(id) || selectedNodeIds.includes(target.id);
            const isTargetGenerating = target.status === 'generating';
            const showPulse = active || isEndpointSelected || isTargetGenerating;
            const output = getNodeOutputPorts(from)[0] || { id: 'out', label: '出', type: 'any', position: 'right' } as const;
            const inputs = getNodeInputPorts(target);
            const input = target.studioSubType === 'motion-control' ? inputs.find(port => port.type === output.type) ?? inputs[0] : inputs[0];
            const a = portPoint(from, output, false);
            const b = portPoint(target, input || { id: 'in', label: '入', type: 'any', position: 'left' }, true);
            const margin = Math.max(32, Math.abs(b.x - a.x) * 0.5);
            if (!active && (Math.max(a.x, b.x) + margin < visibleBounds.left ||
              Math.min(a.x, b.x) - margin > visibleBounds.right || Math.max(a.y, b.y) < visibleBounds.top ||
              Math.min(a.y, b.y) > visibleBounds.bottom)) return null;
            const path = curve(a, b);
            const color = active ? '#e4e4e7' : isTargetGenerating ? 'url(#flow-line-grad)' : isTextSource(from) ? '#b4b4bb' : '#a1a1aa';
            return (
              <g
                key={`${id}-${target.id}`}
                onMouseEnter={() => setHoveredEdge({ from: id, to: target.id })}
                onMouseLeave={() => setHoveredEdge((prev) => (prev?.from === id && prev.to === target.id ? null : prev))}
              >
                <path
                  d={path} fill="none" stroke={color}
                  strokeOpacity={active ? 0.92 : isTargetGenerating ? 0.95 : isEndpointSelected ? 0.72 : 0.48}
                  strokeWidth={active ? 2 : isTargetGenerating ? 2 : 1.5}
                  strokeDasharray={isTargetGenerating ? '6 4' : undefined}
                  className={isTargetGenerating ? 'animate-pulse' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                {showPulse && (
                  <>
                    <path
                      d={path}
                      fill="none"
                      stroke="#38bdf8"
                      strokeOpacity={0.55}
                      strokeWidth={5.5}
                      strokeLinecap="round"
                      filter="url(#canvas-edge-glow)"
                      className="canvas-edge-flow-pulse pointer-events-none"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      data-connection-edge-pulse="true"
                      d={path}
                      fill="none"
                      stroke="url(#canvas-edge-pulse-grad)"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      className="canvas-edge-flow-pulse pointer-events-none"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                )}
                <path
                  data-connection-edge="true" role="button" tabIndex={0}
                  aria-label={`选择连线 ${from.title || '节点'} → ${target.title || '节点'}`}
                  className="pointer-events-auto cursor-pointer focus:stroke-white/30 focus:outline-none"
                  d={path} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setSelected({ from: id, to: target.id }); }}
                  onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); disconnectEdge({ from: id, to: target.id }); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected({ from: id, to: target.id }); } }}
                />
              </g>
            );
          }),
        )}
        {source && sourcePort && cursor && (batchIds.length ? batchIds : [source.id]).map(id => {
          const node = nodeById.get(id);
          if (!node) return null;
          const anchor = portPoint(node, sourcePort, direction === 'input');
          return <path key={id} d={direction === 'input' ? curve(cursor, anchor) : curve(anchor, cursor)} fill="none"
            stroke={hoverTarget?.blocked ? '#f59e0b' : '#d4d4d8'} strokeOpacity={hoverTarget?.blocked ? 0.95 : 0.82} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>

      {(() => {
        const activeEdge = selected || hoveredEdge;
        if (!activeEdge) return null;
        const from = nodes.find((n) => n.id === activeEdge.from);
        const to = nodes.find((n) => n.id === activeEdge.to);
        if (!from || !to || !to.referenceNodeIds?.includes(from.id)) return null;
        const a = portPoint(from, getNodeOutputPorts(from)[0] || { id: 'out', label: '出', type: 'any', position: 'right' }, false);
        const b = portPoint(to, { id: 'in', label: '入', type: 'any', position: 'left' }, true);
        return (
          <button
            type="button"
            data-connection-edge="true"
            aria-label="断开连线"
            onMouseEnter={() => setHoveredEdge(activeEdge)}
            onMouseLeave={() => setHoveredEdge((prev) => (prev?.from === activeEdge.from && prev.to === activeEdge.to ? null : prev))}
            className="pointer-events-auto absolute z-40 flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1e1e22]/80 text-zinc-700 dark:text-zinc-200 shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur-md hover:scale-105 hover:border-zinc-400 dark:hover:border-white/30 hover:bg-white dark:hover:bg-[#2a2a30]/95 hover:text-zinc-950 dark:hover:text-white transition-all cursor-pointer"
            style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2, transform: `translate(-50%,-50%) scale(${1 / zoom})` }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); disconnectEdge(activeEdge); }}
          >
            <Scissors size={16} strokeWidth={1.85} className="-rotate-[60deg]" />
            <span className="sr-only">断开连线</span>
          </button>
        );
      })()}

      {nodes.filter((node) => {
        if (node.layerLocked || node.layerHidden) return false;
        const bounds = nodeBounds(node);
        return bounds.x + bounds.width >= visibleBounds.left && bounds.x <= visibleBounds.right &&
          bounds.y + bounds.height >= visibleBounds.top && bounds.y <= visibleBounds.bottom;
      }).flatMap((node) => {
        const primaryOut = getNodeOutputPorts(node)[0];
        const inputs = getNodeInputPorts(node);
        const isNodeSelected = selectedNodeIds.includes(node.id);
        const handleOffset = 28 / Math.max(0.65, zoom);
        const handles: React.ReactNode[] = [];
        if (canConnect(node) && primaryOut) {
          const p = portPoint(node, primaryOut, false);
          const isDraggingOut = sourceId === node.id && direction === 'output';
          handles.push(
            <button
              key={`out-${node.id}`} type="button" data-connection-port="true" data-port-node={node.id}
              aria-label={`从 ${node.title || node.id} 的 ${primaryOut.label} 连线`}
              title="拖拽连线到目标节点，或在空白处松开创建下游节点"
              className={`connector connector-right pointer-events-auto absolute z-30 flex items-center justify-center rounded-full border-0 bg-transparent p-0 transition-opacity duration-150 focus:outline-none focus-visible:opacity-100 ${isDraggingOut ? 'opacity-0 pointer-events-none' : isNodeSelected ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
              style={{ left: p.x + handleOffset, top: p.y, width: 36, height: 36, transform: `translate(-50%, -50%) scale(${1 / Math.max(0.65, zoom)})` }}
              onKeyDown={event => openPortMenu(event, node, primaryOut, 'output')}
              onMouseDown={(e) => {
                if(e.button !== 0) return;
                e.preventDefault(); e.stopPropagation(); setSelected(null);
                setDirection('output'); setBatchIds(batch.some(item => item.id === node.id) && batch.length > 1 ? batch.map(item => item.id) : []);
                setSourceId(node.id); setSourcePort(primaryOut); setCursor(p);
              }}
            >
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-[#8c8c8c] dark:border-[#a8a8ae] bg-white/95 dark:bg-[#141416]/90 text-[#7a7a7a] dark:text-[#d4d4d8] transition-all hover:scale-110 hover:border-zinc-900 dark:hover:border-white hover:text-zinc-900 dark:hover:text-white">
                <Plus size={18} strokeWidth={2} />
              </span>
            </button>,
          );
        }
        for (const primaryIn of node.studioSubType === 'motion-control' ? inputs : inputs.slice(0, 1)) {
          const p = portPoint(node, primaryIn, true);
          const isTarget = hoverTarget?.node.id === node.id && hoverTarget.port.id === primaryIn.id;
          const isDraggingIn = sourceId === node.id && direction === 'input';
          const showPort = (sourceId !== null && sourceId !== node.id) || isNodeSelected;
          handles.push(
            <button
              key={`in-${node.id}-${primaryIn.id}`} type="button" data-connection-port="true" data-port-node={node.id}
              aria-label={`连接至 ${node.title || node.id} 的 ${primaryIn.label}`}
              title={`接收上游连接：${primaryIn.label}`}
              className={`connector connector-left pointer-events-auto absolute z-30 flex items-center justify-center rounded-full border-0 bg-transparent p-0 transition-all duration-150 focus:outline-none focus-visible:opacity-100 ${isDraggingIn ? 'opacity-0 pointer-events-none' : showPort ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
              style={{ left: p.x - handleOffset, top: p.y, width: 36, height: 36, transform: `translate(-50%, -50%) scale(${1 / Math.max(0.65, zoom)})` }}
              onKeyDown={event => openPortMenu(event, node, primaryIn, 'input')}
              onMouseDown={(e) => {
                if(e.button !== 0) return;
                e.preventDefault(); e.stopPropagation(); setSelected(null);
                setDirection('input'); setBatchIds([]); setSourceId(node.id); setSourcePort(primaryIn); setCursor(p);
              }}
            >
              <span className={`flex size-8 items-center justify-center rounded-full border-2 bg-white/95 dark:bg-[#141416]/90 transition-all hover:scale-110 ${isTarget ? 'border-white scale-125 ring-4 ring-white/25 text-white' : showPort && sourceId !== null && sourceId !== node.id ? 'border-zinc-300 dark:border-zinc-400 ring-2 ring-white/10 text-zinc-700 dark:text-zinc-200' : 'border-[#8c8c8c] dark:border-[#a8a8ae] text-[#7a7a7a] dark:text-[#d4d4d8] hover:border-zinc-900 dark:hover:border-white hover:text-zinc-900 dark:hover:text-white'}`}>
                <Plus size={18} strokeWidth={2} />
              </span>
            </button>,
          );
        }
        return handles;
      })}
    </div>
  );
}
