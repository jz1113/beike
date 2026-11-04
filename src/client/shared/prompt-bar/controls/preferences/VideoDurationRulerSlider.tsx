import { useMemo, type KeyboardEvent, type PointerEvent } from 'react';
import { LockKeyhole } from 'lucide-react';

interface Props {
  value: number;
  allowedDurations: number[];
  onChange: (seconds: number) => void;
}

export function VideoDurationRulerSlider({ value, allowedDurations, onChange }: Props) {
  const allowed = useMemo(() => [...new Set(allowedDurations)].sort((a, b) => a - b), [allowedDurations]);
  if (!allowed.length) return <p className="text-xs text-amber-600 dark:text-amber-300">当前配置没有可用时长。</p>;

  const min = allowed[0];
  const max = allowed[allowed.length - 1];
  const nearest = (seconds: number) => allowed.reduce((best, next) =>
    Math.abs(next - seconds) < Math.abs(best - seconds) ? next : best);
  const current = nearest(value);
  const position = (seconds: number) => `${100 * (seconds - min) / (max - min)}%`;
  const select = (seconds: number) => { if (seconds !== value) onChange(seconds); };
  const pickAt = (event: PointerEvent<HTMLDivElement>) => {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    if (width) select(nearest(min + (event.clientX - left) / width * (max - min)));
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = allowed.indexOf(current);
    switch (event.key) {
      case 'ArrowRight': case 'ArrowUp': select(allowed[Math.min(index + 1, allowed.length - 1)]); break;
      case 'ArrowLeft': case 'ArrowDown': select(allowed[Math.max(index - 1, 0)]); break;
      case 'Home': select(min); break;
      case 'End': select(max); break;
      default: return;
    }
    event.preventDefault();
  };
  const pill = 'shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-900 shadow-xs dark:bg-white/10 dark:text-white';

  return (
    <div className="flex min-h-10 items-center gap-2.5 rounded-2xl bg-slate-100/80 px-3 text-xs text-slate-600 select-none dark:bg-white/5 dark:text-slate-300">
      {min === max ? (
        <span className="flex flex-1 items-center gap-2">
          <LockKeyhole size={13} aria-hidden />固定时长
        </span>
      ) : (
        <>
          <span className="shrink-0 tabular-nums">{min}秒</span>
          <div
            role="slider" tabIndex={0} aria-label="视频生成时长"
            aria-valuemin={min} aria-valuemax={max} aria-valuenow={current} aria-valuetext={`${current} 秒`}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              pickAt(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) pickAt(event);
            }}
            onKeyDown={handleKey}
            className="relative h-10 min-w-0 flex-1 cursor-pointer touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-slate-300 dark:bg-white/15" />
            <span aria-hidden className="absolute left-0 top-1/2 h-px bg-slate-500 dark:bg-white/55" style={{ width: position(current) }} />
            {allowed.map((seconds) => (
              <span key={seconds} aria-hidden style={{ left: position(seconds) }}
                className={`pointer-events-none absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 ${seconds % 5 === 0 || seconds === min || seconds === max ? 'h-3' : 'h-2'} ${seconds <= current ? 'bg-slate-500 dark:bg-white/55' : 'bg-slate-300 dark:bg-white/25'}`} />
            ))}
            <span aria-hidden style={{ left: position(current) }} className="pointer-events-none absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900 shadow-sm dark:bg-white" />
          </div>
          <span className="shrink-0 tabular-nums">{max}秒</span>
        </>
      )}
      {value === current
        ? <span className={pill}>{current} 秒</span>
        : <button type="button" className={pill} onClick={() => select(current)}>采用 {current} 秒</button>}
    </div>
  );
}
