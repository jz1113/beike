import { useEffect } from 'react';
import { videoModes, videoResolutionLabel } from '@shared/domain/media/videoCapabilities';
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS, resolveVideoResolution } from '@shared/domain/media/video';
import { AspectRatioCardGroup } from './AspectRatioCardGroup';
import { VideoDurationRulerSlider } from './VideoDurationRulerSlider';

export function videoParamModeLabel(mode: string) {
  return MODE_LABELS[mode] || '全能参考';
}

const MODE_LABELS: Record<string, string> = {
  omni: '全能参考',
  first_frame: '首帧生视频',
  first_last_frame: '首尾帧',
  text: '文生视频',
  edit: '视频编辑',
  extend: '视频延长',
};

export type VideoResolutionValue = '480P' | '720P' | '1080P' | '4K';

interface Props {
  modelId: string;
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  mode: string;
  aspect: string;
  resolution: string;
  duration: number;
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

function nearestId(current: string, order: string[], enabled: string[]) {
  if (!enabled.length || enabled.includes(current)) return current;
  const index = Math.max(0, order.indexOf(current));
  return enabled.reduce((best, id) => (
    Math.abs(order.indexOf(id) - index) < Math.abs(order.indexOf(best) - index) ? id : best
  ), enabled[0]);
}

export function PromptBarVideoTab({
  modelId,
  supportedAspectRatios,
  supportedResolutions,
  mode,
  aspect,
  resolution,
  duration,
  onMode,
  onAspect,
  onResolution,
  onDuration,
}: Props) {
  const modes = videoModes(modelId || '');
  const aspectOrder = VIDEO_ASPECT_RATIOS.map((item) => item.id);
  const aspects = VIDEO_ASPECT_RATIOS.map((item) => ({
    id: item.id,
    label: item.id === 'adaptive' ? '智能' : item.label,
    disabled: !aspectAllowed(item.id, supportedAspectRatios),
  }));
  const enabledAspects = aspects.filter((item) => !item.disabled).map((item) => item.id);
  const currentAspect = aspect === 'smart' ? 'adaptive' : aspect;
  const resolutions = VIDEO_RESOLUTIONS
    .filter((item) => !supportedResolutions?.length || supportedResolutions.includes(item))
    .map((item) => ({
      id: item,
      label: videoResolutionLabel(modelId, item),
    }));
  const enabledResolutions = resolutions.map((item) => item.id);

  useEffect(() => {
    const next = nearestId(currentAspect, aspectOrder, enabledAspects);
    if (next !== currentAspect) onAspect(next);
  }, [currentAspect, aspectOrder.join('|'), enabledAspects.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const next = resolveVideoResolution(resolution, enabledResolutions);
    if (next !== resolution) onResolution(next);
  }, [resolution, enabledResolutions.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">模式选择</div>
        <div
          className="grid w-full gap-1 p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl"
          style={{ gridTemplateColumns: `repeat(${Math.max(modes.length, 1)}, minmax(0, 1fr))` }}
        >
          {modes.map((item) => {
            const label = MODE_LABELS[item.id] || item.name;
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

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">时长</div>
        <VideoDurationRulerSlider value={duration} modelId={modelId} onChange={onDuration} />
      </div>
    </div>
  );
}
