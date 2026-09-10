import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import './DotGrid.css';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(InertiaPlugin);
}

const throttle = <T extends (...args: any[]) => void>(func: T, limit: number) => {
  let lastCall = 0;
  return function (this: any, ...args: Parameters<T>) {
    const now = performance.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      func.apply(this, args);
    }
  };
};

function hexToRgb(hex: string) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return { r: 99, g: 102, b: 241 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

export interface DotGridProps {
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  activeColor?: string;
  proximity?: number;
  speedTrigger?: number;
  shockRadius?: number;
  shockStrength?: number;
  maxSpeed?: number;
  resistance?: number;
  returnDuration?: number;
  className?: string;
  style?: React.CSSProperties;
}

interface GridDot {
  cx: number;
  cy: number;
  col: number;
  row: number;
  xOffset: number;
  yOffset: number;
  _inertiaApplied: boolean;
}

export const DotGrid: React.FC<DotGridProps> = ({
  dotSize = 3,
  gap = 28,
  baseColor = '#CBD5E1',
  activeColor = '#6366F1',
  proximity = 120,
  speedTrigger = 80,
  shockRadius = 220,
  shockStrength = 4,
  maxSpeed = 4000,
  resistance = 750,
  returnDuration = 1.4,
  className = '',
  style,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<GridDot[]>([]);
  const gridMetaRef = useRef({ cell: 31, cols: 0, rows: 0, startX: 0, startY: 0 });

  const pointerRef = useRef({
    x: -9999,
    y: -9999,
    vx: 0,
    vy: 0,
    speed: 0,
    lastTime: 0,
    lastX: 0,
    lastY: 0,
    lastActiveAt: 0,
  });

  // 活跃位移动画计数（避免在完全静止时持续占满 requestAnimationFrame）
  const activeTweensCountRef = useRef(0);
  const isLoopRunningRef = useRef(false);
  const wakeUpRef = useRef<() => void>(() => {});

  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);
  const baseRadius = useMemo(() => Math.max(dotSize / 2, 0.5), [dotSize]);

  const buildGrid = useCallback(() => {
    const wrap = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const { width, height } = wrap.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);

    const cell = dotSize + gap;
    const cols = Math.floor((width + gap) / cell);
    const rows = Math.floor((height + gap) / cell);

    const gridW = cell * cols - gap;
    const gridH = cell * rows - gap;

    const extraX = width - gridW;
    const extraY = height - gridH;

    const startX = extraX / 2 + dotSize / 2;
    const startY = extraY / 2 + dotSize / 2;

    gridMetaRef.current = { cell, cols, rows, startX, startY };

    const dots: GridDot[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cx = startX + x * cell;
        const cy = startY + y * cell;
        dots.push({ cx, cy, col: x, row: y, xOffset: 0, yOffset: 0, _inertiaApplied: false });
      }
    }
    dotsRef.current = dots;
    activeTweensCountRef.current = 0;

    // 重新排布后唤醒渲染一次
    wakeUpRef.current();
  }, [dotSize, gap]);

  // 极速批量绘制循环（支持静止时自动休眠，CPU 占用降至 0%）
  useEffect(() => {
    let rafId: number;
    const proxSq = proximity * proximity;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        isLoopRunningRef.current = false;
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        isLoopRunningRef.current = false;
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { x: px, y: py, lastActiveAt } = pointerRef.current;
      const dots = dotsRef.current;
      const totalDots = dots.length;

      // 1. 批量绘制所有无位移、非高亮的静态底图点（单条 Path2D，一次性填色，极度轻量）
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      for (let i = 0; i < totalDots; i++) {
        const dot = dots[i];
        if (dot.xOffset === 0 && dot.yOffset === 0) {
          const dx = dot.cx - px;
          const dy = dot.cy - py;
          if (dx * dx + dy * dy > proxSq) {
            ctx.moveTo(dot.cx + baseRadius, dot.cy);
            ctx.arc(dot.cx, dot.cy, baseRadius, 0, Math.PI * 2);
          }
        }
      }
      ctx.fill();

      // 2. 仅对鼠标附近或产生物理微位移的极少数点进行高保真单独渲染（通常仅 10-30 个点）
      let hasNonZeroOffset = false;
      for (let i = 0; i < totalDots; i++) {
        const dot = dots[i];
        const isOffset = dot.xOffset !== 0 || dot.yOffset !== 0;
        if (isOffset) hasNonZeroOffset = true;

        const dx = dot.cx - px;
        const dy = dot.cy - py;
        const dsq = dx * dx + dy * dy;
        const isNear = dsq <= proxSq;

        if (isOffset || isNear) {
          const ox = dot.cx + dot.xOffset;
          const oy = dot.cy + dot.yOffset;
          let fill = baseColor;

          if (isNear) {
            const dist = Math.sqrt(dsq);
            const t = Math.max(0, Math.min(1, 1 - dist / proximity));
            const r = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * t);
            const g = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * t);
            const b = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * t);
            fill = `rgb(${r},${g},${b})`;
          }

          ctx.beginPath();
          ctx.arc(ox, oy, baseRadius, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
        }
      }

      // 3. 智能休眠判断：若无物理动画进行且鼠标静止超过 200ms，停用 requestAnimationFrame
      const now = performance.now();
      const isPointerActive = now - lastActiveAt < 200 && px > -1000;
      const isTweening = activeTweensCountRef.current > 0 || hasNonZeroOffset;

      if (!isPointerActive && !isTweening) {
        isLoopRunningRef.current = false;
        return; // 休眠退出，不再递归调用 requestAnimationFrame
      }

      rafId = requestAnimationFrame(draw);
    };

    const wakeUp = () => {
      if (!isLoopRunningRef.current) {
        isLoopRunningRef.current = true;
        rafId = requestAnimationFrame(draw);
      }
    };

    wakeUpRef.current = wakeUp;
    wakeUp();

    return () => {
      isLoopRunningRef.current = false;
      cancelAnimationFrame(rafId);
    };
  }, [proximity, baseColor, activeRgb, baseRgb, baseRadius]);

  useEffect(() => {
    buildGrid();
    let ro: ResizeObserver | null = null;
    if (typeof window !== 'undefined' && 'ResizeObserver' in window && wrapperRef.current) {
      ro = new ResizeObserver(buildGrid);
      ro.observe(wrapperRef.current);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', buildGrid);
    }
    return () => {
      if (ro) ro.disconnect();
      else if (typeof window !== 'undefined') window.removeEventListener('resize', buildGrid);
    };
  }, [buildGrid]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const now = performance.now();
      const pr = pointerRef.current;
      const dt = pr.lastTime ? now - pr.lastTime : 16;
      const dx = e.clientX - pr.lastX;
      const dy = e.clientY - pr.lastY;
      let vx = (dx / dt) * 1000;
      let vy = (dy / dt) * 1000;
      let speed = Math.hypot(vx, vy);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        vx *= scale;
        vy *= scale;
        speed = maxSpeed;
      }
      pr.lastTime = now;
      pr.lastX = e.clientX;
      pr.lastY = e.clientY;
      pr.vx = vx;
      pr.vy = vy;
      pr.speed = speed;
      pr.lastActiveAt = now;

      const rect = canvasRef.current.getBoundingClientRect();
      pr.x = e.clientX - rect.left;
      pr.y = e.clientY - rect.top;

      // 空间网格范围快速查找（仅对光标半径内的点进行碰撞与 GSAP 物理弹性计算，O(1) 裁剪）
      const { cell, cols, rows, startX, startY } = gridMetaRef.current;
      if (cols > 0 && rows > 0) {
        const targetCol = Math.round((pr.x - startX) / cell);
        const targetRow = Math.round((pr.y - startY) / cell);
        const radiusCells = Math.ceil(proximity / cell) + 1;
        const minCol = Math.max(0, targetCol - radiusCells);
        const maxCol = Math.min(cols - 1, targetCol + radiusCells);
        const minRow = Math.max(0, targetRow - radiusCells);
        const maxRow = Math.min(rows - 1, targetRow + radiusCells);

        const dots = dotsRef.current;
        for (let r = minRow; r <= maxRow; r++) {
          const rowOffset = r * cols;
          for (let c = minCol; c <= maxCol; c++) {
            const dot = dots[rowOffset + c];
            if (!dot) continue;
            const dist = Math.hypot(dot.cx - pr.x, dot.cy - pr.y);
            if (speed > speedTrigger && dist < proximity && !dot._inertiaApplied) {
              dot._inertiaApplied = true;
              activeTweensCountRef.current += 1;
              gsap.killTweensOf(dot);
              const pushX = dot.cx - pr.x + vx * 0.005;
              const pushY = dot.cy - pr.y + vy * 0.005;
              gsap.to(dot, {
                inertia: { xOffset: pushX, yOffset: pushY, resistance },
                onComplete: () => {
                  gsap.to(dot, {
                    xOffset: 0,
                    yOffset: 0,
                    duration: returnDuration,
                    ease: 'elastic.out(1,0.75)',
                    onComplete: () => {
                      dot._inertiaApplied = false;
                      activeTweensCountRef.current = Math.max(0, activeTweensCountRef.current - 1);
                    },
                  });
                },
              });
            }
          }
        }
      }

      wakeUpRef.current();
    };

    const onLeave = () => {
      pointerRef.current.x = -9999;
      pointerRef.current.y = -9999;
      pointerRef.current.lastActiveAt = 0;
      wakeUpRef.current();
    };

    const onClick = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      pointerRef.current.lastActiveAt = performance.now();

      const { cell, cols, rows, startX, startY } = gridMetaRef.current;
      if (cols > 0 && rows > 0) {
        const targetCol = Math.round((cx - startX) / cell);
        const targetRow = Math.round((cy - startY) / cell);
        const radiusCells = Math.ceil(shockRadius / cell) + 1;
        const minCol = Math.max(0, targetCol - radiusCells);
        const maxCol = Math.min(cols - 1, targetCol + radiusCells);
        const minRow = Math.max(0, targetRow - radiusCells);
        const maxRow = Math.min(rows - 1, targetRow + radiusCells);

        const dots = dotsRef.current;
        for (let r = minRow; r <= maxRow; r++) {
          const rowOffset = r * cols;
          for (let c = minCol; c <= maxCol; c++) {
            const dot = dots[rowOffset + c];
            if (!dot) continue;
            const dist = Math.hypot(dot.cx - cx, dot.cy - cy);
            if (dist < shockRadius && !dot._inertiaApplied) {
              dot._inertiaApplied = true;
              activeTweensCountRef.current += 1;
              gsap.killTweensOf(dot);
              const falloff = Math.max(0, 1 - dist / shockRadius);
              const pushX = (dot.cx - cx) * shockStrength * falloff;
              const pushY = (dot.cy - cy) * shockStrength * falloff;
              gsap.to(dot, {
                inertia: { xOffset: pushX, yOffset: pushY, resistance },
                onComplete: () => {
                  gsap.to(dot, {
                    xOffset: 0,
                    yOffset: 0,
                    duration: returnDuration,
                    ease: 'elastic.out(1,0.75)',
                    onComplete: () => {
                      dot._inertiaApplied = false;
                      activeTweensCountRef.current = Math.max(0, activeTweensCountRef.current - 1);
                    },
                  });
                },
              });
            }
          }
        }
      }

      wakeUpRef.current();
    };

    const throttledMove = throttle(onMove, 30);
    window.addEventListener('mousemove', throttledMove, { passive: true });
    window.addEventListener('mouseleave', onLeave, { passive: true });
    window.addEventListener('click', onClick);

    return () => {
      window.removeEventListener('mousemove', throttledMove);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('click', onClick);
    };
  }, [maxSpeed, speedTrigger, proximity, resistance, returnDuration, shockRadius, shockStrength]);

  return (
    <section className={`dot-grid ${className}`} style={style}>
      <div ref={wrapperRef} className="dot-grid__wrap">
        <canvas ref={canvasRef} className="dot-grid__canvas" />
      </div>
    </section>
  );
};

export default DotGrid;
