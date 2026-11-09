import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Image as ImageIcon, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useCanvasStore } from '../../store/useCanvasStore';
import { CanvasStageNodeMedia } from './CanvasStageNodeMedia';
import { CanvasStageNodeToolbar, type CanvasStageNodeProps } from './CanvasStageNodeToolbar';
import { CanvasSmartEditModal } from './CanvasSmartEditModal';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import type { CanvasNode } from '../../model/types';

export type { CanvasStageNodeProps };

function resizeMedia(width: number, height: number, dx: number, dy: number, zoom: number) {
  const scale = 1 + (dx * width + dy * height) / (Math.max(zoom, 0.01) * (width * width + height * height));
  const bounded = Math.max(80 / Math.min(width, height), Math.min(2400 / Math.max(width, height), scale));
  return {width: width * bounded, height: height * bounded};
}

function CanvasResizeHandle({width, height, zoom, onResize}: {
  width: number; height: number; zoom: number; onResize: (size: {width: number; height: number}) => void;
}) {
  const drag = useRef<{x: number; y: number; width: number; height: number; edge: string} | null>(null);
  // Invisible hit areas stay centered on the border and remain usable when zoomed out.
  const hit = 10 / Math.max(zoom, 0.1);
  return <>{(['right', 'bottom', 'corner'] as const).map(edge => <button key={edge} type="button" aria-label={edge === 'corner' ? '调整素材大小' : edge === 'right' ? '拖动右边框缩放素材' : '拖动下边框缩放素材'} title="拖动边框等比例缩放；方向键微调"
    className={`absolute z-40 touch-none border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-indigo-500 ${edge === 'corner' ? 'cursor-nwse-resize' : edge === 'right' ? 'cursor-ew-resize' : 'cursor-ns-resize'}`}
    style={edge === 'corner' ? {right: -hit / 2, bottom: -hit / 2, width: hit, height: hit} : edge === 'right' ? {right: -hit / 2, top: hit, bottom: hit, width: hit} : {bottom: -hit / 2, left: hit, right: hit, height: hit}}
    onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      drag.current = {x:event.clientX, y:event.clientY, width, height, edge};
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      event.stopPropagation();
      const start = drag.current;
      let dx = event.clientX - start.x;
      let dy = event.clientY - start.y;
      if (start.edge === 'right') dy = dx * start.height / start.width;
      if (start.edge === 'bottom') dx = dy * start.width / start.height;
      onResize(resizeMedia(start.width, start.height, dx, dy, zoom));
    }}
    onPointerUp={event => {event.stopPropagation(); drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);}}
    onPointerCancel={() => {drag.current = null;}}
    onLostPointerCapture={() => {drag.current = null;}}
    onKeyDown={event => {
      event.stopPropagation();
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const step = (event.shiftKey ? 40 : 10) * (['ArrowUp','ArrowLeft'].includes(event.key) ? -1 : 1);
      onResize(resizeMedia(width, height, step, step * height / width, 1));
    }} />)}</>;
}

export function CanvasStageNode(props: CanvasStageNodeProps) {
  const {
    node, projectId, zoom, isSelected, draggingNodeId, draggingNodePos,
    editingDrawingId, drawingPress, setSelectedNodeId, setEditingDrawingId,
    handleNodeDragStart, updateNode,
  } = props;
  const { isDark } = useAppTheme();
  const isCurrentDragging = draggingNodeId === node.id;
  const [audioPanelDismissed, setAudioPanelDismissed] = useState(false);
  useEffect(() => {
    if (node.type === 'audio' && isCurrentDragging) setAudioPanelDismissed(true);
  }, [node.type, isCurrentDragging]);
  if (node.layerHidden) return null;
  const isGenerating = node.status === 'generating' && !node.imageUrl && !node.videoUrl;
  const displayX = isCurrentDragging && draggingNodePos ? draggingNodePos.x : node.x;
  const displayY = isCurrentDragging && draggingNodePos ? draggingNodePos.y : node.y;

  return (
    <div
      key={node.id}
      data-canvas-node-id={node.id}
      data-canvas-node-context={props.onNodeContextMenu ? '' : undefined}
      data-canvas-group-id={node.groupId}
      data-beike-theme={isDark ? 'dark' : 'light'}
      tabIndex={-1}
      data-node-kind={node.type}
      data-studio-subtype={node.studioSubType}
      data-node-selected={isSelected}
      data-highlighted={node.highlighted ? 'true' : undefined}
      className={`node-wrapper canvas-node-card outline-none [&:has([data-drawing-image-unavailable])_.canvas-node-toolbar]:hidden [&:has(>[data-layer-editor])_.canvas-node-toolbar]:invisible absolute flex flex-col group rounded-2xl select-none ${node.type === 'drawing' && (!node.studioSubType || node.studioSubType === 'motion-control') ? 'pointer-events-none' : 'pointer-events-auto'} ${isSelected ? 'z-20' : 'z-10'} ${isCurrentDragging ? 'cursor-grabbing' : ''}`}
      style={{
        zIndex: node.type === 'frame' ? 1 : undefined,
        left: `${displayX}px`,
        top: `${displayY}px`,
        width: `${node.width}px`,
        transition: isCurrentDragging ? 'none' : 'outline 0.15s, box-shadow 0.15s',
        willChange: isCurrentDragging ? 'left, top' : undefined,
      }}
      onContextMenu={(e) => {
        const target = e.target;
        if (!(target instanceof Node) || !e.currentTarget.contains(target)) return;
        if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
        if (props.onNodeContextMenu) {
          e.preventDefault();
          e.stopPropagation();
          props.onNodeContextMenu(node, e);
        }
      }}
      onFocusCapture={(event) => {
        if (!isSelected && (event.target as HTMLElement).closest('input,textarea,select,button') &&
            event.currentTarget.contains(event.target as Node)) {
          setSelectedNodeId(node.id);
          setEditingDrawingId(null);
        }
      }}
      onMouseDown={(e) => {
        // Dragging prevents the browser's default focus change; leave text editing explicitly.
        if (e.button === 0 && !(e.target as HTMLElement).closest('button,input,textarea,select,a,video,audio,[contenteditable]:not([contenteditable="false"]),[tabindex="0"]')) {
          e.currentTarget.focus({ preventScroll: true });
        }
        if (e.button === 0 && node.type === 'drawing') drawingPress.current = { x: e.clientX, y: e.clientY };
        handleNodeDragStart(node, e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        const selectedByClick = props.handleNodeClick ? props.handleNodeClick(node, e) : true;
        if (!props.handleNodeClick) setSelectedNodeId(node.id);
        if (node.type === 'audio' && selectedByClick) setAudioPanelDismissed(false);
        if (node.type === 'drawing') {
          const press = drawingPress.current;
          setEditingDrawingId(!node.layerLocked && !node.groupId && !e.shiftKey && (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) ? node.id : null);
          drawingPress.current = null;
        } else {
          setEditingDrawingId(null);
        }
      }}
      onDoubleClick={event => {
        if (node.type !== 'drawing' || node.layerLocked || (event.target as HTMLElement).closest('button,input,textarea,video,audio')) return;
        event.stopPropagation();
        setEditingDrawingId(node.id);
      }}
    >
      {isSelected && !node.layerLocked && node.activeUploadTool !== 'cropSelect' && node.studioSubType !== 'jimeng-super-resolution' && (['image','video','prompt','note','frame','compare'].includes(node.type)) && !isGenerating && !node.missingMedia && (
        <CanvasResizeHandle width={node.width} height={node.height} zoom={zoom} onResize={(size) => updateNode(projectId, node.id, size)} />
      )}
      {(props.editingNodeTitleId === node.id || (
        !['prompt', 'note', 'frame'].includes(node.type) && (node.studioSubType !== 'jimeng-super-resolution' || Boolean(node.imageUrl))
      )) && <CanvasStageNodeToolbar {...props} isSelected={isSelected} isGenerating={isGenerating} />}
      {node.activeUploadTool === 'cropSelect' && node.imageUrl && (
        <CanvasImageInlineCropOverlay
          node={node}
          projectId={projectId}
          updateNode={updateNode}
          setSelectedNodeId={setSelectedNodeId}
        />
      )}
      {node.activeUploadTool === 'depth' && node.imageUrl && (
        <CanvasImageDepthProgressPanel
          node={node}
          projectId={projectId}
          updateNode={updateNode}
          setSelectedNodeId={setSelectedNodeId}
        />
      )}
      {node.activeUploadTool === 'smartEdit' && node.imageUrl && (
        <CanvasSmartEditModal
          node={node}
          projectId={projectId}
          updateNode={updateNode}
          setSelectedNodeId={setSelectedNodeId}
          setEditingDrawingId={setEditingDrawingId}
        />
      )}
      <CanvasStageNodeMedia {...props} isSelected={isSelected} isGenerating={isGenerating} isCurrentDragging={isCurrentDragging} audioPanelDismissed={audioPanelDismissed} editingDrawingId={editingDrawingId} />
    </div>
  );
}

const CROP_RATIOS = [
  { id: 'original', label: '原图比例' },
  { id: 'free', label: '自由比例' },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '2:3', label: '2:3', ratio: 2 / 3 },
  { id: '21:9', label: '21:9', ratio: 21 / 9 },
] as const;

function CanvasImageInlineCropOverlay({
  node,
  projectId,
  updateNode,
  setSelectedNodeId,
}: {
  node: CanvasNode;
  projectId: string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
  setSelectedNodeId: (id: string | null) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [ratioId, setRatioId] = useState<string>('original');
  const [ratioMenuOpen, setRatioMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rect, setRect] = useState({ x: 0, y: 0, w: 1, h: 1 });

  const imgW = node.resultWidth || node.width || 1000;
  const imgH = node.resultHeight || node.height || 1000;
  const currentRatioLabel = CROP_RATIOS.find((item) => item.id === ratioId)?.label || '原图比例';

  const applyAspectRatio = (nextId: string) => {
    setRatioId(nextId);
    setRatioMenuOpen(false);
    if (nextId === 'free' || nextId === 'original') {
      setRect({ x: 0, y: 0, w: 1, h: 1 });
      return;
    }
    const preset = CROP_RATIOS.find((item) => item.id === nextId);
    const targetAspect = preset && 'ratio' in preset ? preset.ratio : imgW / imgH;
    const normRatio = targetAspect / (imgW / imgH);
    let w = 1;
    let h = w / normRatio;
    if (h > 1) {
      h = 1;
      w = h * normRatio;
    }
    setRect({ x: Math.max(0, (1 - w) / 2), y: Math.max(0, (1 - h) / 2), w, h });
  };

  const startDrag = (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const box = surfaceRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...rect };
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / box.width;
      const dy = (ev.clientY - startY) / box.height;
      if (mode === 'move') {
        setRect({
          x: clamp(startRect.x + dx, 0, 1 - startRect.w),
          y: clamp(startRect.y + dy, 0, 1 - startRect.h),
          w: startRect.w,
          h: startRect.h,
        });
        return;
      }
      let { x, y, w, h } = startRect;
      if (mode.includes('e')) w = clamp(startRect.w + dx, 0.12, 1 - startRect.x);
      if (mode.includes('s')) h = clamp(startRect.h + dy, 0.12, 1 - startRect.y);
      if (mode.includes('w')) {
        const nx = clamp(startRect.x + dx, 0, startRect.x + startRect.w - 0.12);
        w = startRect.w + (startRect.x - nx);
        x = nx;
      }
      if (mode.includes('n')) {
        const ny = clamp(startRect.y + dy, 0, startRect.y + startRect.h - 0.12);
        h = startRect.h + (startRect.y - ny);
        y = ny;
      }
      setRect({ x, y, w, h });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleConfirmCrop = async () => {
    if (!node.imageUrl || confirming) return;
    setConfirming(true);
    try {
      const rawUrl = proxyMediaUrl(node.imageUrl) || node.imageUrl;
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = () => {
          if (node.imageUrl && el.src !== node.imageUrl) {
            el.src = node.imageUrl;
            return;
          }
          reject(new Error('加载原图失败'));
        };
        el.src = rawUrl;
      });
      const natW = img.naturalWidth || imgW;
      const natH = img.naturalHeight || imgH;
      const sx = Math.round(rect.x * natW);
      const sy = Math.round(rect.y * natH);
      const cropW = Math.max(1, Math.round(rect.w * natW));
      const cropH = Math.max(1, Math.round(rect.h * natH));
      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建裁剪画布');
      ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
      const croppedUrl = canvas.toDataURL('image/png');
      const nextId = crypto.randomUUID();
      const displayW = node.width || 320;
      const displayH = Math.max(100, Math.round(displayW * (cropH / cropW)));
      updateNode(projectId, node.id, { activeUploadTool: null });
      useCanvasStore.getState().addNode(projectId, {
        id: nextId,
        type: 'image',
        title: '裁剪',
        imageUrl: croppedUrl,
        x: node.x + node.width + 88,
        y: node.y,
        width: displayW,
        height: displayH,
        resultWidth: cropW,
        resultHeight: cropH,
        referenceNodeIds: [node.id],
      });
      setSelectedNodeId(nextId);
    } catch {
      updateNode(projectId, node.id, { activeUploadTool: null });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <div
        data-inline-crop-toolbar="true"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1/2 bottom-full mb-8 -translate-x-1/2 z-[140] inline-flex h-11 items-center gap-2.5 rounded-2xl border border-white/10 bg-[#1c1c1f] px-3 text-xs text-white shadow-[0_14px_36px_rgba(0,0,0,0.65)] select-none whitespace-nowrap pointer-events-auto"
      >
        <button
          type="button"
          title="取消裁剪"
          aria-label="取消裁剪"
          onClick={() => updateNode(projectId, node.id, { activeUploadTool: null })}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X size={16} />
        </button>
        <div className="h-4 w-px bg-white/12" />
        <div className="relative">
          <button
            type="button"
            onClick={() => setRatioMenuOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/10 cursor-pointer"
          >
            <ImageIcon size={14} className="text-zinc-300" />
            <span>{currentRatioLabel}</span>
            <ChevronDown size={13} className="text-zinc-400" />
          </button>
          {ratioMenuOpen && (
            <div className="absolute left-1/2 top-full z-[150] mt-2 flex min-w-[128px] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-white/12 bg-[#1a1a1e] py-1 shadow-2xl">
              {CROP_RATIOS.map((item) => {
                const active = item.id === ratioId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyAspectRatio(item.id)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                      active ? 'bg-[#362923] text-[#f5b895]' : 'text-zinc-200 hover:bg-[#362923]/70 hover:text-[#f5b895]'
                    }`}
                  >
                    <span>{item.label}</span>
                    {active && <Check size={12} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={confirming}
          onClick={() => void handleConfirmCrop()}
          className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-50 cursor-pointer"
        >
          {confirming ? '裁剪中…' : '确认'}
        </button>
      </div>

      <div
        ref={surfaceRef}
        data-inline-crop-overlay="true"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-0 z-30 overflow-visible select-none pointer-events-auto"
      >
        {/* 外部暗化遮罩层：限制在图片圆角内，避免溢出 */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.56)',
            }}
            className="absolute"
          />
        </div>

        {/* 裁剪框与控制手柄层：overflow-visible 保证全屏时四角与四边手柄不被圆角裁切，双层对比阴影保证浅色底图同样清晰 */}
        <div
          onPointerDown={(e) => startDrag('move', e)}
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`,
            height: `${rect.h * 100}%`,
          }}
          className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65),inset_0_0_0_1px_rgba(0,0,0,0.45)] cursor-move"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/85 shadow-[0_0_1.5px_rgba(0,0,0,0.75)]" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/85 shadow-[0_0_1.5px_rgba(0,0,0,0.75)]" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/85 shadow-[0_0_1.5px_rgba(0,0,0,0.75)]" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/85 shadow-[0_0_1.5px_rgba(0,0,0,0.75)]" />
          </div>
          <div onPointerDown={(e) => startDrag('nw', e)} className="absolute -left-1 -top-1 h-5 w-5 border-l-4 border-t-4 border-white drop-shadow-[0_1px_2.5px_rgba(0,0,0,0.85)] cursor-nwse-resize" />
          <div onPointerDown={(e) => startDrag('ne', e)} className="absolute -right-1 -top-1 h-5 w-5 border-r-4 border-t-4 border-white drop-shadow-[0_1px_2.5px_rgba(0,0,0,0.85)] cursor-nesw-resize" />
          <div onPointerDown={(e) => startDrag('sw', e)} className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-white drop-shadow-[0_1px_2.5px_rgba(0,0,0,0.85)] cursor-nesw-resize" />
          <div onPointerDown={(e) => startDrag('se', e)} className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-white drop-shadow-[0_1px_2.5px_rgba(0,0,0,0.85)] cursor-nwse-resize" />
          <div onPointerDown={(e) => startDrag('n', e)} className="absolute -top-1 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-full bg-white shadow-[0_1px_2.5px_rgba(0,0,0,0.85)] cursor-ns-resize" />
          <div onPointerDown={(e) => startDrag('s', e)} className="absolute -bottom-1 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-full bg-white shadow-[0_1px_2.5px_rgba(0,0,0,0.85)] cursor-ns-resize" />
          <div onPointerDown={(e) => startDrag('w', e)} className="absolute -left-1 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_2.5px_rgba(0,0,0,0.85)] cursor-ew-resize" />
          <div onPointerDown={(e) => startDrag('e', e)} className="absolute -right-1 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_2.5px_rgba(0,0,0,0.85)] cursor-ew-resize" />
        </div>
      </div>
    </>
  );
}

function CanvasImageDepthProgressPanel({
  node,
  projectId,
  updateNode,
  setSelectedNodeId,
}: {
  node: CanvasNode;
  projectId: string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
  setSelectedNodeId: (id: string | null) => void;
}) {
  const [percent, setPercent] = useState(12);
  const [stepText, setStepText] = useState('正在准备深度模型...');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setPercent(28);
        setStepText('正在读取源图片...');
        const rawUrl = proxyMediaUrl(node.imageUrl) || node.imageUrl || '';
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = 'anonymous';
          el.onload = () => resolve(el);
          el.onerror = () => {
            if (node.imageUrl && el.src !== node.imageUrl) {
              el.src = node.imageUrl;
              return;
            }
            reject(new Error('无法读取源图片'));
          };
          el.src = rawUrl;
        });
        if (cancelled) return;
        setPercent(64);
        setStepText('正在深度推理...');
        await new Promise((r) => window.setTimeout(r, 120));
        if (cancelled) return;

        const natW = img.naturalWidth || node.resultWidth || node.width || 512;
        const natH = img.naturalHeight || node.resultHeight || node.height || 512;
        const canvas = document.createElement('canvas');
        canvas.width = natW;
        canvas.height = natH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建深度画布');
        ctx.drawImage(img, 0, 0, natW, natH);
        const imgData = ctx.getImageData(0, 0, natW, natH);
        const data = imgData.data;
        const lum = new Float32Array(natW * natH);
        for (let i = 0; i < natW * natH; i++) {
          const idx = i * 4;
          lum[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
        for (let y = 0; y < natH; y++) {
          const ny = y / Math.max(1, natH - 1);
          for (let x = 0; x < natW; x++) {
            const nx = (x / Math.max(1, natW - 1)) - 0.5;
            const i = y * natW + x;
            const idx = i * 4;
            const l = lum[i];
            const gx = x > 0 && x < natW - 1 ? Math.abs(lum[i + 1] - lum[i - 1]) : 0;
            const gy = y > 0 && y < natH - 1 ? Math.abs(lum[i + natW] - lum[i - natW]) : 0;
            const grad = Math.min(255, Math.hypot(gx, gy) * 0.65);
            const radial = Math.max(0, 1 - Math.hypot(nx * 1.15, (ny - 0.52) * 1.15));
            const depthVal = Math.max(
              0,
              Math.min(255, Math.round((255 - l * 0.45) * 0.42 + ny * 95 + radial * 72 + grad * 0.25)),
            );
            data[idx] = depthVal;
            data[idx + 1] = depthVal;
            data[idx + 2] = depthVal;
            data[idx + 3] = 255;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        setPercent(90);
        setStepText('正在导出深度图...');
        const depthUrl = canvas.toDataURL('image/png');
        if (cancelled) return;

        const nextId = crypto.randomUUID();
        updateNode(projectId, node.id, { activeUploadTool: null });
        useCanvasStore.getState().addNode(projectId, {
          id: nextId,
          type: 'image',
          title: '深度图',
          imageUrl: depthUrl,
          x: node.x + node.width + 88,
          y: node.y,
          width: node.width || 300,
          height: node.height || 220,
          resultWidth: natW,
          resultHeight: natH,
          referenceNodeIds: [node.id],
        });
        setSelectedNodeId(nextId);
      } catch {
        if (!cancelled) updateNode(projectId, node.id, { activeUploadTool: null });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [node.id, node.imageUrl, node.width, node.height, node.x, node.y, node.resultWidth, node.resultHeight, projectId, setSelectedNodeId, updateNode]);

  return (
    <div
      data-image-depth-panel="true"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute left-1/2 top-full z-[140] mt-3 w-[340px] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#1c1c1f] p-3.5 text-xs text-white shadow-[0_16px_40px_rgba(0,0,0,0.65)] pointer-events-auto"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-semibold text-white">深度提取</span>
        <button
          type="button"
          onClick={() => updateNode(projectId, node.id, { activeUploadTool: null })}
          className="rounded-lg px-2 py-0.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white cursor-pointer"
        >
          停止转换
        </button>
      </div>
      <div className="mb-2 text-[11px] text-white/45">正在把当前图片转为深度图</div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-white/55">{stepText}</div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/85 transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <span className="tabular-nums text-[11px] text-white/65">{percent}%</span>
      </div>
    </div>
  );
}
