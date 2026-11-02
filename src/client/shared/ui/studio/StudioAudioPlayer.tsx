import { useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';

export interface StudioAudioPlayerProps {
  src: string;
  label?: string;
  durationHintSec?: number;
  preload?: 'none' | 'metadata' | 'auto';
  compact?: boolean;
  className?: string;
  onPlay?: (event: SyntheticEvent<HTMLAudioElement>) => void;
  onTimeUpdate?: (event: SyntheticEvent<HTMLAudioElement>) => void;
}

/** 根据音频地址生成确定性的伪波形高度序列（0.22 ~ 0.96），无需预先下载整段音频即可呈现精致波形视觉 */
function buildDeterministicBars(seedText: string, count: number): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    hash ^= i + 97;
    hash = Math.imul(hash, 16777619);
    const unit = ((hash >>> 0) % 1000) / 1000;
    const envelope = 0.55 + 0.45 * Math.sin((i / Math.max(1, count - 1)) * Math.PI);
    bars.push(Math.max(0.2, Math.min(0.96, Number((0.22 + unit * 0.72 * envelope).toFixed(2)))));
  }
  return bars;
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const whole = Math.max(0, Math.round(sec));
  const mins = Math.floor(whole / 60);
  const secs = String(whole % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

/**
 * 工作室定制音频波形播放器（Studio Audio Player）
 * 彻底替换裸露的浏览器原生 <audio controls>，同时在内部保留隐藏 <audio> 元素以确保播放兼容性与测试可观测性。
 */
export function StudioAudioPlayer({
  src,
  label = '试听音频',
  durationHintSec = 0,
  preload = 'none',
  compact = false,
  className = '',
  onPlay,
  onTimeUpdate,
}: StudioAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(durationHintSec);

  const barCount = compact ? 20 : 32;
  const bars = useMemo(() => buildDeterministicBars(src || label, barCount), [barCount, label, src]);
  const totalSec = durationSec > 0 ? durationSec : durationHintSec;
  const progressRatio = totalSec > 0 ? Math.min(1, Math.max(0, currentSec / totalSec)) : 0;

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el || !src) return;
    if (el.paused) {
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  };

  const seekToBar = (barIndex: number) => {
    const el = audioRef.current;
    if (!el || !totalSec) return;
    const target = ((barIndex + 0.5) / bars.length) * totalSec;
    el.currentTime = target;
    setCurrentSec(target);
  };

  return (
    <div
      className={`group/audio flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5 transition-colors hover:border-indigo-300/70 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-indigo-400/40 ${className}`.trim()}
    >
      <audio
        ref={audioRef}
        src={src}
        preload={preload}
        className="sr-only"
        onPlay={(event) => {
          setPlaying(true);
          onPlay?.(event);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentSec(0);
        }}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0) {
            setDurationSec(event.currentTarget.duration);
          }
        }}
        onTimeUpdate={(event) => {
          setCurrentSec(event.currentTarget.currentTime);
          onTimeUpdate?.(event);
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        disabled={!src}
        aria-label={playing ? `暂停${label}` : `播放${label}`}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs transition-transform hover:bg-indigo-500 active:scale-95 disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
      </button>

      <div className="flex h-6 min-w-0 flex-1 items-center gap-[2px]" aria-hidden="true">
        {bars.map((heightRatio, idx) => {
          const active = (idx + 1) / bars.length <= progressRatio || (playing && progressRatio === 0 && idx < 2);
          return (
            <button
              key={idx}
              type="button"
              tabIndex={-1}
              onClick={() => seekToBar(idx)}
              className="flex h-full flex-1 items-center justify-center focus:outline-none"
            >
              <span
                style={{ height: `${Math.round(heightRatio * 100)}%` }}
                className={`w-full max-w-[3px] rounded-full transition-colors duration-150 ${
                  active
                    ? 'bg-indigo-600 dark:bg-indigo-400'
                    : 'bg-slate-300/90 group-hover/audio:bg-slate-400/80 dark:bg-white/18 dark:group-hover/audio:bg-white/28'
                }`}
              />
            </button>
          );
        })}
      </div>

      <span className="inline-flex shrink-0 items-center gap-1 font-mono-nums text-[11px] font-medium text-slate-500 tabular-nums dark:text-slate-400">
        <Volume2 className="h-3 w-3 opacity-65" />
        {playing || currentSec > 0 ? formatClock(currentSec) : totalSec > 0 ? formatClock(totalSec) : '试听'}
      </span>
    </div>
  );
}

