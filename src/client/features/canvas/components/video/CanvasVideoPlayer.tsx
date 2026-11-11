import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { getVideoModelById } from '@shared/domain/media/video';
import { imageCapabilities, imageOutputTier } from '@shared/domain/media/imageCapabilities';
import {
  videoDurationOptions,
  videoDurationFollowsSource,
  videoModes,
  resolveVideoParameters,
  videoRatioLocked,
  videoRatioOptions,
  videoResolutionLabel,
  videoResolutionOptions,
} from '@shared/domain/media/videoCapabilities';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import { getGatewayClientBaseUrl, getModelCredentials } from '@client/shared/api/gatewayClient';
import { veoExtensionHint } from '@shared/domain/media/veoChannels';
import { isMetasoH3 } from '@shared/domain/media/videoChannels';
import { VideoGenerationCostNotice } from '@client/shared/ui/VideoGenerationCostNotice';
import type { CanvasNode } from '../../model/types';

export interface ImageResolutionOption { id: string; short: string; label: string }
export interface ImageQualityTierOption { id: 'max' | 'xhigh' | 'high' | 'medium' | 'low'; label: string }
export interface ImageModelCapabilities {
  resolutions: ImageResolutionOption[];
  qualities: ImageQualityTierOption[];
  supportsBackground: boolean;
  supportsCustomSize: boolean;
  ratios: string[];
}

export function resolveImageModelCapabilities(model = 'gpt-image-2', selection = model): ImageModelCapabilities {
  const credentials = getModelCredentials(selection);
  const caps = imageCapabilities(model, credentials.protocol, credentials.baseUrl);
  const id = model.toLowerCase();
  const supportsCustomSize = /gpt-image-2(?!.*(?:-2k|-4k))/.test(id);
  const supportsBackground = supportsCustomSize || id.includes('gpt-image-1.5');
  const fullRatios = ['smart', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'];
  const fixedSize = /midjourney|^mj|z-image|gpt-image-1[._-]5|gpt-4o-image|sora[_-]image/i.test(id);
  const resolutions: ImageResolutionOption[] = fixedSize ? [] : caps.resolutions.map(size => ({ id: imageOutputTier(size), short: size, label: size }));
  if (supportsCustomSize) resolutions.push({ id: 'custom', short: '自定义', label: '自定义尺寸' });
  const labels = { max: '最高', xhigh: '极高', high: '高', medium: '中', low: '低' };
  const qualities = [...(caps.qualities ?? [])].reverse().map(id => ({ id, label: labels[id] }));
  const ratios = caps.aspectRatios ?? (id.includes('gpt-image-1.5') ? ['smart', '1:1', '3:2', '2:3'] : fullRatios);
  return { resolutions, qualities, supportsBackground, supportsCustomSize, ratios: supportsCustomSize ? [...ratios, 'custom'] : ratios };
}

export function resolveCanvasImageConfig<T extends Pick<VideoConfig, 'aspect' | 'quality' | 'generationQuality' | 'backgroundMode'>>(
  config: T, model: string, selection = model,
): T {
  const caps = resolveImageModelCapabilities(model, selection);
  const aspect = caps.ratios.includes(config.aspect) ? config.aspect : caps.ratios.includes('3:4') ? '3:4' : caps.ratios[0];
  const savedResolution = caps.resolutions.find(item => item.id === config.quality || item.short === config.quality);
  const quality = aspect === 'custom' ? 'custom' : savedResolution && savedResolution.id !== 'custom'
    ? savedResolution.id
    : caps.resolutions.find(item => item.id === 'medium')?.id
      ?? caps.resolutions.filter(item => item.id !== 'custom').at(-1)?.id
      ?? (config.quality === 'custom' ? 'medium' : config.quality);
  return {
    ...config, aspect, quality,
    generationQuality: caps.qualities.length
      ? caps.qualities.find(item => item.id === config.generationQuality)?.id ?? 'high'
      : undefined,
    backgroundMode: caps.supportsBackground ? config.backgroundMode : undefined,
  };
}

export interface VideoModelCapabilityOption { id: string; label: string; desc?: string }
export interface VideoModelCapabilities {
  modes: VideoModelCapabilityOption[];
  ratios: string[];
  resolutions: string[];
  durations: number[];
  customDurationBounds?: { min: number; max: number };
  supportsAudio: boolean;
}

export function formatVideoResolutionPill(model: string, res: string, baseUrl?: string): string {
  const label = videoResolutionLabel(model, res, baseUrl);
  return /^(480|512|540|720|768|1080)P$/i.test(label) ? `${label.slice(0, -1)}p` : label;
}

export function resolveVideoModelCapabilities(
  rawModel: string,
  currentMode?: string,
  currentResolution?: string,
  baseUrl?: string,
): VideoModelCapabilities {
  const profile = getVideoModelById(rawModel, baseUrl);
  const mode = currentMode || 'omni';
  const modes = videoModes(rawModel, baseUrl).map(item => ({ id: item.id, label: item.name, desc: item.desc }));
  const supportedRatios = videoRatioOptions(rawModel, mode, baseUrl);
  const ratios = supportedRatios.length ? supportedRatios : ['16:9', '9:16', '1:1'];

  const resolutions = videoResolutionOptions(rawModel, mode, baseUrl) || profile?.supportedResolutions || ['480P', '720P'];
  const durations = videoDurationOptions(rawModel, currentResolution || resolutions[0], mode, baseUrl);
  const customDurationBounds = durations.length > 12 ? { min: durations[0], max: durations[durations.length - 1] } : undefined;
  const supportsAudio = profile?.audioSupport === 'controllable';

  return { modes, ratios, resolutions, durations, customDurationBounds, supportsAudio };
}

/** Render outside the editor's scrolling area so opening controls never moves the node/editor. */
export function CanvasVideoPopover({ anchor, children, width: preferredWidth = 340 }: { anchor: RefObject<HTMLButtonElement | null>; children: ReactNode; width?: number }) {
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 340, maxHeight: 480 });
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(preferredWidth, window.innerWidth - 24);
      const above = rect.top - 20, below = window.innerHeight - rect.bottom - 20;
      const up = above >= Math.min(480, below);
      const maxHeight = Math.max(80, Math.min(480, up ? above : below));
      const height = Math.min(popup.current?.scrollHeight || 480, maxHeight);
      setPosition({ width, maxHeight, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: Math.max(12, up ? rect.top - height - 8 : rect.bottom + 8) });
    };
    place();
    const observer = new ResizeObserver(place);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, preferredWidth]);
  return createPortal(<div ref={popup} data-drawing-settings style={position} className="fixed z-[200] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1B1B1E] text-slate-700 dark:text-[#C7C7CC] shadow-[0_8px_28px_rgba(15,23,42,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
    onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{children}</div>, document.body);
}

type VideoConfig = NonNullable<CanvasNode['drawing']>;
const choice = (active: boolean) => `rounded-lg border px-2 py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-slate-400 ${active ? 'border-slate-500 bg-slate-100 text-slate-900 dark:text-slate-100 dark:bg-white/10' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5 dark:border-white/10'}`;

export function CanvasVideoSettings({ config, model, baseUrl, modesOnly, section, onChange }: {
  config: VideoConfig; model: string; baseUrl?: string; modesOnly?: boolean; section?: 'aspect' | 'quality' | 'duration' | 'audio' | 'count'; onChange: (patch: Partial<VideoConfig>) => void;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    (root.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') || root.current?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [section, modesOnly]);
  const profile = getVideoModelById(model, baseUrl);
  const resolve = (overrides: { mode?: string; resolution?: string } = {}) => resolveVideoParameters(model, {
    mode: config.refMode, aspect: config.aspect, resolution: config.quality, duration: config.duration, ...overrides,
  }, baseUrl);
  const { mode, aspect, resolution, duration } = resolve();
  const lockedRatio = videoRatioLocked(model, mode, baseUrl);
  const durations = videoDurationOptions(model, resolution, mode, baseUrl);
  if (!profile) return <p className="p-4 text-xs text-slate-500 dark:text-slate-400">请先选择已启用的视频模型，再设置生成参数。</p>;
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
      {videoModes(model, baseUrl).map(item => <button key={item.id} type="button" aria-pressed={mode === item.id} className={`${choice(mode === item.id)} text-left`} onClick={() => {
        const next = resolve({ mode: item.id });
        onChange({ refMode: next.mode, aspect: next.aspect, quality: next.resolution, duration: next.duration });
      }}><span className="block font-medium">{item.name}</span><span className="mt-1 block text-[11px] opacity-70">{item.desc}</span></button>)}
    </div> : <div className="space-y-4">
      {(!section || section === 'aspect') && <div><p className="mb-2 text-xs text-slate-500 dark:text-slate-400">比例{lockedRatio && ' · 跟随原素材'}</p>
        <div className="grid grid-cols-5 gap-1.5">{videoRatioOptions(model, mode, baseUrl).map(ratio => <button key={ratio} type="button" aria-pressed={aspect === ratio} className={`${choice(aspect === ratio)} flex h-16 flex-col items-center justify-center gap-2`} onClick={() => onChange({ aspect: ratio })}><span aria-hidden="true" className={`block rounded-[2px] border border-current ${ratio === 'adaptive' ? 'border-dashed' : ''}`} style={{ width: 20 * Math.min(1, Number(ratio.split(':')[0]) / Number(ratio.split(':')[1]) || 1), height: 20 * Math.min(1, Number(ratio.split(':')[1]) / Number(ratio.split(':')[0]) || 1) }} />{ratio === 'adaptive' ? '自动' : ratio}</button>)}</div>
      </div>}
      {(!section || section === 'quality') && <div><p className="mb-2 text-xs text-slate-500 dark:text-slate-400">清晰度</p><div className="flex flex-col gap-1">{videoResolutionOptions(model, mode, baseUrl)?.map(res => <button key={res} type="button" className={`${choice(resolution === res)} flex-1`} aria-pressed={resolution === res} onClick={() => {
        const next = resolve({ resolution: res });
        onChange({ quality: next.resolution, duration: next.duration });
      }}>{videoResolutionLabel(model, res, baseUrl)}</button>)}</div></div>}
      {(!section || section === 'duration') && <div><p className="mb-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">时长<span>{videoDurationFollowsSource(model, mode) ? '跟随原视频' : `${duration} 秒`}</span></p>
        {!videoDurationFollowsSource(model, mode) && <div className={durations.length > 4 ? 'grid max-h-64 grid-cols-6 gap-1 overflow-y-auto' : 'flex max-h-64 flex-col gap-1 overflow-y-auto'}>{durations.map(seconds => <button key={seconds} type="button" aria-pressed={duration === seconds} className={`${choice(duration === seconds)} shrink-0 border-transparent text-center`} onClick={() => onChange({ duration: seconds })}>{seconds}s</button>)}</div>}
        {veoExtensionHint(model, mode, baseUrl) && <p className="mt-2 text-xs leading-relaxed text-slate-500">{veoExtensionHint(model, mode, baseUrl)}</p>}
        {isMetasoH3(model, baseUrl) && <label className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={config.contextIrEnabled ?? true} onChange={(event) => onChange({ contextIrEnabled: event.target.checked })} />
          <span>IR Context 优化素材理解与提示词表达 · 0.05元/次</span>
        </label>}
        <VideoGenerationCostNotice model={model} baseUrl={baseUrl} duration={duration} contextIrEnabled={config.contextIrEnabled ?? true} />
      </div>}
      {(!section || section === 'audio') && (profile?.audioSupport === 'controllable' ? <div><p className="mb-2 text-xs text-slate-500 dark:text-slate-400">生成音频</p><div className="grid grid-cols-1 gap-1">{[true, false].map(audio => <button key={String(audio)} type="button" className={choice((config.audio ?? true) === audio)} aria-pressed={(config.audio ?? true) === audio} onClick={() => onChange({ audio })}>{audio ? '开启' : '关闭'}</button>)}</div></div> : <p className="text-xs text-slate-400">声音由模型默认行为或提示词决定</p>)}
      {(!section || section === 'count') && <div><p className="mb-2 text-xs text-slate-500 dark:text-slate-400">生成数量</p><div className="grid grid-cols-3 gap-1.5">{[1, 2, 4].map(count => <button key={count} type="button" className={choice(config.count === count)} aria-pressed={config.count === count} onClick={() => onChange({ count })}>{count} 个</button>)}</div></div>}
    </div>}
  </section>;
}

function formatVideoTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 🌟 1:1 桥豆麻衣酱 SimpleVideoPlayer 视频播放器组件（无居中遮挡播放按钮，悬浮底部进度控制栏）
export const CanvasVideoPlayer: React.FC<{
  videoUrl: string;
  poster?: string;
  height?: number;
  showCenterPlayButton?: boolean;
  onExtractFrame?: (timeSec: number) => void;
  onLoadedMetadata?: (info: { videoWidth: number; videoHeight: number; duration: number }) => void;
}> = ({ videoUrl, poster, height, showCenterPlayButton = false, onExtractFrame, onLoadedMetadata }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<string | undefined>();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const syncDuration = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    syncDuration();
    video.addEventListener('durationchange', syncDuration);
    return () => video.removeEventListener('durationchange', syncDuration);
  }, [videoUrl]);

  const handleTogglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (time: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    const nextTime = Math.max(0, Math.min(time, v.duration));
    v.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const seek = (event: React.PointerEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!video || !rect.width) return;
    seekTo((event.clientX - rect.left) / rect.width * video.duration);
  };

  const progressPct = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
  const controlsVisible = isHovered || isPlaying || isScrubbing;

  return (
    <div
      tabIndex={0}
      style={{
        ...(height ? { height } : undefined),
        ...(aspectRatio ? { aspectRatio } : undefined),
      }}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      className={`simple-video-player relative w-full ${height || aspectRatio ? '' : 'aspect-[9/16] max-h-[520px]'} ${
        isPlaying ? 'is-playing' : ''
      } ${controlsVisible ? 'is-controls-visible' : ''} bg-[#222225] rounded-2xl overflow-hidden group/video flex items-center justify-center select-none`}
    >
      {showCenterPlayButton && !isPlaying && (
        <button
          type="button"
          onClick={handleTogglePlay}
          className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/45 hover:bg-black/60 backdrop-blur-xs text-white flex items-center justify-center transition-all duration-200 shadow-lg cursor-pointer z-10"
          title="播放视频"
        >
          <Play className="w-5 h-5 fill-white text-white ml-0.5" />
        </button>
      )}
      <video
        ref={videoRef}
        data-canvas-hover-playback="true"
        src={videoUrl}
        poster={poster}
        draggable={false}
        playsInline
        loop
        muted={isMuted}
        preload="metadata"
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;
          const dur = Number.isFinite(video.duration) ? video.duration : 0;
          setDuration(dur);
          if (videoWidth && videoHeight) setAspectRatio(`${videoWidth} / ${videoHeight}`);
          onLoadedMetadata?.({
            videoWidth,
            videoHeight,
            duration: dur,
          });
        }}
        className="w-full h-full object-contain select-none cursor-grab"
      />
      <div
        data-simple-video-controls="true"
        className="video-hover-controls nodrag"
        role="group"
        aria-label="视频播放控制"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="video-hover-action"
          title={isPlaying ? '暂停' : '播放'}
          aria-label={isPlaying ? '暂停' : '播放'}
          onClick={(e) => handleTogglePlay(e)}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-label="播放进度"
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={currentTime}
          className="video-progress-track nodrag touch-none"
          onPointerDown={(e) => {
            if (e.button !== 0 || !e.isPrimary) return;
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.focus({ preventScroll: true });
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsScrubbing(true);
            seek(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e);
          }}
          onLostPointerCapture={() => setIsScrubbing(false)}
          onKeyDown={(event) => {
            const time = videoRef.current?.currentTime ?? currentTime;
            const targets: Record<string, number> = {
              ArrowLeft: time - 1, ArrowDown: time - 1, ArrowRight: time + 1, ArrowUp: time + 1,
              Home: 0, End: videoRef.current?.duration ?? duration,
            };
            if (!Object.hasOwn(targets, event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            seekTo(targets[event.key]);
          }}
        >
          <div className="video-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="video-hover-time">
          {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
        </span>
        <button
          type="button"
          className="video-hover-action"
          title={isMuted ? '取消静音' : '静音'}
          aria-label={isMuted ? '取消静音' : '静音'}
          onClick={(e) => {
            e.stopPropagation();
            const next = !isMuted;
            setIsMuted(next);
            if (videoRef.current) videoRef.current.muted = next;
          }}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        {onExtractFrame && (
          <button
            type="button"
            className="video-hover-action video-hover-text-btn"
            onClick={(e) => {
              e.stopPropagation();
              onExtractFrame(videoRef.current?.currentTime ?? 0);
            }}
          >
            提取当前帧
          </button>
        )}
      </div>
    </div>
  );
};

function VideoRatioFrameIcon({ ratio }: { ratio: string }) {
  const clean = String(ratio || '').trim();
  const match =
    clean && clean !== 'adaptive' && clean !== 'smart' && clean !== 'Auto'
      ? clean.match(/^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i)
      : null;
  if (!match) {
    return (
      <svg width="12" height="12" viewBox="0 0 16 14" fill="none" className="shrink-0 opacity-90" aria-hidden="true">
        <path
          d="M1.5 4.2V2.4c0-.5.4-.9.9-.9H4.4M11.6 1.5h2c.5 0 .9.4.9.9v1.8M14.5 9.8v1.8c0 .5-.4.9-.9.9h-2M4.4 12.5H2.4c-.5 0-.9-.4-.9-.9V9.8"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="5" y="4" width="6" height="6" rx="0.8" stroke="currentColor" strokeWidth="1.55" />
      </svg>
    );
  }
  const w = Number(match[1]);
  const h = Number(match[2]);
  const maxDim = 12;
  let boxW = maxDim;
  let boxH = (h / w) * maxDim;
  if (boxH > maxDim) {
    boxH = maxDim;
    boxW = (w / h) * maxDim;
  }
  return (
    <span className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center" aria-hidden="true">
      <span
        className="box-border rounded-[1.5px] border-[1.5px] border-current"
        style={{ width: Math.max(5, boxW), height: Math.max(5, boxH) }}
      />
    </span>
  );
}

export function CanvasUnifiedVideoControls({
  config,
  model: selection,
  onChange,
}: {
  config: VideoConfig;
  model: string;
  onChange: (patch: Partial<VideoConfig>) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const model = upstreamModalityModelId('video', selection);
  const baseUrl = getGatewayClientBaseUrl(selection);
  const { mode, aspect: activeRatio, resolution: activeRes, duration } = resolveVideoParameters(model, {
    mode: config.refMode, aspect: config.aspect, resolution: config.quality, duration: config.duration,
  }, baseUrl);
  const locked = videoRatioLocked(model, mode, baseUrl);
  const caps = resolveVideoModelCapabilities(model, mode, activeRes, baseUrl);
  const activeModeObj =
    caps.modes.find((item) => item.id === mode) ||
    (mode === 'first_frame' ? caps.modes.find((item) => item.id === 'first_last_frame') : undefined) ||
    caps.modes[caps.modes.length - 1] || { id: mode, label: '全能参考' };
  const ratioLabel = activeRatio === 'adaptive' ? '自适应' : activeRatio;
  const resLabel = formatVideoResolutionPill(model, activeRes, baseUrl);
  const audioOn = config.audio ?? true;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target as Element).closest('[data-video-control]')) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        anchor.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const summaryParts = [
    caps.modes.length > 0 ? activeModeObj.label : '',
    ratioLabel,
    resLabel,
    videoDurationFollowsSource(model, mode) ? '原时长' : `${duration}s`,
  ].filter(Boolean);

  return (
    <>
      <div className="qiaodoumayi-gen-size-beside-model shrink-0 flex items-center gap-1 overflow-visible">
        <span className="qiaodoumayi-gen-model-size-divider" aria-hidden="true" />
        <button
          ref={anchor}
          type="button"
          data-video-control
          data-gen-dropdown-type="video-settings"
          aria-label="视频生成参数"
          title="生成方式 / 比例 / 清晰度 / 生成时长"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
          className={`node-dropdown-button flex items-center gap-1.5 rounded-[9px] px-2 py-1 text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
            open ? 'bg-black/[0.06] text-zinc-950 dark:bg-white/[0.1] dark:text-white' : ''
          }`}
        >
          <VideoRatioFrameIcon ratio={activeRatio} />
          <span>{summaryParts.join(' · ')}</span>
          {caps.supportsAudio && audioOn && <Volume2 size={12} className="ml-0.5 shrink-0 opacity-85" aria-label="已开启生成音频" />}
        </button>
      </div>

      {open && (
        <CanvasVideoPopover anchor={anchor} width={352}>
          <div
            data-video-control
            role="dialog"
            aria-label="视频生成参数"
            className="qiaodoumayi-gen-ratio-panel qiaodoumayi-gen-size-panel qiaodoumayi-gen-video-settings-panel"
          >
            <div className="qiaodoumayi-gen-ratio-panel-content qiaodoumayi-gen-size-panel-content space-y-3">
              {caps.modes.length > 0 && (
                <div className="qiaodoumayi-gen-size-section">
                  <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                    <span className="shrink-0 text-[11px] font-semibold tracking-[0.01em] text-zinc-500 dark:text-zinc-400">
                      生成方式
                    </span>
                    {activeModeObj.desc && (
                      <span className="truncate text-[10px] text-zinc-400 dark:text-zinc-500" title={activeModeObj.desc}>
                        {activeModeObj.desc}
                      </span>
                    )}
                  </div>
                  <div
                    role="tablist"
                    aria-label="生成方式"
                    style={{ gridTemplateColumns: `repeat(${caps.modes.length >= 5 ? 3 : caps.modes.length}, minmax(0, 1fr))` }}
                    className="qiaodoumayi-gen-quality-pills grid gap-1 rounded-[12px] bg-zinc-100 p-1 dark:bg-black/40"
                  >
                    {caps.modes.map((item) => {
                      const active = activeModeObj.id === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          title={item.desc || item.label}
                          aria-selected={active}
                          onClick={() => {
                            const next = resolveVideoParameters(model, { mode: item.id, aspect: activeRatio, resolution: activeRes, duration }, baseUrl);
                            onChange({ refMode: next.mode, aspect: next.aspect, quality: next.resolution, duration: next.duration });
                          }}
                          className={`flex items-center justify-center rounded-[9px] px-1 py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/[0.14] dark:text-white'
                              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                          }`}
                        >
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="qiaodoumayi-gen-size-section">
                <div className="qiaodoumayi-gen-popover-label text-zinc-500 dark:text-zinc-400">
                  比例{locked ? ' · 跟随原素材' : ''}
                </div>
                <div className="qiaodoumayi-gen-ratio-grid">
                  <div className="grid grid-cols-5 gap-2">
                    {(locked ? ['adaptive'] : caps.ratios).map((ratio) => {
                      const [w, h] = ratio.includes(':') ? ratio.split(':').map(Number) : [1, 1];
                      const selected = activeRatio === ratio;
                      return (
                        <button
                          key={ratio}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onChange({ aspect: ratio })}
                          className={`flex min-h-[54px] flex-col items-center justify-center gap-1.5 rounded-[9px] border px-1 py-1.5 text-[10px] font-medium transition-colors cursor-pointer ${
                            selected
                              ? 'border-zinc-900 bg-zinc-900/[0.06] text-zinc-950 dark:border-white/75 dark:bg-white/[0.12] dark:text-white'
                              : 'border-zinc-200/90 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-white/[0.16] dark:text-zinc-300 dark:hover:border-white/40 dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex h-5 w-6 items-center justify-center">
                            {ratio === 'adaptive' ? (
                              <VideoRatioFrameIcon ratio="adaptive" />
                            ) : (
                              <div
                                className="rounded-[2px] border-[1.6px] border-current"
                                style={{ width: (20 * w) / Math.max(w, h), height: (20 * h) / Math.max(w, h) }}
                              />
                            )}
                          </div>
                          <span className="leading-none">{ratio === 'adaptive' ? '自适应' : ratio}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {caps.resolutions.length > 0 && (
                <div className="qiaodoumayi-gen-size-section">
                  <div className="qiaodoumayi-gen-popover-label text-zinc-500 dark:text-zinc-400">清晰度</div>
                  <div
                    role="tablist"
                    aria-label="清晰度"
                    style={{ gridTemplateColumns: `repeat(${caps.resolutions.length}, minmax(0, 1fr))` }}
                    className="qiaodoumayi-gen-quality-pills grid gap-1 rounded-[12px] bg-zinc-100 p-1 dark:bg-black/40"
                  >
                    {caps.resolutions.map((res) => {
                      const active = activeRes === res;
                      return (
                        <button
                          key={res}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => {
                            const next = resolveVideoParameters(model, { mode, aspect: activeRatio, resolution: res, duration }, baseUrl);
                            onChange({ quality: next.resolution, duration: next.duration });
                          }}
                          className={`flex items-center justify-center rounded-[9px] py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/[0.14] dark:text-white'
                              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                          }`}
                        >
                          <span>{formatVideoResolutionPill(model, res, baseUrl)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!videoDurationFollowsSource(model, mode) && caps.durations.length > 0 && (() => {
                const presetDurations =
                  caps.durations.length > 12
                    ? [4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30].filter((d) => caps.durations.includes(d))
                    : caps.durations;
                const cols = Math.min(6, Math.max(1, presetDurations.length));
                return (
                  <div className="qiaodoumayi-gen-size-section">
                    <div className="mb-2 flex items-center justify-between px-0.5">
                      <span className="text-[11px] font-semibold tracking-[0.01em] text-zinc-500 dark:text-zinc-400">
                        生成时长
                      </span>
                      {caps.customDurationBounds ? (
                        <label className="flex items-center gap-1 rounded-[8px] border border-zinc-200/90 bg-zinc-100/90 px-2 py-0.5 text-[11px] text-zinc-500 dark:border-white/[0.12] dark:bg-black/40 dark:text-zinc-400">
                          <span>自定义</span>
                          <input
                            type="number"
                            aria-label="自定义时长秒数"
                            min={caps.customDurationBounds.min}
                            max={caps.customDurationBounds.max}
                            value={duration}
                            onChange={(e) => {
                              const v = Math.round(Number(e.target.value));
                              if (Number.isFinite(v)) {
                                const clamped = Math.max(
                                  caps.customDurationBounds!.min,
                                  Math.min(caps.customDurationBounds!.max, v),
                                );
                                onChange({ duration: clamped });
                              }
                            }}
                            className="w-7 bg-transparent text-center text-[11px] font-semibold text-zinc-900 outline-none dark:text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <span>s</span>
                        </label>
                      ) : (
                        <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{duration}s</span>
                      )}
                    </div>
                    <div
                      role="tablist"
                      aria-label="生成时长"
                      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                      className="qiaodoumayi-gen-quality-pills grid gap-1 rounded-[12px] bg-zinc-100 p-1 dark:bg-black/40"
                    >
                      {presetDurations.map((sec) => {
                        const active = duration === sec;
                        return (
                          <button
                            key={sec}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => onChange({ duration: sec })}
                            className={`flex items-center justify-center rounded-[9px] px-1 py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                              active
                                ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/[0.14] dark:text-white'
                                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                          >
                            <span>{sec}s</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {caps.supportsAudio && (
                <div className="qiaodoumayi-gen-size-section">
                  <div className="qiaodoumayi-gen-popover-label text-zinc-500 dark:text-zinc-400">生成音频</div>
                  <div
                    role="tablist"
                    aria-label="生成音频"
                    className="qiaodoumayi-gen-quality-pills grid grid-cols-2 gap-1 rounded-[12px] bg-zinc-100 p-1 dark:bg-black/40"
                  >
                    {[
                      { value: true, label: '开启' },
                      { value: false, label: '关闭' },
                    ].map((opt) => {
                      const active = audioOn === opt.value;
                      return (
                        <button
                          key={String(opt.value)}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => onChange({ audio: opt.value })}
                          className={`flex items-center justify-center rounded-[9px] py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/[0.14] dark:text-white'
                              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                          }`}
                        >
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CanvasVideoPopover>
      )}
    </>
  );
}
