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
import { canvasNavigationNodes, nodeBounds } from '../../model/canvasGraph';
import type { CanvasNode, CanvasProject } from '../../model/types';
import type { AlignmentGuide } from '../../hooks/useCanvasSnapping';

const minimapWidth = 186;
const minimapHeight = 130;
const minimapPadding = 12;
const minimapFrameInset = 7;

function CanvasMinimap({ nodes, pan, zoom, viewportSize, selectedNodeIds, onCenter }: {
  nodes: CanvasNode[];
  pan: { x: number; y: number };
  zoom: number;
  viewportSize: { width: number; height: number };
  selectedNodeIds: string[];
  onCenter: (x: number, y: number, zoomDelta?: number) => void;
}) {
  const { isDark } = useAppTheme();
  const mapRef = useRef<SVGSVGElement>(null);
  const visible = useMemo(() => canvasNavigationNodes(nodes), [nodes]);
  const projection = useMemo(() => {
    if (!visible.length) return null;
    const bounds = visible.map(item => item.bounds);
    const left = Math.min(...bounds.map(box => box.x));
    const top = Math.min(...bounds.map(box => box.y));
    const right = Math.max(...bounds.map(box => box.x + box.width));
    const bottom = Math.max(...bounds.map(box => box.y + box.height));
    const scale = Math.min(
      (minimapWidth - minimapPadding * 2) / (right - left),
      (minimapHeight - minimapPadding * 2) / (bottom - top),
    );
    return {
      scale,
      x: (minimapWidth - (right - left) * scale) / 2 - left * scale,
      y: (minimapHeight - (bottom - top) * scale) / 2 - top * scale,
    };
  }, [visible]);
  const viewport = { x: -pan.x / zoom, y: -pan.y / zoom,
    width: viewportSize.width / zoom, height: viewportSize.height / zoom };
  const contentInView = visible.some(({ bounds }) =>
    bounds.x < viewport.x + viewport.width && bounds.x + bounds.width > viewport.x &&
    bounds.y < viewport.y + viewport.height && bounds.y + bounds.height > viewport.y);
  const selected = new Set(selectedNodeIds);
  const viewFrame = projection && {
    left: Math.max(minimapFrameInset, viewport.x * projection.scale + projection.x),
    top: Math.max(minimapFrameInset, viewport.y * projection.scale + projection.y),
    right: Math.min(minimapWidth - minimapFrameInset, (viewport.x + viewport.width) * projection.scale + projection.x),
    bottom: Math.min(minimapHeight - minimapFrameInset, (viewport.y + viewport.height) * projection.scale + projection.y),
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !projection) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { left, top, width, height } = map.getBoundingClientRect();
      const x = ((event.clientX - left) * minimapWidth / width - projection.x) / projection.scale;
      const y = ((event.clientY - top) * minimapHeight / height - projection.y) / projection.scale;
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
      const delta = Math.max(-100, Math.min(100, event.deltaY * units));
      if (delta) onCenter(x, y, -delta * 0.0005);
    };
    map.addEventListener('wheel', onWheel, { passive: false });
    return () => map.removeEventListener('wheel', onWheel);
  }, [onCenter, projection]);

  const moveViewport = (event: PointerEvent<SVGSVGElement>) => {
    if (!projection) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * minimapWidth / rect.width;
    const y = (event.clientY - rect.top) * minimapHeight / rect.height;
    onCenter((x - projection.x) / projection.scale, (y - projection.y) / projection.scale);
  };

  return <aside aria-label="画布导航" className="canvas-fixed-ui absolute bottom-[52px] left-4 z-30 hidden overflow-hidden rounded-[10px] border border-zinc-200 bg-zinc-50 dark:border-white/[0.14] dark:bg-[#18181a] sm:[@media(min-height:600px)]:block">
    <svg ref={mapRef} role="img" aria-label="点击缩略图定位画布" width={minimapWidth} height={minimapHeight}
      viewBox={`0 0 ${minimapWidth} ${minimapHeight}`} className={projection ? 'block touch-none cursor-crosshair' : 'block'}
      onPointerDown={event => {
        if (!projection || !event.isPrimary || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const nodeId = (event.target as Element).getAttribute('data-minimap-node-id');
        const target = nodeId && visible.find(item => item.node.id === nodeId)?.bounds;
        if (target) onCenter(target.x + target.width / 2, target.y + target.height / 2);
        else moveViewport(event);
      }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) moveViewport(event); }}>
      {projection ? <>
        {visible.map(({ node, bounds }) => {
          const w = bounds.width * projection.scale;
          const h = bounds.height * projection.scale;
          return <rect key={node.id} data-minimap-node-id={node.id} x={bounds.x * projection.scale + projection.x - Math.max(0, 3 - w) / 2}
            y={bounds.y * projection.scale + projection.y - Math.max(0, 3 - h) / 2}
            width={Math.max(3, w)} height={Math.max(3, h)} rx={0.75}
            fill={selected.has(node.id) ? (isDark ? '#686871' : '#71717a')
              : node.type === 'frame' ? (isDark ? '#2d2d32' : '#e4e4e7') : (isDark ? '#3b3b43' : '#a1a1aa')} />;
        })}
        {contentInView && viewFrame && <rect pointerEvents="none"
          x={viewFrame.left} y={viewFrame.top}
          width={Math.max(0, viewFrame.right - viewFrame.left)}
          height={Math.max(0, viewFrame.bottom - viewFrame.top)}
          rx={12} fill="none" stroke={isDark ? '#74747b' : '#71717a'} strokeWidth={1.25} />}
      </> : <text x={minimapWidth / 2} y={minimapHeight / 2} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="currentColor" className="text-zinc-500 dark:text-zinc-400">暂无节点</text>}
    </svg>
    {projection && !contentInView && <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] text-zinc-600 dark:text-zinc-400">当前视野在内容外</span>}
  </aside>;
}

export interface CanvasEditorBoardProps {
  minimapVisible: boolean;
  alignmentGuides?: AlignmentGuide[];
  centerAt: (x: number, y: number, zoomDelta?: number) => void;
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
  const coverWorkflow = currentProject.nativeCommerce?.kind === 'poster';

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
            coverWorkflow={coverWorkflow}
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

      {!editingDrawingId && p.minimapVisible && <CanvasMinimap nodes={nodes} pan={pan} zoom={zoom} viewportSize={viewportSize} selectedNodeIds={p.selectedNodeIds} onCenter={p.centerAt} />}
    </CanvasPromptPanContext.Provider>
  );
}
