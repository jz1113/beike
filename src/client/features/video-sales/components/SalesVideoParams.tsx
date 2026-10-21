import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AspectRatioCardGroup } from '@client/shared/prompt-bar/controls/preferences/AspectRatioCardGroup';
import { usePromptBarPopoverLayout } from '@client/shared/prompt-bar/hooks/usePromptBarPopoverLayout';
import { videoResolutionLabel } from '@shared/domain/media/videoCapabilities';
import { DURATION_OPTIONS } from './salesPlanning';
import {
  salesAspectOptions,
  salesDurationEnabled,
  salesParamSummary,
  salesRefModeChoices,
  salesResolutionChoices,
  salesResolveRefMode,
  salesResolveResolution,
  type SalesAspectRatio,
  type SalesVideoRefMode,
} from '../model/salesWorkspace';

interface Props {
  modelId: string;
  refMode: SalesVideoRefMode;
  aspectRatio: SalesAspectRatio;
  resolution: string;
  targetDuration: number;
  disabled: boolean;
  onChange: (patch: { videoRefMode?: SalesVideoRefMode; aspectRatio?: SalesAspectRatio; videoResolution?: string; targetDuration?: number }) => void;
}

function choiceClass(selected: boolean) {
  return `px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 ${
    selected
      ? 'bg-white dark:bg-white/15 text-slate-950 dark:text-white shadow-xs'
      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
  }`;
}

export function SalesVideoParams({ modelId, refMode, aspectRatio, resolution, targetDuration, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { panelRef, opensUp, panelStyle } = usePromptBarPopoverLayout(open, true, buttonRef, 400, 520);
  const modes = salesRefModeChoices(modelId);
  const aspects = salesAspectOptions(modelId);
  const resolutions = salesResolutionChoices(modelId);
  const summary = salesParamSummary({ refMode, aspect: aspectRatio, resolution, duration: targetDuration });

  useEffect(() => {
    const nextMode = salesResolveRefMode(modelId, refMode);
    const nextResolution = salesResolveResolution(modelId, resolution);
    const patch: { videoRefMode?: SalesVideoRefMode; videoResolution?: string } = {};
    if (nextMode !== refMode) patch.videoRefMode = nextMode;
    if (nextResolution !== resolution) patch.videoResolution = nextResolution;
    if (patch.videoRefMode || patch.videoResolution) onChange(patch);
  }, [modelId, refMode, resolution, onChange]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, panelRef]);

  return (
    <div className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={summary}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          open
            ? 'bg-white text-slate-900 ring-1 ring-black/[0.08] dark:bg-[#2C2C32] dark:text-white dark:ring-white/15'
            : 'bg-black/[0.04] text-slate-500 hover:text-slate-900 dark:bg-white/[0.06] dark:text-[#8E8E93] dark:hover:text-[#EDEDED]'
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="视频生成参数"
          style={panelStyle}
          className={`absolute z-50 overflow-y-auto rounded-3xl border border-slate-200/90 bg-white/95 p-4 text-left shadow-[0_20px_50px_rgba(0,0,0,0.15)] backdrop-blur-xl [scrollbar-width:thin] dark:border-white/10 dark:bg-[#18191c]/95 dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] ${
            opensUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
          }`}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">模式选择</div>
              <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100/80 p-1 dark:bg-white/5">
                {modes.map((item) => (
                  <button key={item.id} type="button" disabled={disabled} onClick={() => onChange({ videoRefMode: item.id })} className={`min-w-fit flex-1 text-center ${choiceClass(refMode === item.id)}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">画面比例</div>
              <AspectRatioCardGroup
                value={aspectRatio}
                options={aspects}
                onChange={(aspect) => {
                  if (aspect === '9:16' || aspect === '3:4' || aspect === '16:9' || aspect === '1:1') onChange({ aspectRatio: aspect });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">视频分辨率</div>
              <div className="flex gap-1 rounded-2xl bg-slate-100/80 p-1 dark:bg-white/5">
                {resolutions.map((item) => (
                  <button key={item} type="button" disabled={disabled} onClick={() => onChange({ videoResolution: item })} className={`flex-1 ${choiceClass(resolution === item)}`}>
                    {videoResolutionLabel(modelId, item)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">成片时长</div>
              <div className="flex gap-1 rounded-2xl bg-slate-100/80 p-1 dark:bg-white/5" role="radiogroup" aria-label="成片时长">
                {DURATION_OPTIONS.map((item) => (
                  <button key={item.value} type="button" role="radio" aria-checked={targetDuration === item.value} disabled={disabled || !salesDurationEnabled(modelId, item.value)} onClick={() => onChange({ targetDuration: item.value })} className={`flex-1 ${choiceClass(targetDuration === item.value)}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
