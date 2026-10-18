import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getVideoDurationBounds } from '@shared/domain/media/video';

interface VideoDurationRulerSliderProps {
  value: number;
  modelId?: string;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  className?: string;
}

function nearest(value: number, allowed: number[]) {
  return allowed.reduce((best, current) => (
    Math.abs(current - value) < Math.abs(best - value) ? current : best
  ), allowed[0]);
}

const TICKS = 32;

export function VideoDurationRulerSlider({
  value,
  modelId,
  min: minProp,
  max: maxProp,
  onChange,
  className = '',
}: VideoDurationRulerSliderProps) {
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const allowed = useMemo(() => {
    const bounds = getVideoDurationBounds(modelId);
    const filtered = bounds.allowed.filter((item) => (
      (minProp === undefined || item >= minProp) && (maxProp === undefined || item <= maxProp)
    ));
    return filtered.length ? filtered : bounds.allowed;
  }, [modelId, minProp, maxProp]);

  const min = allowed[0];
  const max = allowed[allowed.length - 1];
  const current = allowed.includes(value) ? value : nearest(value, allowed);
  const span = Math.max(1, max - min);
  const pct = ((current - min) / span) * 100;

  useEffect(() => {
    if (!allowed.includes(value)) onChange(nearest(value, allowed));
  }, [allowed, onChange, value]);

  const valueFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track || allowed.length < 2) return current;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return nearest(min + ratio * span, allowed);
  };

  const stepAllowed = (direction: 1 | -1) => {
    const index = Math.max(0, allowed.indexOf(current));
    return allowed[Math.max(0, Math.min(allowed.length - 1, index + direction))] ?? current;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || allowed.length < 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    const next = valueFromClientX(event.clientX);
    if (next !== current) onChange(next);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const next = valueFromClientX(event.clientX);
    if (next !== current) onChange(next);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = event.key === 'ArrowRight' || event.key === 'ArrowUp'
      ? stepAllowed(1)
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? stepAllowed(-1)
        : event.key === 'Home'
          ? min
          : event.key === 'End'
            ? max
            : null;
    if (next == null) return;
    event.preventDefault();
    if (next !== current) onChange(next);
  };

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      <span className="shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">{min}秒</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={allowed.length < 2 ? -1 : 0}
        aria-label="视频生成时长"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-valuetext={`${current} 秒`}
        aria-disabled={allowed.length < 2 || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative h-8 flex-1 cursor-pointer touch-none outline-none"
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex h-4 -translate-y-1/2 items-center justify-between">
          {Array.from({ length: TICKS }, (_, index) => {
            const major = index % 4 === 0;
            return (
              <span
                key={index}
                className={`w-px ${major ? 'h-3.5 bg-slate-400/80 dark:bg-white/45' : 'h-2 bg-slate-300/90 dark:bg-white/20'}`}
              />
            );
          })}
        </div>
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-[18px] w-0.5 -translate-y-1/2 rounded-full bg-slate-950 shadow-[0_0_4px_rgba(0,0,0,0.28)] dark:bg-white dark:shadow-[0_0_6px_rgba(255,255,255,0.45)]"
          initial={false}
          animate={{ left: `${pct}%`, x: '-50%' }}
          transition={reduceMotion || dragging ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 34, mass: 0.6 }}
        />
      </div>
      <span className="shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">{max}秒</span>
      <motion.span
        key={current}
        initial={reduceMotion ? false : { y: 3, opacity: 0.45 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
        className="inline-flex h-8 min-w-[4.25rem] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 text-[13px] font-semibold tabular-nums text-slate-900 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-slate-100"
      >
        {current} 秒
      </motion.span>
    </div>
  );
}

export default VideoDurationRulerSlider;
