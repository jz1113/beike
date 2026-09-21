import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import './DotGrid.css';
import { hexToRgb, throttle, type GridDot } from './DotGrid.utils';
import {
  buildDotGrid,
  handleDotGridClick,
  handleDotGridMove,
  paintDotGridFrame,
  resetPointerAway,
  type GridMeta,
  type PointerState,
} from './DotGrid.runtime';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(InertiaPlugin);
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
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const baseLayerRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const dotsRef = useRef<GridDot[]>([]);
  const activeDotsRef = useRef<Set<GridDot>>(new Set());
  const gridMetaRef = useRef<GridMeta>({ cell: 31, cols: 0, rows: 0, startX: 0, startY: 0 });
  const pointerRef = useRef<PointerState>({
    x: -9999, y: -9999, vx: 0, vy: 0, speed: 0, lastTime: 0, lastX: 0, lastY: 0, lastActiveAt: 0,
  });
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
    buildDotGrid({
      wrap, canvas, dotSize, gap, baseColor, baseRadius,
      canvasSize: canvasSizeRef.current, gridMeta: gridMetaRef, dotsRef,
      activeDots: activeDotsRef.current, contextRef, baseLayerRef,
      activeTweensCount: activeTweensCountRef, wakeUp: () => wakeUpRef.current(),
    });
  }, [dotSize, gap, baseColor, baseRadius]);

  useEffect(() => {
    let rafId: number;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = contextRef.current;
      if (!canvas || !ctx) {
        isLoopRunningRef.current = false;
        return;
      }
      const keepRunning = paintDotGridFrame({
        canvas, ctx, canvasSize: canvasSizeRef.current, baseLayer: baseLayerRef.current,
        pointer: pointerRef.current, dots: dotsRef.current, activeDots: activeDotsRef.current,
        gridMeta: gridMetaRef.current, proximity, baseColor, baseRgb, activeRgb, baseRadius,
        activeTweensCount: activeTweensCountRef.current,
      });
      if (!keepRunning) {
        isLoopRunningRef.current = false;
        return;
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
    const shared = {
      pointer: pointerRef.current,
      activeDots: activeDotsRef.current,
      activeTweensCount: activeTweensCountRef,
      maxSpeed, speedTrigger, proximity, resistance, returnDuration, shockRadius, shockStrength,
      wakeUp: () => wakeUpRef.current(),
    };
    const onMove = (e: MouseEvent) => handleDotGridMove(e, {
      ...shared, canvas: canvasRef.current, dots: dotsRef.current, gridMeta: gridMetaRef.current,
    });
    const onLeave = () => {
      resetPointerAway(pointerRef.current, { lastActiveAt: 0 });
      wakeUpRef.current();
    };
    const onClick = (e: MouseEvent) => handleDotGridClick(e, {
      ...shared, canvas: canvasRef.current, dots: dotsRef.current, gridMeta: gridMetaRef.current,
    });
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
