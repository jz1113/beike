import {
  INTERACTIVE_SELECTOR,
  applyDotInertia,
  type GridDot,
} from './DotGrid.utils';

export interface GridMeta {
  cell: number;
  cols: number;
  rows: number;
  startX: number;
  startY: number;
}

export interface PointerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  lastTime: number;
  lastX: number;
  lastY: number;
  lastActiveAt: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function visitNeighborhood(
  meta: GridMeta,
  x: number,
  y: number,
  radius: number,
  dots: GridDot[],
  visit: (dot: GridDot) => void,
) {
  const { cell, cols, rows, startX, startY } = meta;
  if (cols <= 0 || rows <= 0) return;
  const targetCol = Math.round((x - startX) / cell);
  const targetRow = Math.round((y - startY) / cell);
  const radiusCells = Math.ceil(radius / cell) + 1;
  const minCol = Math.max(0, targetCol - radiusCells);
  const maxCol = Math.min(cols - 1, targetCol + radiusCells);
  const minRow = Math.max(0, targetRow - radiusCells);
  const maxRow = Math.min(rows - 1, targetRow + radiusCells);
  for (let row = minRow; row <= maxRow; row++) {
    const rowOffset = row * cols;
    for (let col = minCol; col <= maxCol; col++) {
      const dot = dots[rowOffset + col];
      if (dot) visit(dot);
    }
  }
}

export function buildDotGrid(options: {
  wrap: HTMLDivElement;
  canvas: HTMLCanvasElement;
  dotSize: number;
  gap: number;
  baseColor: string;
  baseRadius: number;
  canvasSize: { width: number; height: number };
  gridMeta: { current: GridMeta };
  dotsRef: { current: GridDot[] };
  activeDots: Set<GridDot>;
  contextRef: { current: CanvasRenderingContext2D | null };
  baseLayerRef: { current: HTMLCanvasElement | null };
  activeTweensCount: { current: number };
  wakeUp: () => void;
}) {
  const { width, height } = options.wrap.getBoundingClientRect();
  if (width <= 0 || height <= 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  options.canvas.width = Math.floor(width * dpr);
  options.canvas.height = Math.floor(height * dpr);
  options.canvas.style.width = `${width}px`;
  options.canvas.style.height = `${height}px`;
  options.canvasSize.width = width;
  options.canvasSize.height = height;
  const ctx = options.canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  options.contextRef.current = ctx;

  const baseLayer = document.createElement('canvas');
  baseLayer.width = options.canvas.width;
  baseLayer.height = options.canvas.height;
  const baseCtx = baseLayer.getContext('2d');
  if (!baseCtx) return;
  baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  options.baseLayerRef.current = baseLayer;

  const cell = options.dotSize + options.gap;
  const cols = Math.floor((width + options.gap) / cell);
  const rows = Math.floor((height + options.gap) / cell);
  const startX = (width - (cell * cols - options.gap)) / 2 + options.dotSize / 2;
  const startY = (height - (cell * rows - options.gap)) / 2 + options.dotSize / 2;
  options.gridMeta.current = { cell, cols, rows, startX, startY };

  const dots: GridDot[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      dots.push({ cx: startX + x * cell, cy: startY + y * cell, col: x, row: y, xOffset: 0, yOffset: 0, _inertiaApplied: false });
    }
  }
  options.dotsRef.current = dots;
  options.activeDots.clear();
  baseCtx.fillStyle = options.baseColor;
  baseCtx.beginPath();
  for (const dot of dots) {
    baseCtx.moveTo(dot.cx + options.baseRadius, dot.cy);
    baseCtx.arc(dot.cx, dot.cy, options.baseRadius, 0, Math.PI * 2);
  }
  baseCtx.fill();
  // Resizing clears the visible canvas; restore the base immediately, even when animation frames are paused.
  ctx.drawImage(baseLayer, 0, 0, baseLayer.width, baseLayer.height, 0, 0, width, height);
  options.activeTweensCount.current = 0;
  options.wakeUp();
}

export function paintDotGridFrame(options: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  canvasSize: { width: number; height: number };
  baseLayer: HTMLCanvasElement | null;
  pointer: PointerState;
  dots: GridDot[];
  activeDots: Set<GridDot>;
  gridMeta: GridMeta;
  proximity: number;
  baseColor: string;
  baseRgb: Rgb;
  activeRgb: Rgb;
  baseRadius: number;
  activeTweensCount: number;
}): boolean {
  const {
    canvasSize, ctx, baseLayer, pointer, dots, activeDots, gridMeta,
    proximity, baseColor, baseRgb, activeRgb, baseRadius, activeTweensCount,
  } = options;
  const proxSq = proximity * proximity;
  ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
  if (baseLayer) {
    ctx.drawImage(baseLayer, 0, 0, baseLayer.width, baseLayer.height, 0, 0, canvasSize.width, canvasSize.height);
  }

  const { x: px, y: py, lastActiveAt } = pointer;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const dot of activeDots) {
    ctx.beginPath();
    ctx.arc(dot.cx, dot.cy, baseRadius + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const drawDynamicDot = (dot: GridDot, distanceSquared?: number) => {
    const dsq = distanceSquared ?? (dot.cx - px) ** 2 + (dot.cy - py) ** 2;
    if (dsq > proxSq && dot.xOffset === 0 && dot.yOffset === 0) return;
    let fill = baseColor;
    if (dsq <= proxSq) {
      const t = Math.max(0, Math.min(1, 1 - Math.sqrt(dsq) / proximity));
      fill = `rgb(${Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * t)},${Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * t)},${Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * t)})`;
    }
    ctx.beginPath();
    ctx.arc(dot.cx + dot.xOffset, dot.cy + dot.yOffset, baseRadius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };

  for (const dot of activeDots) drawDynamicDot(dot);
  if (px > -1000) {
    visitNeighborhood(gridMeta, px, py, proximity, dots, (dot) => {
      if (activeDots.has(dot)) return;
      const dx = dot.cx - px;
      const dy = dot.cy - py;
      drawDynamicDot(dot, dx * dx + dy * dy);
    });
  }

  const now = performance.now();
  const isPointerActive = now - lastActiveAt < 200 && px > -1000;
  const isTweening = activeTweensCount > 0 || activeDots.size > 0;
  return isPointerActive || isTweening;
}

export function resetPointerAway(pointer: PointerState, extra?: Partial<PointerState>) {
  pointer.x = -9999;
  pointer.y = -9999;
  Object.assign(pointer, extra);
}

export function handleDotGridMove(e: MouseEvent, options: {
  canvas: HTMLCanvasElement | null;
  pointer: PointerState;
  dots: GridDot[];
  gridMeta: GridMeta;
  activeDots: Set<GridDot>;
  activeTweensCount: { current: number };
  maxSpeed: number;
  speedTrigger: number;
  proximity: number;
  resistance: number;
  returnDuration: number;
  wakeUp: () => void;
}) {
  if (!options.canvas) return;
  const pr = options.pointer;
  if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) {
    const now = performance.now();
    resetPointerAway(pr, { vx: 0, vy: 0, speed: 0, lastTime: now, lastX: e.clientX, lastY: e.clientY, lastActiveAt: 0 });
    options.wakeUp();
    return;
  }

  const now = performance.now();
  const dt = pr.lastTime ? now - pr.lastTime : 16;
  let vx = ((e.clientX - pr.lastX) / dt) * 1000;
  let vy = ((e.clientY - pr.lastY) / dt) * 1000;
  let speed = Math.hypot(vx, vy);
  if (speed > options.maxSpeed) {
    const scale = options.maxSpeed / speed;
    vx *= scale;
    vy *= scale;
    speed = options.maxSpeed;
  }
  pr.lastTime = now;
  pr.lastX = e.clientX;
  pr.lastY = e.clientY;
  pr.vx = vx;
  pr.vy = vy;
  pr.speed = speed;
  pr.lastActiveAt = now;

  const rect = options.canvas.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
    resetPointerAway(pr, { lastActiveAt: 0 });
    return;
  }
  pr.x = e.clientX - rect.left;
  pr.y = e.clientY - rect.top;
  visitNeighborhood(options.gridMeta, pr.x, pr.y, options.proximity, options.dots, (dot) => {
    const dist = Math.hypot(dot.cx - pr.x, dot.cy - pr.y);
    if (speed > options.speedTrigger && dist < options.proximity && !dot._inertiaApplied) {
      applyDotInertia(dot, dot.cx - pr.x + vx * 0.005, dot.cy - pr.y + vy * 0.005, options.resistance, options.returnDuration, options.activeDots, options.activeTweensCount);
    }
  });
  options.wakeUp();
}

export function handleDotGridClick(e: MouseEvent, options: {
  canvas: HTMLCanvasElement | null;
  pointer: PointerState;
  dots: GridDot[];
  gridMeta: GridMeta;
  activeDots: Set<GridDot>;
  activeTweensCount: { current: number };
  shockRadius: number;
  shockStrength: number;
  resistance: number;
  returnDuration: number;
  wakeUp: () => void;
}) {
  if (!options.canvas) return;
  if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) return;
  const rect = options.canvas.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  options.pointer.lastActiveAt = performance.now();
  visitNeighborhood(options.gridMeta, cx, cy, options.shockRadius, options.dots, (dot) => {
    const dist = Math.hypot(dot.cx - cx, dot.cy - cy);
    if (dist < options.shockRadius && !dot._inertiaApplied) {
      const falloff = Math.max(0, 1 - dist / options.shockRadius);
      applyDotInertia(dot, (dot.cx - cx) * options.shockStrength * falloff, (dot.cy - cy) * options.shockStrength * falloff, options.resistance, options.returnDuration, options.activeDots, options.activeTweensCount);
    }
  });
  options.wakeUp();
}
