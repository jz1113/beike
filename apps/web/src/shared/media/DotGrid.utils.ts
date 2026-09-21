import { gsap } from 'gsap';

export const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, option, [role="button"], [role="tab"], [contenteditable="true"], [data-no-drag]';

export function throttle<Args extends unknown[]>(func: (...args: Args) => void, limit: number) {
  let lastCall = 0;
  return function (this: unknown, ...args: Args) {
    const now = performance.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      func.apply(this, args);
    }
  };
}

export function hexToRgb(hex: string) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return { r: 99, g: 102, b: 241 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

export interface GridDot {
  cx: number;
  cy: number;
  col: number;
  row: number;
  xOffset: number;
  yOffset: number;
  _inertiaApplied: boolean;
}

export function applyDotInertia(
  dot: GridDot,
  pushX: number,
  pushY: number,
  resistance: number,
  returnDuration: number,
  activeDots: Set<GridDot>,
  activeTweensCount: { current: number },
) {
  dot._inertiaApplied = true;
  activeDots.add(dot);
  activeTweensCount.current += 1;
  gsap.killTweensOf(dot);
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
          activeDots.delete(dot);
          activeTweensCount.current = Math.max(0, activeTweensCount.current - 1);
        },
      });
    },
  });
}
