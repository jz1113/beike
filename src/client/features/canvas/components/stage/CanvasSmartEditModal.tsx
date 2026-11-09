import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Circle, Pencil, Redo2, Sparkles, Type, Undo2, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useAppStore } from '@client/store';
import { useCanvasStore } from '../../store/useCanvasStore';
import { drawingGeometry, loadCanvasGenerationModels } from '../../model/canvasNodeFactory';
import type { CanvasNode } from '../../model/types';

type SmartEditTool = 'mark' | 'brush' | 'arrow' | 'text' | 'circle';
interface SmartEditPoint { x: number; y: number; }

type SmartEditElement =
  | { id: string; type: 'marker'; x: number; y: number; endX?: number; endY?: number }
  | { id: string; type: 'brush'; color: string; lineWidth: number; points: SmartEditPoint[] }
  | { id: string; type: 'arrow' | 'circle'; color: string; lineWidth: number; startX: number; startY: number; endX: number; endY: number }
  | { id: string; type: 'text'; color: string; fontSize: number; x: number; y: number; text: string };

interface TextDraftState { id: string; x: number; y: number; value: string; color: string; fontSize: number; }

const SMART_EDIT_TOOLS: Array<{ id: SmartEditTool; label: string; icon?: typeof Pencil }> = [
  { id: 'mark', label: '标记' },
  { id: 'brush', label: '画笔', icon: Pencil },
  { id: 'arrow', label: '箭头', icon: ArrowUpRight },
  { id: 'text', label: '文字', icon: Type },
  { id: 'circle', label: '圆形', icon: Circle },
];

const SMART_EDIT_COLORS = ['#e51739', '#ffc944', '#66d675', '#3eadff', '#111111', '#ffffff'] as const;
const MARKER_COLOR = '#009EFA';
const MAX_MARKERS = 6;

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

function toJimengCoord(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return clamp(Math.round((value / total) * 999), 0, 999);
}

function formatMarkerCoordinateTag(marker: Extract<SmartEditElement, { type: 'marker' }>, width: number, height: number) {
  if (typeof marker.endX === 'number' && typeof marker.endY === 'number') {
    const x1 = toJimengCoord(Math.min(marker.x, marker.endX), width);
    const y1 = toJimengCoord(Math.min(marker.y, marker.endY), height);
    const x2 = toJimengCoord(Math.max(marker.x, marker.endX), width);
    const y2 = toJimengCoord(Math.max(marker.y, marker.endY), height);
    return `<bbox>${x1} ${y1} ${x2} ${y2}</bbox>`;
  }
  return `<point>${toJimengCoord(marker.x, width)} ${toJimengCoord(marker.y, height)}</point>`;
}

function drawMarkerPin(ctx: CanvasRenderingContext2D, x: number, y: number, index: number, scale = 1) {
  const r = 12 * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, -r, r, Math.PI * 0.78, Math.PI * 0.22, false);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = MARKER_COLOR;
  ctx.shadowColor = 'rgba(0,0,0,0.38)';
  ctx.shadowBlur = 8 * scale;
  ctx.shadowOffsetY = 2 * scale;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1.5, 2 * scale);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, -r, r * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = MARKER_COLOR;
  ctx.font = `700 ${Math.round(11 * scale)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index), 0, -r + 0.5 * scale);
  ctx.restore();
}

function drawVisualElement(ctx: CanvasRenderingContext2D, el: SmartEditElement, scaleX = 1, scaleY = 1) {
  const scale = (scaleX + scaleY) / 2;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (el.type === 'brush') {
    if (el.points.length === 0) { ctx.restore(); return; }
    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineWidth = Math.max(2, el.lineWidth * scale);
    const pts = el.points.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(2, (el.lineWidth * scale) / 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i += 1) {
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (el.type === 'arrow') {
    const sx = el.startX * scaleX, sy = el.startY * scaleY, ex = el.endX * scaleX, ey = el.endY * scaleY;
    const dx = ex - sx, dy = ey - sy;
    if (Math.hypot(dx, dy) < 2) { ctx.restore(); return; }
    const lw = Math.max(2, el.lineWidth * scale);
    const angle = Math.atan2(dy, dx);
    const headLen = Math.max(14 * scale, lw * 3.8);
    const headAngle = Math.PI / 6.5;

    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex - Math.cos(angle) * (headLen * 0.55), ey - Math.sin(angle) * (headLen * 0.55));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - headLen * Math.cos(angle - headAngle), ey - headLen * Math.sin(angle - headAngle));
    ctx.lineTo(ex - headLen * Math.cos(angle + headAngle), ey - headLen * Math.sin(angle + headAngle));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  if (el.type === 'circle') {
    const sx = el.startX * scaleX, sy = el.startY * scaleY, ex = el.endX * scaleX, ey = el.endY * scaleY;
    const rx = Math.abs(ex - sx) / 2, ry = Math.abs(ey - sy) / 2;
    if (rx < 1 || ry < 1) { ctx.restore(); return; }
    ctx.strokeStyle = el.color;
    ctx.lineWidth = Math.max(2, el.lineWidth * scale);
    ctx.beginPath();
    ctx.ellipse((sx + ex) / 2, (sy + ey) / 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (el.type === 'text') {
    ctx.fillStyle = el.color;
    ctx.font = `700 ${Math.max(14, Math.round(el.fontSize * scale))}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4 * scale;
    const lineHeight = Math.max(18, Math.round(el.fontSize * scale * 1.24));
    el.text.split('\n').forEach((line, idx) => {
      ctx.fillText(line, el.x * scaleX, el.y * scaleY + idx * lineHeight);
    });
    ctx.restore();
  }
}

export function CanvasSmartEditModal({
  node, projectId, updateNode, setSelectedNodeId, setEditingDrawingId,
}: {
  node: CanvasNode;
  projectId: string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
  setSelectedNodeId: (id: string | null) => void;
  setEditingDrawingId: (id: string | null) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<SmartEditTool>('mark');
  const [color, setColor] = useState<string>(SMART_EDIT_COLORS[0]);
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({
    width: node.resultWidth || node.width || 1024,
    height: node.resultHeight || node.height || 1024,
  });
  const [history, setHistory] = useState<{ past: SmartEditElement[][]; present: SmartEditElement[]; future: SmartEditElement[][] }>({ past: [], present: [], future: [] });
  const [draftElement, setDraftElement] = useState<SmartEditElement | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraftState | null>(null);

  const pointerInteractionRef = useRef<
    | { mode: 'mark'; id: string; startX: number; startY: number }
    | { mode: 'brush'; id: string; color: string; lineWidth: number; points: SmartEditPoint[] }
    | { mode: 'arrow' | 'circle'; id: string; color: string; lineWidth: number; startX: number; startY: number }
    | { mode: 'drag-text'; id: string; offsetX: number; offsetY: number; moved: boolean; snapshot: SmartEditElement[] }
    | null
  >(null);

  const configuredModels = useMemo(() => {
    const list = loadCanvasGenerationModels(false);
    return list.length > 0 ? list : [{ id: 'gpt-image-2', name: 'GPT Image 2' }];
  }, []);

  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    const quickModel = useAppStore.getState().quickModel;
    return quickModel && configuredModels.some((item) => item.id === quickModel)
      ? quickModel
      : configuredModels[0]?.id || 'gpt-image-2';
  });

  const selectedModel = useMemo(
    () => configuredModels.find((item) => item.id === selectedModelId) || configuredModels[0],
    [configuredModels, selectedModelId]
  );

  const elements = history.present;
  const markers = useMemo(
    () => elements.filter((item): item is Extract<SmartEditElement, { type: 'marker' }> => item.type === 'marker'),
    [elements]
  );

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const canSubmit = !submitting && (prompt.trim().length > 0 || elements.length > 0 || Boolean(textDraft?.value.trim()));

  const pushElements = useCallback((next: SmartEditElement[]) => {
    setHistory((prev) => ({ past: [...prev.past, prev.present], present: next, future: [] }));
  }, []);

  const commitTextDraft = useCallback(
    (draft: TextDraftState | null) => {
      if (!draft) return;
      const trimmed = draft.value.trim();
      setTextDraft(null);
      if (!trimmed) return;
      pushElements([
        ...history.present,
        { id: draft.id, type: 'text', color: draft.color, fontSize: draft.fontSize, x: draft.x, y: draft.y, text: trimmed },
      ]);
    },
    [history.present, pushElements]
  );

  const handleClose = useCallback(() => {
    updateNode(projectId, node.id, { activeUploadTool: null });
  }, [node.id, projectId, updateNode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (textDraft) { setTextDraft(null); return; }
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose, textDraft]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [modelMenuOpen]);

  const syncStageMetrics = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    setStageSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalSize((prev) =>
        prev.width === img.naturalWidth && prev.height === img.naturalHeight
          ? prev
          : { width: img.naturalWidth, height: img.naturalHeight }
      );
    }
  }, []);

  useEffect(() => {
    syncStageMetrics();
    const img = imageRef.current;
    if (!img) return;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncStageMetrics()) : null;
    observer?.observe(img);
    window.addEventListener('resize', syncStageMetrics);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncStageMetrics);
    };
  }, [syncStageMetrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stageSize.width <= 0 || stageSize.height <= 0) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.round(stageSize.width * dpr));
    canvas.height = Math.max(1, Math.round(stageSize.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, stageSize.width, stageSize.height);

    const allItems = draftElement ? [...elements, draftElement] : elements;
    let markerIdx = 0;

    allItems.forEach((item) => {
      if (item.type === 'marker') {
        markerIdx += 1;
        if (typeof item.endX === 'number' && typeof item.endY === 'number') {
          const x = Math.min(item.x, item.endX), y = Math.min(item.y, item.endY);
          const w = Math.abs(item.endX - item.x), h = Math.abs(item.endY - item.y);
          ctx.save();
          ctx.fillStyle = 'rgba(0, 158, 250, 0.14)';
          ctx.strokeStyle = MARKER_COLOR;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          ctx.restore();
          drawMarkerPin(ctx, x + w, y + h, markerIdx, 1);
        } else {
          drawMarkerPin(ctx, item.x, item.y, markerIdx, 1);
        }
        return;
      }
      drawVisualElement(ctx, item, 1, 1);
    });
  }, [draftElement, elements, stageSize.height, stageSize.width]);

  const getLocalPoint = (event: React.PointerEvent<HTMLCanvasElement>): SmartEditPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, Math.max(1, rect.width)),
      y: clamp(event.clientY - rect.top, 0, Math.max(1, rect.height)),
    };
  };

  const hitTestTextElement = (pt: SmartEditPoint) => {
    for (let i = elements.length - 1; i >= 0; i -= 1) {
      const el = elements[i];
      if (el.type !== 'text') continue;
      const lines = el.text.split('\n');
      const maxChars = Math.max(...lines.map((l) => l.length), 1);
      const boxW = Math.max(36, maxChars * el.fontSize * 0.95);
      const boxH = Math.max(24, lines.length * el.fontSize * 1.25);
      if (pt.x >= el.x - 6 && pt.x <= el.x + boxW + 6 && pt.y >= el.y - 6 && pt.y <= el.y + boxH + 6) return el;
    }
    return null;
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pt = getLocalPoint(event);

    if (textDraft) { commitTextDraft(textDraft); return; }

    const hitText = hitTestTextElement(pt);
    if (hitText && tool === 'text') {
      pointerInteractionRef.current = {
        mode: 'drag-text',
        id: hitText.id,
        offsetX: pt.x - hitText.x,
        offsetY: pt.y - hitText.y,
        moved: false,
        snapshot: elements,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'text') {
      setTextDraft({
        id: `smart-text-${Date.now()}`,
        x: clamp(pt.x, 12, Math.max(12, stageSize.width - 140)),
        y: clamp(pt.y, 12, Math.max(12, stageSize.height - 48)),
        value: '',
        color,
        fontSize: 22,
      });
      window.setTimeout(() => textInputRef.current?.focus(), 0);
      return;
    }

    if (tool === 'mark') {
      if (markers.length >= MAX_MARKERS) return;
      const id = `smart-mark-${Date.now()}`;
      pointerInteractionRef.current = { mode: 'mark', id, startX: pt.x, startY: pt.y };
      setDraftElement({ id, type: 'marker', x: pt.x, y: pt.y });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'brush') {
      const id = `smart-brush-${Date.now()}`;
      pointerInteractionRef.current = { mode: 'brush', id, color, lineWidth: 4.5, points: [pt] };
      setDraftElement({ id, type: 'brush', color, lineWidth: 4.5, points: [pt] });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'arrow' || tool === 'circle') {
      const id = `smart-${tool}-${Date.now()}`;
      pointerInteractionRef.current = { mode: tool, id, color, lineWidth: 4, startX: pt.x, startY: pt.y };
      setDraftElement({ id, type: tool, color, lineWidth: 4, startX: pt.x, startY: pt.y, endX: pt.x, endY: pt.y });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = pointerInteractionRef.current;
    if (!active) return;
    event.preventDefault();
    const pt = getLocalPoint(event);

    if (active.mode === 'drag-text') {
      active.moved = true;
      setHistory((prev) => ({
        ...prev,
        present: prev.present.map((item) =>
          item.id === active.id && item.type === 'text'
            ? {
                ...item,
                x: clamp(pt.x - active.offsetX, 8, Math.max(8, stageSize.width - 60)),
                y: clamp(pt.y - active.offsetY, 8, Math.max(8, stageSize.height - 32)),
              }
            : item
        ),
      }));
      return;
    }

    if (active.mode === 'mark') {
      const dist = Math.hypot(pt.x - active.startX, pt.y - active.startY);
      setDraftElement(
        dist < 6
          ? { id: active.id, type: 'marker', x: active.startX, y: active.startY }
          : { id: active.id, type: 'marker', x: active.startX, y: active.startY, endX: pt.x, endY: pt.y }
      );
      return;
    }

    if (active.mode === 'brush') {
      const last = active.points[active.points.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 1.5) {
        active.points = [...active.points, pt];
        setDraftElement({ id: active.id, type: 'brush', color: active.color, lineWidth: active.lineWidth, points: active.points });
      }
      return;
    }

    if (active.mode === 'arrow' || active.mode === 'circle') {
      setDraftElement({
        id: active.id,
        type: active.mode,
        color: active.color,
        lineWidth: active.lineWidth,
        startX: active.startX,
        startY: active.startY,
        endX: pt.x,
        endY: pt.y,
      });
    }
  };

  const finishPointerInteraction = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    const active = pointerInteractionRef.current;
    if (!active) return;
    pointerInteractionRef.current = null;
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (active.mode === 'drag-text') {
      if (active.moved) {
        setHistory((prev) => ({ past: [...prev.past, active.snapshot], present: prev.present, future: [] }));
      }
      return;
    }

    if (!draftElement) return;
    const completed = draftElement;
    setDraftElement(null);
    if ((completed.type === 'arrow' || completed.type === 'circle') && Math.hypot(completed.endX - completed.startX, completed.endY - completed.startY) < 4) {
      return;
    }
    pushElements([...elements, completed]);
    if (completed.type === 'marker') {
      window.setTimeout(() => promptInputRef.current?.focus(), 0);
    }
  };

  const handleUndo = () => {
    if (textDraft) { setTextDraft(null); return; }
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      return {
        past: prev.past.slice(0, -1),
        present: prev.past[prev.past.length - 1],
        future: [prev.present, ...prev.future],
      };
    });
  };

  const handleRedo = () => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const [next, ...rest] = prev.future;
      return { past: [...prev.past, prev.present], present: next, future: rest };
    });
  };

  const removeMarkerById = (markerId: string) => {
    pushElements(elements.filter((item) => item.id !== markerId));
  };

  const renderCompositeAnnotatedDataUrl = async (allElements: SmartEditElement[]): Promise<string | null> => {
    const visualElements = allElements.filter((item) => item.type !== 'marker');
    if (visualElements.length === 0 || !node.imageUrl) return null;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('智能改图底图加载失败'));
      img.src = proxyMediaUrl(node.imageUrl || '');
    });

    const outW = img.naturalWidth || naturalSize.width || 1024;
    const outH = img.naturalHeight || naturalSize.height || 1024;
    const scaleX = stageSize.width > 0 ? outW / stageSize.width : 1;
    const scaleY = stageSize.height > 0 ? outH / stageSize.height : 1;

    const offscreen = document.createElement('canvas');
    offscreen.width = outW;
    offscreen.height = outH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, outW, outH);
    visualElements.forEach((el) => drawVisualElement(ctx, el, scaleX, scaleY));
    return offscreen.toDataURL('image/png');
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let finalElements = elements;
      if (textDraft && textDraft.value.trim()) {
        finalElements = [
          ...elements,
          { id: textDraft.id, type: 'text', color: textDraft.color, fontSize: textDraft.fontSize, x: textDraft.x, y: textDraft.y, text: textDraft.value.trim() },
        ];
        setTextDraft(null);
      }

      const activeMarkers = finalElements.filter(
        (item): item is Extract<SmartEditElement, { type: 'marker' }> => item.type === 'marker'
      );
      const visualElements = finalElements.filter((item) => item.type !== 'marker');
      const w = Math.max(1, stageSize.width || naturalSize.width || 1000);
      const h = Math.max(1, stageSize.height || naturalSize.height || 1000);
      const markerTags = activeMarkers.map((m, idx) => `标记${idx + 1} ${formatMarkerCoordinateTag(m, w, h)}`);

      const combinedPrompt = [
        markerTags.join(' '),
        prompt.trim() || (visualElements.length > 0 ? '按照画面中的标注修改图片' : ''),
      ].filter(Boolean).join(' ').trim();

      const store = useCanvasStore.getState();
      const baseGap = 120;
      let upstreamSourceId = node.id;
      let downstreamX = node.x + node.width + baseGap;
      const downstreamY = node.y;

      if (visualElements.length > 0) {
        try {
          const annotatedDataUrl = await renderCompositeAnnotatedDataUrl(finalElements);
          if (annotatedDataUrl) {
            const annotatedId = crypto.randomUUID();
            const annotatedW = node.width || 280;
            const annotatedH = node.height || 280;
            store.addNode(projectId, {
              id: annotatedId, type: 'image', title: '智能改图标注', imageUrl: annotatedDataUrl,
              resultWidth: naturalSize.width, resultHeight: naturalSize.height,
              x: downstreamX, y: downstreamY, width: annotatedW, height: annotatedH, referenceNodeIds: [node.id],
            });
            upstreamSourceId = annotatedId;
            downstreamX += annotatedW + baseGap;
          }
        } catch {
          // 跨域或导出失败时回退为直接连接原图节点
        }
      }

      const initial = useAppStore.getState();
      const aspect = initial.quickAspectId || '1:1';
      const geom = drawingGeometry({ type: 'drawing', generationKind: 'image', drawing: { aspect } } as CanvasNode);
      const createdId = crypto.randomUUID();
      store.addNode(projectId, {
        id: createdId, type: 'drawing', title: '图片生成', content: combinedPrompt, generationKind: 'image',
        x: downstreamX, y: downstreamY, width: geom.width, height: geom.height, referenceNodeIds: [upstreamSourceId],
        drawing: { model: selectedModel?.id || initial.quickModel, quality: initial.quickQuality || 'medium', aspect, count: 1, references: [] },
      });
      updateNode(projectId, node.id, { activeUploadTool: null });
      setSelectedNodeId(createdId);
      setEditingDrawingId(createdId);
    } finally {
      setSubmitting(false);
    }
  };

  if (typeof document === 'undefined' || !node.imageUrl) return null;

  return createPortal(
    <div
      data-smart-edit-editor="true"
      className="fixed inset-0 z-[10060] flex flex-col items-center justify-between bg-black px-8 pb-7 pt-8 text-white select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="关闭智能改图"
        onClick={handleClose}
        className="absolute right-5 top-5 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/80 transition hover:bg-white/14 hover:text-white cursor-pointer"
      >
        <X size={18} />
      </button>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <div
          data-smart-edit-stage="true"
          className="relative max-h-[72vh] max-w-[min(86vw,920px)] overflow-hidden rounded-[28px] bg-zinc-900 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
        >
          <img
            ref={imageRef}
            src={proxyMediaUrl(node.imageUrl)}
            alt={node.title || '智能改图'}
            crossOrigin="anonymous"
            draggable={false}
            onLoad={syncStageMetrics}
            className="block max-h-[72vh] max-w-[min(86vw,920px)] w-auto h-auto object-contain select-none"
          />

          <canvas
            ref={canvasRef}
            aria-label="智能改图画布"
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={finishPointerInteraction}
            onPointerCancel={finishPointerInteraction}
            className={`absolute inset-0 h-full w-full touch-none ${tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
          />

          {textDraft && (
            <input
              ref={textInputRef}
              type="text"
              data-smart-edit-text-input="true"
              value={textDraft.value}
              placeholder="输入文字"
              onChange={(e) => setTextDraft((prev) => (prev ? { ...prev, value: e.target.value } : null))}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); commitTextDraft(textDraft); }
                else if (e.key === 'Escape') { e.preventDefault(); setTextDraft(null); }
              }}
              onBlur={() => commitTextDraft(textDraft)}
              style={{ left: `${textDraft.x}px`, top: `${textDraft.y}px`, color: textDraft.color }}
              className="absolute z-20 min-w-[140px] rounded-xl bg-black/55 px-3 py-2 text-lg font-bold outline-none ring-1 ring-white/30 placeholder:text-white/45"
            />
          )}
        </div>

        <div className="relative flex flex-col items-center">
          <div
            data-smart-edit-toolbar="true"
            className="flex items-center gap-1 rounded-full border border-white/8 bg-[#202022] px-2 py-1.5 text-white shadow-[0_14px_34px_rgba(0,0,0,0.45)]"
          >
            {SMART_EDIT_TOOLS.map((item) => {
              const Icon = item.icon;
              const active = tool === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.label}
                  onClick={() => {
                    if (textDraft) commitTextDraft(textDraft);
                    setTool(item.id);
                  }}
                  className={`flex h-9 items-center justify-center rounded-full text-[13px] font-medium transition cursor-pointer ${
                    Icon ? 'w-9' : 'min-w-[52px] px-3'
                  } ${active ? 'bg-white/14 text-white' : 'text-white/72 hover:bg-white/8 hover:text-white'}`}
                >
                  {Icon ? <Icon size={16} /> : item.label}
                </button>
              );
            })}

            <div className="mx-1 h-5 w-px bg-white/10" />

            <button
              type="button"
              aria-label="撤销"
              disabled={!canUndo}
              onClick={handleUndo}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/72 transition hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
            >
              <Undo2 size={16} />
            </button>

            <button
              type="button"
              aria-label="重做"
              disabled={!canRedo}
              onClick={handleRedo}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/72 transition hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
            >
              <Redo2 size={16} />
            </button>
          </div>

          {tool !== 'mark' && (
            <div
              data-smart-edit-palette="true"
              className="absolute left-1/2 top-full z-10 mt-2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/8 bg-[#202022] px-2.5 py-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.45)]"
            >
              {SMART_EDIT_COLORS.map((swatch) => {
                const selected = color === swatch;
                return (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={`选择颜色 ${swatch}`}
                    onClick={() => {
                      setColor(swatch);
                      setTextDraft((prev) => (prev ? { ...prev, color: swatch } : null));
                    }}
                    className={`h-6 w-6 rounded-full border transition cursor-pointer ${
                      selected ? 'border-white ring-2 ring-white/30' : 'border-white/20 hover:border-white/50'
                    }`}
                    style={{ backgroundColor: swatch }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div data-smart-edit-composer="true" className="w-[min(760px,calc(100vw-48px))] pt-4">
        {tool === 'mark' && (
          <div className="mb-1.5 px-3 text-right text-[11px] leading-snug text-white/45">
            只有即梦模型才认可这个逻辑坐标
          </div>
        )}

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(34,34,34,0.82)] px-3 py-1.5 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.55)]">
          <div
            data-smart-edit-prompt="true"
            onClick={() => promptInputRef.current?.focus()}
            className="flex min-h-[36px] min-w-0 flex-1 flex-wrap items-center gap-1.5 px-2 py-0.5 cursor-text"
          >
            {markers.map((marker, idx) => (
              <button
                key={marker.id}
                type="button"
                title="点击移除该标记"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMarkerById(marker.id);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#009EFA] px-2 py-1 text-xs font-medium text-white transition hover:brightness-110 cursor-pointer"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#009EFA]">
                  {idx + 1}
                </span>
                <span>标记{idx + 1}</span>
              </button>
            ))}

            <input
              ref={promptInputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Backspace' && prompt.length === 0 && markers.length > 0) {
                  removeMarkerById(markers[markers.length - 1].id);
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={markers.length === 0 ? '描述你想改的内容，可用标记指出位置' : ''}
              className="min-w-[180px] flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/38"
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <div ref={modelMenuRef} className="relative">
              <button
                type="button"
                aria-label="选择改图模型"
                onClick={() => setModelMenuOpen((prev) => !prev)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs text-white/78 transition hover:bg-white/8 hover:text-white cursor-pointer"
              >
                <Sparkles size={13} className="text-white/65" />
                <span className="max-w-[140px] truncate font-medium">
                  {selectedModel?.name || 'GPT Image 2'}
                </span>
                <ChevronDown size={13} className="text-white/55" />
              </button>

              {modelMenuOpen && (
                <div className="absolute bottom-full right-0 z-30 mb-2 min-w-[196px] overflow-hidden rounded-2xl border border-white/10 bg-[#1f1f22]/98 p-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.65)] backdrop-blur-xl">
                  {configuredModels.map((item) => {
                    const isSelected = item.id === selectedModel?.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedModelId(item.id);
                          setModelMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition cursor-pointer ${
                          isSelected ? 'bg-white/12 font-semibold text-white' : 'text-white/75 hover:bg-white/6 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{item.name}</span>
                        {isSelected && <Check size={13} className="shrink-0 text-white" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              aria-label="提交智能改图"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
