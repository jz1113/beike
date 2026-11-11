import { useMemo, type KeyboardEvent, type PointerEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { videoModes, videoResolutionLabel, videoDurationOptions, videoDurationFollowsSource, videoRatioOptions, videoResolutionOptions } from '@shared/domain/media/videoCapabilities';
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from '@shared/domain/media/video';
import { VideoGenerationCostNotice } from '@client/shared/ui/VideoGenerationCostNotice';
import { veoExtensionHint } from '@shared/domain/media/veoChannels';
import { isMetasoH3 } from '@shared/domain/media/videoChannels';
import { AspectRatioCardGroup } from './AspectRatioCardGroup';

interface RulerProps {
  value: number;
  allowedDurations: number[];
  onChange: (seconds: number) => void;
}

export function VideoDurationRulerSlider({ value, allowedDurations, onChange }: RulerProps) {
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

export function videoParamModeLabel(mode: string) {
  return MODE_LABELS[mode] || '全能参考';
}

const MODE_LABELS: Record<string, string> = {
  omni: '全能参考',
  first_frame: '首帧生视频',
  last_frame: '尾帧生视频',
  first_last_frame: '首尾帧',
  text: '文生视频',
  edit: '视频编辑',
  extend: '视频延长',
};

export type VideoResolutionValue = '360P' | '480P' | '540P' | '720P' | '768P' | '1080P' | '2K' | '4K';

interface Props {
  modelId: string;
  baseUrl?: string;
  contextIrEnabled?: boolean;
  onContextIrEnabled?: (value: boolean) => void;
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  supportedDurations?: number[];
  mode: string;
  aspect: string;
  resolution: string;
  duration: number;
  compact?: boolean;
  onMode: (mode: string) => void;
  onAspect: (aspect: string) => void;
  onResolution: (resolution: VideoResolutionValue) => void;
  onDuration: (seconds: number) => void;
}

function choiceClass(selected: boolean) {
  return `px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
    selected
      ? 'bg-white dark:bg-white/15 text-slate-950 dark:text-white shadow-xs'
      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
  }`;
}

function modeChoiceClass(selected: boolean, dense: boolean) {
  const size = dense ? 'px-1 py-1.5' : 'px-3 py-1.5';
  return `min-w-0 rounded-xl text-center transition-all cursor-pointer ${size} ${
    selected
      ? 'bg-white dark:bg-white/15 text-slate-950 dark:text-white shadow-xs'
      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
  }`;
}

function modeLabelClass(dense: boolean) {
  return dense
    ? 'block truncate text-[11px] font-medium leading-none tracking-tight'
    : 'block truncate text-xs font-medium leading-none';
}

function aspectAllowed(id: string, supported?: string[]) {
  if (!supported?.length) return true;
  if (supported.includes(id)) return true;
  return id === 'adaptive' && supported.includes('smart');
}

export function PromptBarVideoTab({
  modelId,
  baseUrl,
  contextIrEnabled = true,
  onContextIrEnabled,
  supportedAspectRatios,
  supportedResolutions,
  supportedDurations,
  mode,
  aspect,
  resolution,
  duration,
  compact = false,
  onMode,
  onAspect,
  onResolution,
  onDuration,
}: Props) {
  const modes = videoModes(modelId || '', baseUrl);
  const ratios = videoRatioOptions(modelId, mode, baseUrl);
  const aspects = VIDEO_ASPECT_RATIOS.map((item) => ({
    id: item.id,
    label: item.id === 'adaptive' ? '智能' : item.label,
    disabled: !aspectAllowed(item.id, ratios.length ? ratios : supportedAspectRatios),
  }));
  const currentAspect = aspect === 'smart' ? 'adaptive' : aspect;
  const modeResolutions = videoResolutionOptions(modelId, mode, baseUrl) || supportedResolutions;
  const resolutions = VIDEO_RESOLUTIONS
    .filter((item) => (!supportedResolutions?.length || supportedResolutions.includes(item)) && (!modeResolutions?.length || modeResolutions.includes(item)))
    .map((item) => ({
      id: item,
      label: videoResolutionLabel(modelId, item, baseUrl),
    }));
  const resolutionBlock = (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">视频分辨率</div>
      <div className="flex gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl">
        {resolutions.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.label}
            onClick={() => onResolution(item.id)}
            className={`flex-1 ${choiceClass(resolution === item.id)}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  const durationBlock = (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">时长</div>
      {videoDurationFollowsSource(modelId, mode) ? <p className="text-xs text-slate-500 dark:text-slate-400">
        {mode === 'motion_control' ? '时长跟随动作参考视频（3–30 秒）。' : '时长跟随原视频。'}
      </p> : supportedDurations?.length === 0
        ? <p className="text-xs text-amber-600 dark:text-amber-300">当前模型时长不足以完成整条脚本，请更换模型或参考脚本。</p>
        : <VideoDurationRulerSlider value={duration} allowedDurations={supportedDurations ?? videoDurationOptions(modelId, resolution, mode, baseUrl)} onChange={onDuration} />}
      {veoExtensionHint(modelId, mode, baseUrl) && <p className="text-xs leading-relaxed text-slate-500">{veoExtensionHint(modelId, mode, baseUrl)}</p>}
      {isMetasoH3(modelId, baseUrl) && onContextIrEnabled && <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={contextIrEnabled} onChange={(event) => onContextIrEnabled(event.target.checked)} />
        <span>IR Context 优化素材理解与提示词表达 · 0.05元/次</span>
      </label>}
      <VideoGenerationCostNotice model={modelId} baseUrl={baseUrl} duration={duration} contextIrEnabled={contextIrEnabled} />
    </div>
  );

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">模式选择</div>
        <div
          className="grid w-full gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl"
          style={{ gridTemplateColumns: `repeat(${Math.max(modes.length, 1)}, minmax(0, 1fr))` }}
        >
          {modes.map((item) => {
            const label = item.name;
            return (
              <button
                key={item.id}
                type="button"
                title={label}
                onClick={() => onMode(item.id)}
                className={modeChoiceClass(mode === item.id, modes.length >= 5)}
              >
                <span className={modeLabelClass(modes.length >= 5)}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">画面比例</div>
        <AspectRatioCardGroup value={currentAspect} onChange={onAspect} options={aspects} />
      </div>

      {compact ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {resolutionBlock}
          {durationBlock}
        </div>
      ) : (
        <>
          {resolutionBlock}
          {durationBlock}
        </>
      )}
    </div>
  );
}
