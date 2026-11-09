import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent, type RefObject, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { CanvasSelectionToolbar } from './CanvasSelectionToolbar';
import {
  Copy, Edit3, Lock, Trash2, Unlock,
} from 'lucide-react';
import { CanvasNodeMenu, CanvasPromptPanContext, type CanvasQuickNodeType } from './CanvasNodeMenu';
import { DotGrid } from '@client/shared/media/widgets/DotGrid';
import { CanvasConnections } from './CanvasConnections';
import { CanvasStudioFreeformLayer } from './CanvasStudioFreeformLayer';
import { CanvasStageNode } from '../stage/CanvasStageNode';
import { useCanvasFileDrop } from '../../hooks/useCanvasGenerationSync';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { nodeBounds } from '../../model/canvasGraph';
import type { CanvasNode, CanvasProject } from '../../model/types';
import type { AlignmentGuide } from '../../hooks/useCanvasSnapping';

function CanvasMinimap({nodes, pan, zoom, viewportRef, onCenter}: {nodes:CanvasNode[]; pan:{x:number;y:number}; zoom:number; viewportRef:RefObject<HTMLDivElement|null>; onCenter:(x:number,y:number)=>void}) {
  const { isDark } = useAppTheme();
  const [size,setSize]=useState({width:900,height:600});
  const dragMap = useRef<{ x: number; y: number; scale: number } | null>(null);
  useEffect(()=>{
    const element=viewportRef.current;if(!element)return;
    const update=()=>setSize({width:element.clientWidth,height:element.clientHeight});
    update();const observer=new ResizeObserver(update);observer.observe(element);return()=>observer.disconnect();
  },[viewportRef]);
  const visible=nodes.filter(n=>!n.layerHidden);
  const viewport={x:-pan.x/zoom,y:-pan.y/zoom,width:size.width/zoom,height:size.height/zoom};
  const bounds=[viewport,...visible.map(nodeBounds)];
  const x=Math.min(...bounds.map(b=>b.x))-60,y=Math.min(...bounds.map(b=>b.y))-60;
  const width=Math.max(...bounds.map(b=>b.x+b.width))-x+60,height=Math.max(...bounds.map(b=>b.y+b.height))-y+60;
  const scale=Math.min(152/width,92/height), offsetX=(186-width*scale)/2,offsetY=(108-height*scale)/2;
  const moveViewport = (event: PointerEvent<SVGSVGElement>) => {
    const map = dragMap.current;
    if (!map) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onCenter((event.clientX - rect.left) / map.scale + map.x, (event.clientY - rect.top) / map.scale + map.y);
  };
  return <aside aria-label="画布导航" className="canvas-fixed-ui absolute bottom-[52px] left-4 z-30 hidden overflow-hidden rounded-xl border border-white dark:border-white/10 bg-white/90 dark:bg-[#202022] sm:[@media(min-height:600px)]:block">
    <svg role="img" aria-label="点击缩略图定位画布" width="186" height="108" className="touch-none cursor-crosshair"
      onPointerDown={event=>{
        if (!event.isPrimary || event.button !== 0) return;
        dragMap.current = { x: x - offsetX / scale, y: y - offsetY / scale, scale };
        event.currentTarget.setPointerCapture(event.pointerId);
        moveViewport(event);
      }}
      onPointerMove={event=>{ if(event.currentTarget.hasPointerCapture(event.pointerId)) moveViewport(event); }}
      onLostPointerCapture={()=>{ dragMap.current = null; }}>
      {visible.map(node=>{const b=nodeBounds(node);return <rect key={node.id} x={(b.x-x)*scale+offsetX} y={(b.y-y)*scale+offsetY} width={b.width*scale} height={b.height*scale} rx={2} fill={node.type === 'frame' ? (isDark ? '#323238' : '#e4e4e7') : (isDark ? '#71717a' : '#a1a1aa')} stroke={isDark?'#18191c':'#fff'} strokeWidth={0.5}/>;})}
      <rect x={(viewport.x-x)*scale+offsetX} y={(viewport.y-y)*scale+offsetY}
        width={viewport.width*scale} height={viewport.height*scale} rx={3} fill="none" stroke="#edb699" />
    </svg>
  </aside>;
}

export interface CanvasEditorBoardProps {
  minimapVisible: boolean;
  alignmentGuides?: AlignmentGuide[];
  centerAt: (x: number, y: number) => void;
  panForPrompt: (x: number, y: number) => void;
  selectedNodeIds: string[];
  setSelectedNodeIds: (ids: string[]) => void;
  dragPositions: Record<string, { x: number; y: number }>;
  selectionBox: { x: number; y: number; width: number; height: number } | null;
  handleNodeClick: (node: CanvasNode, event: MouseEvent) => boolean;
  onRegenerate: (node: CanvasNode) => void;
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  canvasFileDrop: ReturnType<typeof useCanvasFileDrop>;
  handleMouseDownCanvas: (e: MouseEvent) => void;
  closeNodeMenu: () => void;
  duplicateNodes: (ids: string[]) => void;
  removeNodes: (ids: string[]) => void;
  handleWheel: (e: globalThis.WheelEvent) => void;
  openNodeMenuAt: (x: number, y: number) => void;
  isPanning: boolean;
  isHandMode: boolean;
  pan: { x: number; y: number };
  zoom: number;
  nodeMenu: { screenX: number; screenY: number; x: number; y: number } | null;
  handleCreateQuickNode: (kind: CanvasQuickNodeType) => void;
  nodes: CanvasNode[];
  currentProject: CanvasProject;
  draggingNodeId: string | null;
  draggingNodePos: { x: number; y: number } | null;
  handleCreateStarterNode: (kind: 'text-video' | 'image-background' | 'first-frame-video') => void;
  replacementNodeRef: MutableRefObject<string | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  setSelectedNodeId: (id: string | null) => void;
  editingDrawingId: string | null;
  editingNodeTitleId: string | null;
  tempNodeTitle: string;
  drawingPress: MutableRefObject<{ x: number; y: number } | null>;
  setEditingDrawingId: (id: string | null) => void;
  setTempNodeTitle: (value: string) => void;
  setEditingNodeTitleId: (id: string | null) => void;
  handleNodeDragStart: (node: CanvasNode, e: MouseEvent) => void;
  handleStartEditNodeTitle: (node: CanvasNode, e?: MouseEvent) => void;
  handleSaveNodeTitle: (nodeId: string) => void;
  handleAddNodeToComposer: (node: CanvasNode, e?: MouseEvent) => void;
  setLightingModalNode: (node: CanvasNode | null) => void;
  setMultiAngleModalNode: (node: CanvasNode | null) => void;
  setPreviewMedia: (media: { url: string; type: 'image' | 'video' } | null) => void;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
  deleteNode: (projectId: string, nodeId: string) => void;
}

export function CanvasEditorBoard(p: CanvasEditorBoardProps) {
  const { isDark } = useAppTheme();
  const [contextMenu, setContextMenu] = useState<{ projectId: string; nodeId: string; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextTargetRef = useRef<HTMLElement | null>(null);

  const {
    alignmentGuides,
    canvasViewportRef, canvasFileDrop, handleMouseDownCanvas, handleWheel, openNodeMenuAt,
    isPanning, isHandMode, pan, zoom, nodeMenu, handleCreateQuickNode, nodes, currentProject,
    draggingNodeId, draggingNodePos, fileInputRef, replacementNodeRef,
    setSelectedNodeId, editingDrawingId, editingNodeTitleId, tempNodeTitle, drawingPress,
    setEditingDrawingId, setTempNodeTitle, setEditingNodeTitleId, handleNodeDragStart, handleStartEditNodeTitle,
    handleSaveNodeTitle, handleAddNodeToComposer, setLightingModalNode, setMultiAngleModalNode, setPreviewMedia,
    updateNode, deleteNode,
  } = p;

  const contextNode = contextMenu?.projectId === currentProject.id
    ? nodes.find(node => node.id === contextMenu.nodeId && !node.layerHidden)
    : undefined;
  const contextMenuOpen = Boolean(contextNode);
  useEffect(() => {
    if (!contextMenuOpen) {
      setContextMenu(null);
      return;
    }
    const close = () => setContextMenu(null);
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !contextMenuRef.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
      contextTargetRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [contextMenuOpen]);
  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    if (!contextMenu || !menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(contextMenu.x, document.documentElement.clientWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(contextMenu.y, document.documentElement.clientHeight - height - 8))}px`;
    menu.querySelector('button')?.focus({ preventScroll: true });
  }, [contextMenu]);

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const measure = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [canvasViewportRef]);
  const visibleBounds = useMemo(() => {
    const padding = 420;
    return {
      left: (-pan.x - padding) / zoom, top: (-pan.y - padding) / zoom,
      right: (viewportSize.width - pan.x + padding) / zoom, bottom: (viewportSize.height - pan.y + padding) / zoom,
    };
  }, [pan, zoom, viewportSize]);
  const visibleNodes = useMemo(() => {
    const selected = new Set(p.selectedNodeIds);
    return nodes.filter(node => {
      if (selected.has(node.id) || !viewportSize.width) return true;
      const bounds = nodeBounds(p.dragPositions[node.id] ? { ...node, ...p.dragPositions[node.id] } : node);
      return bounds.x + bounds.width >= visibleBounds.left && bounds.x <= visibleBounds.right &&
        bounds.y + bounds.height >= visibleBounds.top && bounds.y <= visibleBounds.bottom;
    });
  }, [nodes, p.selectedNodeIds, p.dragPositions, viewportSize.width, visibleBounds]);

  const wheelHandler = useRef(handleWheel);
  wheelHandler.current = (event) => {
    handleWheel(event);
    if (contextMenu) setContextMenu(null);
    if (!event.defaultPrevented) return;
    if (nodeMenu) p.closeNodeMenu();
  };
  useEffect(() => {
    const viewport = canvasViewportRef.current;
    const wheel = (event: globalThis.WheelEvent) => wheelHandler.current(event);
    viewport?.addEventListener('wheel', wheel, { passive: false });
    return () => viewport?.removeEventListener('wheel', wheel);
  }, [canvasViewportRef]);

  return (
    <CanvasPromptPanContext.Provider value={p.panForPrompt}>
      <div
        ref={canvasViewportRef}
        {...canvasFileDrop.dropProps}
        data-testid="canvas-viewport"
        data-canvas-context-menu
        onMouseDown={(e) => {
          setContextMenu(null);
          handleMouseDownCanvas(e);
        }}
        onContextMenu={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
          event.preventDefault();
          setContextMenu(null);
        }}
        onDoubleClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            (event.target as HTMLElement).closest('.canvas-node-card, button, input, textarea, select, a, .canvas-fixed-ui')
          ) {
            return;
          }
          openNodeMenuAt(event.clientX, event.clientY);
        }}
        className={`flex-1 w-full h-full relative overflow-clip ${
          isPanning ? 'cursor-grabbing' : isHandMode ? 'cursor-grab' : 'cursor-default'
        }`}
      >
        <DotGrid
          variant="canvas"
          animated={false}
          pan={pan}
          zoom={zoom}
          dotSize={1}
          gap={19}
          baseColor={isDark ? '#ffffff40' : '#91919a'}
        />

        {nodeMenu && (
          <CanvasNodeMenu
            x={nodeMenu.screenX}
            y={nodeMenu.screenY}
            onClose={p.closeNodeMenu}
            onSelect={handleCreateQuickNode}
          />
        )}

        {contextNode && createPortal(
          <div
            ref={contextMenuRef}
            role="menu"
            aria-label="节点右键菜单"
            data-canvas-context-menu
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onBlur={(event) => {
              if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setContextMenu(null);
            }}
            onKeyDown={(event) => {
              if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              const step = event.key === 'ArrowUp' ? -1 : 1;
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + step + items.length) % items.length;
              items[next]?.focus();
            }}
            className="canvas-fixed-ui fixed z-[200] max-h-[calc(100dvh-16px)] w-44 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#202024]/95 p-1.5 text-xs text-slate-700 dark:text-zinc-200 shadow-2xl backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={() => {
                p.duplicateNodes([contextNode.id]);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
            >
              <Copy size={13} />
              <span>复制节点</span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleStartEditNodeTitle(contextNode);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
            >
              <Edit3 size={13} />
              <span>重命名节点</span>
            </button>
            <button
              type="button"
              onClick={() => {
                updateNode(currentProject.id, contextNode.id, { layerLocked: !contextNode.layerLocked });
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
            >
              {contextNode.layerLocked ? <Unlock size={13} /> : <Lock size={13} />}
              <span>{contextNode.layerLocked ? '解锁节点' : '锁定节点'}</span>
            </button>
            <div className="my-1 border-t border-slate-100 dark:border-white/10" />
            <button
              type="button"
              disabled={Boolean(contextNode.layerLocked || contextNode.status === 'generating')}
              onClick={() => {
                p.removeNodes([contextNode.id]);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40 cursor-pointer"
            >
              <Trash2 size={13} />
              <span>删除节点</span>
            </button>
          </div>,
          document.body,
        )}

        {canvasFileDrop.pending > 0 && (
          <div role="status" className="pointer-events-none absolute right-4 top-4 z-50 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm dark:text-slate-300 dark:border-white/10 dark:bg-[#18191c]">
            素材上传中 · 剩余 {canvasFileDrop.pending} 个
          </div>
        )}
        {canvasFileDrop.errors.length > 0 && (
          <div role="alert" className="absolute right-4 top-16 z-50 max-h-48 max-w-sm overflow-auto rounded-xl border border-red-100 bg-white p-3 text-xs text-red-600 shadow-sm dark:bg-[#18191c]">
            {canvasFileDrop.errors.map((error, index) => <p key={index}>{error}</p>)}
            <button type="button" onClick={canvasFileDrop.dismissErrors} className="mt-2 text-slate-500 dark:text-slate-400">关闭</button>
          </div>
        )}

        <div
          data-native-canvas-world
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {alignmentGuides && alignmentGuides.length > 0 && (
            <svg className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible z-40" aria-label="对齐吸附辅助线">
              {alignmentGuides.map((guide, idx) => {
                if (guide.type === 'vertical') {
                  return (
                    <line
                      key={`snap-v-${idx}-${guide.coordinate}`}
                      x1={guide.coordinate}
                      y1={guide.start}
                      x2={guide.coordinate}
                      y2={guide.end}
                      stroke="#6366f1"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }
                return (
                  <line
                    key={`snap-h-${idx}-${guide.coordinate}`}
                    x1={guide.start}
                    y1={guide.coordinate}
                    x2={guide.end}
                    y2={guide.coordinate}
                    stroke="#6366f1"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
          )}

          <CanvasStudioFreeformLayer project={currentProject} nodes={nodes} />
          <CanvasConnections
            projectId={currentProject.id}
            zoom={zoom}
            selectedNodeIds={p.selectedNodeIds}
            visibleBounds={visibleBounds}
            nodes={nodes
              .filter((node) => !node.layerHidden && !node.foldedInGroupId)
              .map((node) => (p.dragPositions[node.id] ? { ...node, ...p.dragPositions[node.id] } : node))}
            onSelectCreatedNode={(nodeId, isDrawing) => {
              setSelectedNodeId(nodeId);
              setEditingDrawingId(isDrawing ? nodeId : null);
            }}
          />
          {p.selectionBox && (
            <div
              className="pointer-events-none absolute z-50 border border-indigo-400 bg-indigo-400/10"
              style={{
                left: p.selectionBox.x,
                top: p.selectionBox.y,
                width: p.selectionBox.width,
                height: p.selectionBox.height,
              }}
            />
          )}
          {visibleNodes.map((node) => (
            <CanvasStageNode
              key={node.id}
              node={p.dragPositions[node.id] ? { ...node, ...p.dragPositions[node.id] } : node}
              isSelected={p.selectedNodeIds.includes(node.id)}
              multiSelected={p.selectedNodeIds.length > 1}
              handleNodeClick={p.handleNodeClick}
              onNodeContextMenu={(targetNode, event) => {
                p.closeNodeMenu();
                contextTargetRef.current = event.currentTarget as HTMLElement;
                setContextMenu({ projectId: currentProject.id, nodeId: targetNode.id, x: event.clientX, y: event.clientY });
              }}
              nodes={nodes}
              projectId={currentProject.id}
              zoom={zoom}
              draggingNodeId={draggingNodeId}
              draggingNodePos={draggingNodePos}
              editingDrawingId={editingDrawingId}
              editingNodeTitleId={editingNodeTitleId}
              tempNodeTitle={tempNodeTitle}
              drawingPress={drawingPress}
              fileInputRef={fileInputRef}
              replacementNodeRef={replacementNodeRef}
              setSelectedNodeId={setSelectedNodeId}
              setEditingDrawingId={setEditingDrawingId}
              setTempNodeTitle={setTempNodeTitle}
              setEditingNodeTitleId={setEditingNodeTitleId}
              handleNodeDragStart={handleNodeDragStart}
              handleStartEditNodeTitle={handleStartEditNodeTitle}
              handleSaveNodeTitle={handleSaveNodeTitle}
              handleAddNodeToComposer={handleAddNodeToComposer}
              setLightingModalNode={setLightingModalNode}
              setMultiAngleModalNode={setMultiAngleModalNode}
              setPreviewMedia={setPreviewMedia}
              updateNode={updateNode}
              deleteNode={deleteNode}
              onRegenerate={p.onRegenerate}
            />
          ))}
        </div>
        {!p.selectionBox && !isHandMode && (
          <CanvasSelectionToolbar
            projectId={currentProject.id}
            nodes={nodes}
            selectedIds={p.selectedNodeIds}
            onSelect={p.setSelectedNodeIds}
            pan={pan}
            zoom={zoom}
            positions={p.dragPositions}
            viewportRef={canvasViewportRef}
          />
        )}
      </div>

      {!editingDrawingId && p.minimapVisible && <CanvasMinimap nodes={nodes} pan={pan} zoom={zoom} viewportRef={canvasViewportRef} onCenter={p.centerAt} />}
    </CanvasPromptPanContext.Provider>
  );
}
