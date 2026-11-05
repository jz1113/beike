import './canvasLoadingSurface.css';

export function CanvasLoadingSurface() {
  return <div className="canvas-loading-surface" role="status" aria-busy="true">
    <span className="canvas-loading-label">正在载入画布</span>
    <span className="canvas-loading-indicator" aria-hidden="true" />
  </div>;
}
