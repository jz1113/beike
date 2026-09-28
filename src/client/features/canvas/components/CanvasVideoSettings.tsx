import { useEffect, useRef } from 'react';
import { getVideoModelById } from '@shared/domain/media/video';
import { videoRatioLocked, videoResolutionLabel, videoDurationOptions, videoModes } from '@shared/domain/media/videoCapabilities';
import type { CanvasNode } from '../model/types';

type Config = NonNullable<CanvasNode['drawing']>;
const choice = (active: boolean) => `rounded-lg border px-2 py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-slate-400 ${active ? 'border-slate-500 bg-slate-100 text-slate-900' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`;

export function CanvasVideoSettings({ config, model, modesOnly, section, onChange }: {
  config: Config; model: string; modesOnly?: boolean; section?: 'aspect' | 'quality' | 'duration' | 'audio' | 'count'; onChange: (patch: Partial<Config>) => void;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    (root.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') || root.current?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [section, modesOnly]);
  const profile = getVideoModelById(model);
  const mode = config.refMode || 'omni';
  const lockedRatio = videoRatioLocked(model, mode);
  const durations = videoDurationOptions(model, config.quality, mode);
  const duration = config.duration ?? 5;
  if (!profile) return <p className="p-4 text-xs text-slate-500">请先选择已启用的视频模型，再设置生成参数。</p>;
  return <section ref={root} role="dialog" aria-label={modesOnly ? '视频生成方式' : '视频生成参数'} data-drawing-settings className={`${section && section !== 'aspect' ? 'p-2' : 'p-3'} text-left`} onKeyDown={event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>
    {modesOnly ? <div className="grid gap-1">
      {videoModes(model).map(item => <button key={item.id} type="button" aria-pressed={mode === item.id} className={`${choice(mode === item.id)} text-left`} onClick={() => {
        const allowed = videoDurationOptions(model, config.quality, item.id);
        onChange({ refMode: item.id, duration: allowed.includes(duration) ? duration : allowed[0] });
      }}><span className="block font-medium">{item.name}</span><span className="mt-1 block text-[11px] opacity-70">{item.desc}</span></button>)}
    </div> : <div className="space-y-4">
      {(!section || section === 'aspect') && <div><p className="mb-2 text-xs text-slate-500">比例{lockedRatio && ' · 跟随原素材'}</p>
        <div className="grid grid-cols-5 gap-1.5">{(lockedRatio ? ['adaptive'] : profile?.supportedAspectRatios || []).map(ratio => <button key={ratio} type="button" aria-pressed={lockedRatio || config.aspect === ratio} className={`${choice(lockedRatio || config.aspect === ratio)} flex h-16 flex-col items-center justify-center gap-2`} onClick={() => onChange({ aspect: ratio })}><span aria-hidden="true" className={`block rounded-[2px] border border-current ${ratio === 'adaptive' ? 'border-dashed' : ''}`} style={{ width: 20 * Math.min(1, Number(ratio.split(':')[0]) / Number(ratio.split(':')[1]) || 1), height: 20 * Math.min(1, Number(ratio.split(':')[1]) / Number(ratio.split(':')[0]) || 1) }} />{ratio === 'adaptive' ? '自动' : ratio}</button>)}</div>
      </div>}
      {(!section || section === 'quality') && <div><p className="mb-2 text-xs text-slate-500">清晰度</p><div className="flex flex-col gap-1">{profile?.supportedResolutions.map(res => <button key={res} type="button" className={`${choice(config.quality === res)} flex-1`} aria-pressed={config.quality === res} onClick={() => {
        const allowed = videoDurationOptions(model, res, mode);
        onChange({ quality: res, duration: allowed.includes(duration) ? duration : allowed[0] });
      }}>{videoResolutionLabel(model, res)}</button>)}</div></div>}
      {(!section || section === 'duration') && <div><p className="mb-2 flex justify-between text-xs text-slate-500">时长<span>{mode === 'edit' ? '跟随原视频' : `${duration} 秒`}</span></p>
        {mode !== 'edit' && <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">{durations.map(seconds => <button key={seconds} type="button" aria-pressed={duration === seconds} className={`${choice(duration === seconds)} shrink-0 border-transparent`} onClick={() => onChange({ duration: seconds })}>{seconds}s</button>)}</div>}
      </div>}

      {(!section || section === 'audio') && (profile?.audioSupport === 'controllable' ? <div><p className="mb-2 text-xs text-slate-500">生成音频</p><div className="grid grid-cols-1 gap-1">{[true, false].map(audio => <button key={String(audio)} type="button" className={choice((config.audio ?? true) === audio)} aria-pressed={(config.audio ?? true) === audio} onClick={() => onChange({ audio })}>{audio ? '开启' : '关闭'}</button>)}</div></div> : <p className="text-xs text-slate-400">声音由模型默认行为或提示词决定</p>)}
      {(!section || section === 'count') && <div><p className="mb-2 text-xs text-slate-500">生成数量</p><div className="grid grid-cols-3 gap-1.5">{[1, 2, 4].map(count => <button key={count} type="button" className={choice(config.count === count)} aria-pressed={config.count === count} onClick={() => onChange({ count })}>{count} 个</button>)}</div></div>}
    </div>}
  </section>;
}
