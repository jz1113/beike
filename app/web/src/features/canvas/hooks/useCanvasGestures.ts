import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';
import type { CanvasNode, CanvasProject } from '../types';
import type { useCanvasStore } from '../store/useCanvasStore';
export function fitCanvasNodes(nodes: CanvasNode[], width: number, height: number) {
  const valid = nodes.filter(n => [n.x,n.y,n.width,n.height].every(Number.isFinite) && n.width > 0 && n.height > 0);
  if (!valid.length) return {pan:{x:0,y:0},zoom:1};
  const left = Math.min(...valid.map(n => n.x - (n.type === 'drawing' ? Math.max(0, 960 - n.width) / 2 : 0)));
  const top = Math.min(...valid.map(n => n.y)) - 60;
  const right = Math.max(...valid.map(n => n.x + n.width + (n.type === 'drawing' ? Math.max(0, 960 - n.width) / 2 : 0)));
  const bottom = Math.max(...valid.map(n => n.y + (n.type === 'drawing' ? Math.max(n.height, 580) : n.height)));
  const availableWidth = Math.max(100, width - 160);
  const availableHeight = Math.max(100, height - 220);
  const zoom = Math.min(1, availableWidth / (right-left), availableHeight / (bottom-top));
  return {zoom,pan:{x:width / 2 - (left+right) / 2 * zoom,y:80 + availableHeight / 2 - (top+bottom) / 2 * zoom}};
}

export function useCanvasGestures(currentProject: CanvasProject | undefined, updateNode: ReturnType<typeof useCanvasStore.getState>['updateNode'], onBackgroundSelect: () => void, viewportRef?: React.RefObject<HTMLDivElement | null>) {
  const dragListenerCleanupRef = useRef<(() => void) | null>(null);
  // 画布平移与缩放状态
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [handTool, setHandTool] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const isHandMode = handTool || spaceHeld;
  const panStartRef = useRef({ x: 0, y: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // 节点拖拽与选中（采用轻量实时坐标 + rAF调度 + 结束单次原子持久化，彻底杜绝同步写 LocalStorage 掉帧）
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [draggingNodePos, setDraggingNodePos] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragLatestPosRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const isDraggingMovedRef = useRef(false);
  const dragRafIdRef = useRef<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const fittedProject = useRef<string | null>(null);
  useEffect(() => {
    fittedProject.current = null;
    setSelectedNodeId(null);
    setPan({x:0,y:0}); setZoom(1);
  }, [currentProject?.id]);
  useEffect(() => {
    if (!currentProject?.nodes.length || fittedProject.current === currentProject.id) return;
    const viewport = viewportRef?.current;
    const fit = () => {
      if (!viewport || viewport.clientWidth <= 0 || viewport.clientHeight <= 0) return;
      const view = fitCanvasNodes(currentProject.nodes, viewport.clientWidth, viewport.clientHeight);
      setPan(view.pan); setZoom(view.zoom);
      fittedProject.current = currentProject.id;
    };
    fit();
    const observer = typeof ResizeObserver !== 'undefined' && viewport ? new ResizeObserver(() => {
      if (fittedProject.current !== currentProject.id) fit();
    }) : null;
    if (viewport) observer?.observe(viewport);
    return () => observer?.disconnect();
  }, [currentProject, viewportRef]);

  useEffect(() => {
    return () => {
      dragListenerCleanupRef.current?.();
      if (dragRafIdRef.current !== null) {
        cancelAnimationFrame(dragRafIdRef.current);
        dragRafIdRef.current = null;
      }
      dragLatestPosRef.current = null;
      setDraggingNodeId(null);
      setDraggingNodePos(null);
    };
  }, [currentProject?.id]);

  // 缩放控制
  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.min(2.5, Math.max(0.1, parseFloat((prev + delta).toFixed(2)))));
  };

  const handleResetView = () => {
    const viewport = viewportRef?.current;
    const view = fitCanvasNodes(currentProject?.nodes || [], viewport?.clientWidth || window.innerWidth, viewport?.clientHeight || window.innerHeight);
    setPan(view.pan);
    setZoom(view.zoom);
  };

  useEffect(() => {
    const editing = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="menu"]');
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || editing(event.target) || editing(document.activeElement) || document.querySelector('[role="dialog"], [role="menu"], [aria-modal="true"]')) return;
      if (event.ctrlKey || event.metaKey) {
        if (event.altKey) return;
        if (['+', '=', '-', '0'].includes(event.key)) {
          event.preventDefault();
          if (event.key === '0') handleResetView();
          else handleZoom(event.key === '-' ? -0.1 : 0.1);
        }
        return;
      }
      if (event.altKey || event.shiftKey) return;
      if (event.code === 'Space' || event.key === ' ') {event.preventDefault(); setSpaceHeld(true);}
      if (event.key.toLowerCase() === 'h') {event.preventDefault(); setHandTool(true);}
      if (event.key.toLowerCase() === 'v') {event.preventDefault(); setHandTool(false);}
    };
    const up = (event: KeyboardEvent) => {if (event.code === 'Space' || event.key === ' ') setSpaceHeld(false);};
    const release = () => {setSpaceHeld(false); setIsPanning(false);};
    const endPan = () => setIsPanning(false);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', release);
    window.addEventListener('mouseup', endPan);
    return () => {window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', release); window.removeEventListener('mouseup', endPan);};
  }, [currentProject, viewportRef]);

  // 滚轮缩放与平移
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = -e.deltaY * 0.0015;
      setZoom((prev) => Math.min(2.5, Math.max(0.1, parseFloat((prev + zoomFactor).toFixed(2)))));
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  }, []);

  // 背景拖拽平移
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      const target = e.target as HTMLElement;
      if (
        (!isHandMode && target.closest('.canvas-node-card')) ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('.canvas-fixed-ui')
      ) {
        return;
      }
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      setSelectedNodeId(null);
      onBackgroundSelect();
    }
  };

  // 结束素材节点拖拽并单次原子化持久化（彻底避免 mousemove 每帧同步写入 localStorage 导致掉帧）
  const finishNodeDrag = useCallback(() => {
    if (dragRafIdRef.current !== null) {
      cancelAnimationFrame(dragRafIdRef.current);
      dragRafIdRef.current = null;
    }

    const finalPos = dragLatestPosRef.current;
    if (finalPos && isDraggingMovedRef.current && currentProject) {
      updateNode(currentProject.id, finalPos.id, {
        x: finalPos.x,
        y: finalPos.y,
      });
    }

    setDraggingNodeId(null);
    setDraggingNodePos(null);
    dragLatestPosRef.current = null;
    isDraggingMovedRef.current = false;
  }, [currentProject, updateNode]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPan({
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        });
      }
    },
    [isPanning],
  );

  const handleMouseUp = () => {
    setIsPanning(false);
    finishNodeDrag();
  };

  // 节点拖拽把手（支持点击图片或拖拽手柄平滑移动，同时排除按钮/输入框等交互）
  const handleNodeDragStart = (node: CanvasNode, e: React.MouseEvent) => {
    if (isHandMode || e.button === 1) {
      e.preventDefault(); e.stopPropagation();
      setIsPanning(true);
      panStartRef.current = {x:e.clientX-pan.x,y:e.clientY-pan.y};
      return;
    }
    if (e.button !== undefined && e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('video')
    ) {
      return;
    }
    // 阻止浏览器默认图片原生拖拽（杜绝幽灵图和 mousemove 事件被浏览器截断），阻止文字选中
    e.preventDefault();
    e.stopPropagation();

    setSelectedNodeId(node.id);
    setDraggingNodeId(node.id);
    isDraggingMovedRef.current = false;

    const initialPos = { id: node.id, x: node.x, y: node.y };
    dragLatestPosRef.current = initialPos;
    setDraggingNodePos(initialPos);

    const curPan = panRef.current;
    const curZoom = zoomRef.current;
    dragOffsetRef.current = {
      x: e.clientX - (node.x * curZoom + curPan.x),
      y: e.clientY - (node.y * curZoom + curPan.y),
    };

    dragListenerCleanupRef.current?.();
    // 绑定 window 全局指针事件，解决快速拖拽或移出画布边界丢帧脱手问题
    const onWindowMouseMove = (moveEvent: MouseEvent) => {
      const latestPan = panRef.current;
      const latestZoom = zoomRef.current;
      const newX = Math.round((moveEvent.clientX - dragOffsetRef.current.x - latestPan.x) / latestZoom);
      const newY = Math.round((moveEvent.clientY - dragOffsetRef.current.y - latestPan.y) / latestZoom);

      isDraggingMovedRef.current = true;
      dragLatestPosRef.current = { id: node.id, x: newX, y: newY };

      if (dragRafIdRef.current === null) {
        dragRafIdRef.current = requestAnimationFrame(() => {
          dragRafIdRef.current = null;
          if (dragLatestPosRef.current) {
            setDraggingNodePos({ ...dragLatestPosRef.current });
          }
        });
      }
    };

    const onWindowMouseUp = () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      finishNodeDrag();
    };

    dragListenerCleanupRef.current = () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
    window.addEventListener('mousemove', onWindowMouseMove, { passive: false });
    window.addEventListener('mouseup', onWindowMouseUp, { passive: false });
  };

  return { pan, zoom, isPanning, isHandMode, draggingNodeId, draggingNodePos, selectedNodeId, setSelectedNodeId, handleZoom, handleResetView, handleWheel, handleMouseDownCanvas, handleMouseMove, handleMouseUp, handleNodeDragStart };
}
