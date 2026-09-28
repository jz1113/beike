import { useEffect, useRef, useState } from 'react';
import { getVideoModelById } from '@shared/domain/media/video';
import { videoModeLabel, videoRatioLocked, videoResolutionLabel } from '@shared/domain/media/videoCapabilities';
import type { CanvasNode } from '../model/types';
import { CanvasVideoSettings } from './CanvasVideoSettings';
import { CanvasVideoPopover } from './CanvasVideoPopover';

type Config = NonNullable<CanvasNode['drawing']>;
type Panel = 'aspect' | 'duration' | 'quality' | 'reference' | 'audio' | 'count';

export function CanvasVideoControls({ config, model, onChange }: { config: Config; model: string; onChange: (patch: Partial<Config>) => void }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const profile = getVideoModelById(model);
  const mode = config.refMode || 'omni';
  const locked = videoRatioLocked(model, mode);
  useEffect(() => {
    if (!panel) return;
    const dismiss = (event: PointerEvent) => { if (!(event.target as Element).closest('[data-video-control]')) setPanel(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPanel(null); anchor.current?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape, true); };
  }, [panel]);
  const items: { id: Panel; label: string; value: string }[] = [
    { id: 'aspect', label: '视频比例', value: locked || config.aspect === 'adaptive' ? '自动' : config.aspect },
    { id: 'duration', label: '视频时长', value: mode === 'edit' ? '原时长' : `${config.duration ?? 5}s` },
    { id: 'quality', label: '视频分辨率', value: videoResolutionLabel(model, config.quality) },
    { id: 'reference', label: '视频参考方式', value: videoModeLabel(mode) },
    ...(profile?.audioSupport === 'controllable' ? [{ id: 'audio' as const, label: '视频声音', value: `声音 ${(config.audio ?? true) ? '开' : '关'}` }] : []),
    { id: 'count', label: '视频数量', value: `${config.count} 个` },
  ];
  return <>
    {items.map(item => <button key={item.id} type="button" data-video-control aria-label={item.label} aria-expanded={panel === item.id} aria-haspopup="dialog" onClick={event => { anchor.current = event.currentTarget; setPanel(panel === item.id ? null : item.id); }} className={`flex h-8 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-slate-400 ${panel === item.id ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}>
      {item.value}
    </button>)}
    {panel && <CanvasVideoPopover key={panel} anchor={anchor} width={panel === 'aspect' ? 312 : panel === 'reference' ? 280 : panel === 'count' ? 176 : 136}><div data-video-control>
      <CanvasVideoSettings config={config} model={model} modesOnly={panel === 'reference'} section={panel === 'reference' ? undefined : panel} onChange={patch => { onChange(patch); setPanel(null); anchor.current?.focus(); }} />
    </div></CanvasVideoPopover>}
  </>;
}
