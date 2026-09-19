import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { getPerformanceMode } from '@/shared/utils/performancePreference';
import { CanvasDotGridStatic } from './canvasDotGridStatic';

export interface CanvasDotGridProps {
  /** 画布视口当前的平移量 (px) */
  pan: { x: number; y: number };
  /** 画布视口当前的缩放比例 (0.1 ~ 3.0) */
  zoom: number;
  /** 是否正在拖拽视口 */
  isPanning?: boolean;
  /** 点的基础直径 (px, zoom=1 时) */
  dotSize?: number;
  /** 点之间的间距 (px, zoom=1 时) */
  gap?: number;
  /** 常规状态下的网格点颜色 (Hex) */
  baseColor?: string;
  /** 鼠标靠近或波光高亮时的颜色 (Hex) */
  activeColor?: string;
  /** 鼠标感知与互动影响的半径 (px) */
  proximity?: number;
  /** 自定义 CSS 类名 */
  className?: string;
  /** 自定义内联样式 */
  style?: React.CSSProperties;
}

/**
 * 辅助函数：将 16 进制颜色转换为 RGB 结构体
 */
function hexToRgb(hex: string) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return { r: 203, g: 213, b: 225 }; // 默认 #CBD5E1 (slate-300)
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

/**
 * 🌟 CanvasDotGrid: 专为无限画布打造的 60FPS 动态点阵背景系统
 *
 * 特性亮点：
 * 1. 严格锁定无限画布视口变换（Pan & Zoom），点阵与舞台节点 100% 空间锚定无错位。
 * 2. 视口虚拟化视锥裁剪：只遍历当前屏幕可视区域内的点，内存固定，毫秒级轻量渲染。
 * 3. 环境水波流动微光 (Ambient Fluid Waves)：参考主页图 2 质感，点阵具有柔和轻盈的起伏呼吸光影。
 * 4. 鼠标靠近变色与弹性微推 (Interactive Proximity)：光标滑过产生流体般的变色与微弹动排斥。
 */
export const CanvasDotGrid: React.FC<CanvasDotGridProps> = (props) => {
  if (getPerformanceMode() !== 'fidelity') {
    return <CanvasDotGridStatic {...props} />;
  }
  return <CanvasDotGridAnimated {...props} />;
};

const CanvasDotGridAnimated: React.FC<CanvasDotGridProps> = ({
  pan,
  zoom,
  isPanning = false,
  dotSize = 3,
  gap = 28,
  baseColor = '#CBD5E1',
  activeColor = '#6366F1',
  proximity = 125,
  className = '',
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 鼠标在当前视口屏幕中的坐标与平滑速度
  const mouseRef = useRef({
    x: -9999,
    y: -9999,
    targetX: -9999,
    targetY: -9999,
    isActive: false,
  });

  // 保持当前 pan 和 zoom 的最新 ref，供 requestAnimationFrame 闭包零延迟读取
  const transformRef = useRef({ pan, zoom, isPanning });
  transformRef.current = { pan, zoom, isPanning };

  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

  // 视口尺寸监听与 Canvas DPR 适配
  const resizeCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const { clientWidth: width, clientHeight: height } = container;
    if (width <= 0 || height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }, []);

  useEffect(() => {
    resizeCanvas();
    let ro: ResizeObserver | null = null;
    if (typeof window !== 'undefined' && 'ResizeObserver' in window && containerRef.current) {
      ro = new ResizeObserver(resizeCanvas);
      ro.observe(containerRef.current);
    }
    const handleWindowResize = () => resizeCanvas();
    window.addEventListener('resize', handleWindowResize);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [resizeCanvas]);

  // 视口内的鼠标移动追踪
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouseRef.current.targetX = x;
      mouseRef.current.targetY = y;
      mouseRef.current.isActive = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.targetX = -9999;
      mouseRef.current.targetY = -9999;
      mouseRef.current.isActive = false;
    };

    // 监听窗口层鼠标事件
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  // 核心动画渲染循环
  useEffect(() => {
    let animId: number;
    const proxSq = proximity * proximity;

    const safeRaf = (cb: FrameRequestCallback): number => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(cb);
      }
      if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(cb);
      }
      return setTimeout(cb, 16) as unknown as number;
    };

    const safeCaf = (id: number) => {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(id);
      } else if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(id);
      } else {
        clearTimeout(id);
      }
    };

    const render = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        animId = safeRaf(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = safeRaf(render);
        return;
      }

      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) {
        animId = safeRaf(render);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      // 清屏
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.scale(dpr, dpr);

      const { pan: curPan, zoom: curZoom } = transformRef.current;

      // 屏幕上的网格步长
      const step = (dotSize + gap) * curZoom;

      // LOD (Level of Detail): 若缩小到极小比例 (step < 12)，按步进采样避免过于密集
      const stride = step < 12 ? Math.ceil(14 / step) : 1;
      const effectiveStep = step * stride;

      // 当前时间驱动水波流动
      const time = performance.now() * 0.0012;

      // 平滑插值鼠标位置，呈现微流动阻尼
      const mouse = mouseRef.current;
      if (mouse.isActive) {
        mouse.x += (mouse.targetX - mouse.x) * 0.25;
        mouse.y += (mouse.targetY - mouse.y) * 0.25;
      } else {
        mouse.x = -9999;
        mouse.y = -9999;
      }

      // 计算进入屏幕可视窗口的网格世界索引范围
      // 屏幕坐标 sx = gx * step + curPan.x => gx = (sx - curPan.x) / step
      const minGX = Math.floor((-effectiveStep - curPan.x) / effectiveStep) * stride;
      const maxGX = Math.ceil((width + effectiveStep - curPan.x) / effectiveStep) * stride;
      const minGY = Math.floor((-effectiveStep - curPan.y) / effectiveStep) * stride;
      const maxGY = Math.ceil((height + effectiveStep - curPan.y) / effectiveStep) * stride;

      const px = mouse.x;
      const py = mouse.y;

      // 点的基础半径（随缩放缩放，同时做柔和边界保护，避免太小看不清或太大失真）
      const baseRadius = Math.max(0.8, Math.min(4, (dotSize / 2) * Math.sqrt(curZoom)));

      // 循环遍历视口内可见的点
      for (let gy = minGY; gy <= maxGY; gy += stride) {
        const sy = gy * step + curPan.y;

        for (let gx = minGX; gx <= maxGX; gx += stride) {
          const sx = gx * step + curPan.x;

          // 1. 计算环境流动水波 (Ambient Waves, 还原图 2 层次起伏)
          const wave1 = Math.sin(gx * 0.16 + time * 1.1 + gy * 0.07);
          const wave2 = Math.cos(gy * 0.14 - time * 0.85 + gx * 0.09);
          const wave = (wave1 + wave2) * 0.5; // [-1, 1]

          // 根据波浪调整透明度与微小半径呼吸
          const ambientAlpha = Math.max(0.35, Math.min(0.95, 0.65 + wave * 0.28));
          let dotRadius = baseRadius * (1 + wave * 0.15);

          // 2. 鼠标靠近感应 (Proximity Interaction)
          let drawX = sx;
          let drawY = sy;
          let r = baseRgb.r;
          let g = baseRgb.g;
          let b = baseRgb.b;
          let alpha = ambientAlpha;

          if (mouse.isActive) {
            const dx = sx - px;
            const dy = sy - py;
            const distSq = dx * dx + dy * dy;

            if (distSq < proxSq) {
              const dist = Math.sqrt(distSq);
              const t = 1 - dist / proximity; // [0, 1]
              const easeT = t * t; // 二次平滑

              // 靠近变色为活力色彩
              r = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * easeT);
              g = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * easeT);
              b = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * easeT);
              alpha = Math.min(1.0, ambientAlpha + easeT * 0.4);

              // 点微轻微放大
              dotRadius = dotRadius * (1 + easeT * 0.4);

              // 物理弹性推力排斥 (向外微推 0 ~ 5px)
              if (dist > 0.1) {
                const push = easeT * 4.5;
                drawX += (dx / dist) * push;
                drawY += (dy / dist) * push;
              }
            }
          }

          // 3. 绘制点
          ctx.beginPath();
          ctx.arc(drawX, drawY, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      ctx.restore();
      animId = safeRaf(render);
    };

    animId = safeRaf(render);
    return () => safeCaf(animId);
  }, [dotSize, gap, baseRgb, activeRgb, proximity]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
      style={style}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};

export default CanvasDotGrid;
