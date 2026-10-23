import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Video, Unplug, Plus, Sparkles } from 'lucide-react';
import { useCanvasStore } from '../../store/useCanvasStore';
import {
  canConnect, connectionError, nodeBounds, referenceReady, isTextSource,
  getNodeOutputPorts, getNodeInputPorts, type CanvasPortDefinition,
} from '../../model/canvasGraph';
import type { CanvasNode, CanvasPortType } from '../../model/types';

type Point = { x: number; y: number };

const portPoint = (node: CanvasNode, port: CanvasPortDefinition, isInput: boolean): Point => {
  const b = nodeBounds(node);
  return { x: isInput ? b.x : b.x + b.width, y: port.offsetY ? b.y + port.offsetY : b.y + b.height / 2 };
};

const curve = (a: Point, b: Point) => {
  const bend = Math.max(50, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`;
};

interface TargetHit { node: CanvasNode; port: CanvasPortDefinition; point: Point; }

export function findPortTarget(nodes: CanvasNode[], sourceId: string, sourceType: CanvasPortType, point: Point, zoom: number): TargetHit | null {
  const tolerance = 28 / Math.max(zoom, 0.2);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.id === sourceId || node.layerHidden || node.layerLocked) continue;
    const inPorts = getNodeInputPorts(node);
    if (inPorts.length === 0) continue;
    for (const port of inPorts) {
      if (sourceType === 'prompt' && port.type !== 'prompt') continue;
      if (sourceType === 'video' && port.type !== 'video' && port.type !== 'any') continue;
      if (sourceType === 'audio' && port.type !== 'audio' && port.type !== 'any') continue;
      const p = portPoint(node, port, true);
      if (Math.hypot(point.x - p.x, point.y - p.y) <= tolerance) return { node, port, point: p };
    }
    const b = nodeBounds(node);
    if (point.x >= b.x - tolerance && point.x <= b.x + b.width + tolerance && point.y >= b.y - tolerance && point.y <= b.y + b.height + tolerance) {
      const bestPort = inPorts.find(p => p.type === sourceType) || inPorts[0];
      if (bestPort) return { node, port: bestPort, point: portPoint(node, bestPort, true) };
    }
  }
  return null;
}

export function CanvasConnections({ nodes, projectId, zoom }: { nodes: CanvasNode[]; projectId: string; zoom: number }) {
  const root = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourcePort, setSourcePort] = useState<CanvasPortDefinition | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hoverTarget, setHoverTarget] = useState<TargetHit | null>(null);
  const [selected, setSelected] = useState<{ from: string; to: string } | null>(null);
  const [menu, setMenu] = useState<(Point & { world: Point }) | null>(null);
  const [message, setMessage] = useState('');

  const source = nodes.find(n => n.id === sourceId);

  const dismiss = useCallback(() => {
    setSourceId(null); setSourcePort(null); setCursor(null); setMenu(null); setHoverTarget(null);
  }, []);

  const connect = useCallback((target: CanvasNode, _targetPort?: CanvasPortDefinition) => {
    if (!sourceId) return;
    const edges = useCanvasStore.getState().projects.find(p => p.id === projectId)?.edges;
    const error = connectionError(nodes, sourceId, target.id, edges);
    if (error) { setMessage(error); dismiss(); return; }
    const currentRefs = target.referenceNodeIds || [];
    if (!currentRefs.includes(sourceId)) {
      useCanvasStore.getState().updateNode(projectId, target.id, { referenceNodeIds: [...currentRefs, sourceId] });
      useCanvasStore.getState().addEdge(projectId, {
        sourceNodeId: sourceId, sourceHandle: sourcePort?.id || 'output',
        targetNodeId: target.id, targetHandle: _targetPort?.id || 'input',
      });
    }
    dismiss();
  }, [sourceId, sourcePort, nodes, projectId, dismiss]);

  const disconnect = useCallback(() => {
    if (!selected) return;
    const node = nodes.find(n => n.id === selected.to);
    if (node?.layerLocked) { setMessage('请先解锁节点'); return; }
    const project = useCanvasStore.getState().projects.find(p => p.id === projectId);
    const edges = (project?.edges || []).filter(edge => edge.sourceNodeId === selected.from && edge.targetNodeId === selected.to);
    if (edges.length > 0) {
      edges.forEach(edge => useCanvasStore.getState().deleteEdge(projectId, edge.id));
    } else if (node) {
      useCanvasStore.getState().updateNode(projectId, node.id, {
        referenceNodeIds: node.referenceNodeIds?.filter(id => id !== selected.from),
      });
    }
    setSelected(null);
  }, [selected, nodes, projectId]);

  useEffect(() => { dismiss(); setSelected(null); setMessage(''); }, [projectId, dismiss]);
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
      const rect = root.current?.getBoundingClientRect();
      return rect ? { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom } : null;
    };
    const move = (e: MouseEvent) => {
      if (menu) return;
      const p = getPoint(e);
      if (!p) return;
      const hit = findPortTarget(nodes, sourceId, sourcePort.type, p, zoom);
      setHoverTarget(hit); setCursor(hit ? hit.point : p);
    };
    const up = (e: MouseEvent) => {
      if (menu || (e.target as Element)?.closest?.('[data-connection-port]')) return;
      const element = e.target as Element;
      const p = getPoint(e);
      if (!p || e.button !== 0) return;
      const hit = findPortTarget(nodes, sourceId, sourcePort.type, p, zoom);
      if (hit) { connect(hit.node, hit.port); return; }
      if (element.closest?.('[data-testid="canvas-viewport"]') && !element.closest('.canvas-node-card,.canvas-fixed-ui,button,input,textarea')) {
        setMenu({ x: e.clientX, y: e.clientY, world: p });
      } else { dismiss(); }
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up, true); window.removeEventListener('keydown', key); };
  }, [sourceId, sourcePort, zoom, nodes, menu, connect, dismiss]);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector('button')?.focus();
    const outside = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) dismiss(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [menu, dismiss]);

  const createNext = (kind: 'image' | 'video' | 'extend') => {
    if (!source || !menu) return;
    const isVideo = kind === 'video' || kind === 'extend';
    const title = kind === 'extend' ? '视频智能续写' : isVideo ? '视频生成' : '图片生成';
    useCanvasStore.getState().addNode(projectId, {
      type: 'drawing', generationKind: isVideo ? 'video' : 'image', title,
      x: menu.world.x - 140, y: menu.world.y - 100, width: 560, height: 500, referenceNodeIds: [source.id],
    });
    dismiss();
  };

  type NextKind = 'image' | 'video' | 'extend';
  const activePortOptions = useMemo<Array<{ key: NextKind; label: string; icon: typeof ImagePlus; desc: string }>>(() => {
    if (!source) return [];
    if (isTextSource(source)) {
      return [
        { key: 'image', label: '文生图', icon: ImagePlus, desc: '以此提示词生成新图片' },
        { key: 'video', label: '文生视频', icon: Video, desc: '以此提示词生成新视频' },
      ];
    }
    if (source.type === 'video' || source.generationKind === 'video') {
      return [
        { key: 'extend', label: '智能续写', icon: Sparkles, desc: '从视频尾帧接续生成下个镜头' },
        { key: 'video', label: '参考视频生成', icon: Video, desc: '提取画面/动作连贯生成' },
      ];
    }
    return [
      { key: 'video', label: '图生视频', icon: Video, desc: '以此图片作为首帧生成连贯动态' },
      { key: 'image', label: '垫图绘图', icon: ImagePlus, desc: '保持主体一致性进行图生图' },
    ];
  }, [source]);

  return (
    <div ref={root} className="pointer-events-none absolute inset-0">
      {message && createPortal(
        <div role="status" className="pointer-events-none fixed left-1/2 top-20 z-[200] -translate-x-1/2 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-[#1B1B1E] px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-xl">
          {message}
        </div>,
        document.body,
      )}

      {menu && source && createPortal(
        <div
          ref={menuRef} role="menu" aria-label="连接下一步"
          className="fixed z-[200] w-64 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#1B1B1E]/95 backdrop-blur-md p-2 text-xs text-slate-700 dark:text-[#C7C7CC] shadow-2xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-95"
          style={{ left: Math.max(12, Math.min(menu.x, window.innerWidth - 270)), top: Math.max(12, Math.min(menu.y, window.innerHeight - 200)) }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-slate-100 dark:border-white/10 mb-1">
            <p className="font-semibold text-slate-800 dark:text-white">接续创作流</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">以 {source.title || '当前节点'} 自动作为输入引用</p>
          </div>
          {activePortOptions.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key} role="menuitem" type="button"
                className="flex w-full items-center gap-3 rounded-xl p-2.5 hover:bg-indigo-50/80 dark:hover:bg-white/[0.06] transition-colors text-left cursor-pointer group"
                onClick={() => createNext(opt.key)}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Icon size={16} />
                </div>
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-white">{opt.label}</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">{opt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      <svg className="absolute left-0 top-0 h-px w-px overflow-visible" aria-label="画布参考连线">
        <defs>
          <linearGradient id="flow-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        {nodes.flatMap(target => (target.referenceNodeIds || []).map(id => {
          const from = nodes.find(n => n.id === id);
          if (!from || from.layerHidden || target.layerHidden) return null;
          const active = selected?.from === id && selected.to === target.id;
          const isTargetGenerating = target.status === 'generating';
          const outPorts = getNodeOutputPorts(from);
          const inPorts = getNodeInputPorts(target);
          const a = portPoint(from, outPorts[0], false);
          const b = portPoint(target, inPorts[0] || { id: 'in', label: '入', type: 'any', position: 'left' }, true);
          const path = curve(a, b);
          const color = active ? '#6366f1' : isTargetGenerating ? 'url(#flow-line-grad)' : !referenceReady(from) ? '#d3a95c' : isTextSource(from) ? '#a5a0cd' : '#94a3b8';
          return (
            <g key={`${id}-${target.id}`}>
              {active && <path d={path} fill="none" stroke="#6366f1" strokeOpacity={0.25} strokeWidth={8} vectorEffect="non-scaling-stroke" />}
              <path
                d={path} fill="none" stroke={color} strokeOpacity={active ? 1 : isTargetGenerating ? 0.95 : 0.6}
                strokeWidth={active ? 2.5 : isTargetGenerating ? 2 : 1.5}
                strokeDasharray={isTargetGenerating ? '6 4' : !referenceReady(from) ? '5 5' : undefined}
                className={isTargetGenerating ? 'animate-pulse' : undefined} vectorEffect="non-scaling-stroke"
              />
              <path
                data-connection-edge="true" role="button" tabIndex={0}
                aria-label={`选择连线 ${from.title || '节点'} → ${target.title || '节点'}`}
                className="pointer-events-auto cursor-pointer focus:stroke-indigo-300/30 focus:outline-none"
                d={path} fill="none" stroke="transparent" strokeWidth={20} vectorEffect="non-scaling-stroke"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setSelected({ from: id, to: target.id }); }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected({ from: id, to: target.id }); } }}
              />
            </g>
          );
        }))}
        {source && sourcePort && cursor && (
          <path d={curve(portPoint(source, sourcePort, false), cursor)} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {selected && (() => {
        const from = nodes.find(n => n.id === selected.from);
        const to = nodes.find(n => n.id === selected.to);
        if (!from || !to || !to.referenceNodeIds?.includes(from.id)) return null;
        const outPorts = getNodeOutputPorts(from);
        const a = portPoint(from, outPorts[0], false);
        const b = portPoint(to, { id: 'in', label: '入', type: 'any', position: 'left' }, true);
        return (
          <button
            data-connection-edge="true"
            className="pointer-events-auto absolute z-40 flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#1B1B1E]/95 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 shadow-xl dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-sm hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-900/50 transition-all cursor-pointer"
            style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2, transform: `translate(-50%,-50%) scale(${1 / zoom})` }}
            onMouseDown={e => e.stopPropagation()}
            onClick={disconnect}
          >
            <Unplug size={13} />
            <span>断开连线</span>
          </button>
        );
      })()}

      {nodes.filter(n => !n.layerLocked && !n.layerHidden).flatMap(node => {
        const outPorts = getNodeOutputPorts(node);
        const inPorts = getNodeInputPorts(node);
        const handles: React.ReactNode[] = [];
        if (canConnect(node)) {
          outPorts.forEach(port => {
            const p = portPoint(node, port, false);
            const isDraggingThis = sourceId === node.id && sourcePort?.id === port.id;
            handles.push(
              <button
                key={`out-${node.id}-${port.id}`} type="button" data-connection-port="true"
                aria-label={`从 ${node.title || node.id} 的 ${port.label} 连线`}
                title={`拖出连线：${port.label}；在空白处松开可快速创建下一步`}
                className={`pointer-events-auto absolute z-30 flex items-center justify-center rounded-full border-0 bg-transparent p-0 transition-opacity duration-150 focus:outline-none focus-visible:opacity-100 hover:opacity-100 ${
                  isDraggingThis ? 'opacity-100 text-indigo-600 dark:text-indigo-400' : 'opacity-0 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                }`}
                style={{ left: p.x + 18 / zoom, top: p.y, width: 48, height: 48, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setSelected(null); setSourceId(node.id); setSourcePort(port); setCursor(p); }}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] bg-white dark:bg-[#1B1B1E] shadow-sm transition-transform hover:scale-125 ${
                  isDraggingThis ? 'border-indigo-600 ring-4 ring-indigo-100 dark:ring-indigo-950/60' : 'border-indigo-400 dark:border-indigo-500/80'
                }`}>
                  <Plus size={14} strokeWidth={2} className="text-indigo-600 dark:text-indigo-400" />
                </span>
              </button>,
            );
          });
        }
        if (inPorts.length > 0) {
          inPorts.forEach(port => {
            const p = portPoint(node, port, true);
            const isTarget = hoverTarget?.node.id === node.id && hoverTarget?.port.id === port.id;
            const isCompatible = sourcePort && (
              sourcePort.type === port.type || port.type === 'any' || (sourcePort.type === 'image' && port.id.includes('frame'))
            );
            const showPort = sourceId !== null ? isCompatible : false;
            handles.push(
              <button
                key={`in-${node.id}-${port.id}`} type="button" data-connection-port="true"
                aria-label={`连接至 ${node.title || node.id} 的 ${port.label}`} title={`接收：${port.label}`}
                className={`pointer-events-auto absolute z-30 flex items-center justify-center rounded-full border-0 bg-transparent p-0 transition-all duration-150 focus:outline-none focus-visible:opacity-100 hover:opacity-100 ${
                  showPort ? 'opacity-100' : 'opacity-0 hover:opacity-100'
                }`}
                style={{ left: p.x - 18 / zoom, top: p.y, width: 48, height: 48, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                onMouseUp={e => { e.stopPropagation(); if (sourceId) connect(node, port); }}
                onClick={e => { e.stopPropagation(); if (sourceId) connect(node, port); }}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] bg-white dark:bg-[#1B1B1E] shadow-sm transition-transform ${
                  isTarget ? 'border-emerald-500 scale-125 ring-4 ring-emerald-100 dark:ring-emerald-950/60' : showPort ? 'border-indigo-500 ring-2 ring-indigo-50 dark:ring-indigo-950/40' : 'border-slate-400 dark:border-white/30'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${isTarget ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                </span>
              </button>,
            );
          });
        }
        return handles;
      })}
    </div>
  );
}
