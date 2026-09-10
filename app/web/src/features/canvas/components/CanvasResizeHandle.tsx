import { useRef } from 'react';

export function resizeMedia(width: number, height: number, dx: number, dy: number, zoom: number) {
  const scale = 1 + (dx * width + dy * height) / (Math.max(zoom, 0.01) * (width * width + height * height));
  const bounded = Math.max(80 / Math.min(width, height), Math.min(2400 / Math.max(width, height), scale));
  return {width: width * bounded, height: height * bounded};
}

export function CanvasResizeHandle({width, height, zoom, onResize}: {
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
