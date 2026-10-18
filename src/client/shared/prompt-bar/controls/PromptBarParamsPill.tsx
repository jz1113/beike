import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePromptBarPopoverLayout } from '../hooks/usePromptBarPopoverLayout';
import {
  loadPromptPreferences,
  savePromptPreferences,
  type ImageInferenceStrength,
  type ImageResolutionOption,
  type PromptComposerPreferences,
  type VideoAspectOption,
} from '../promptBarPreferencesTypes';
import { PromptBarVideoTab } from './preferences/PromptBarVideoTab';
import { PromptBarImageTab, imageResolutionLabel, inferenceStrengthLabel, qualityForResolution } from './preferences/PromptBarImageTab';
import { PromptBarAudioTab } from './preferences/PromptBarAudioTab';
import { videoParamModeLabel } from './preferences/PromptBarVideoTab';
import type { QuickGenMode } from '@shared/domain/media/depthVideo';
import { resolveVideoResolution } from '@shared/domain/media/video';

interface PromptBarParamsPillProps {
  isUp: boolean;
  quickGenMode: QuickGenMode;
  modelId: string;
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  quickVideoRefMode: string;
  quickVideoAspectId: string;
  quickVideoResolution: string;
  quickVideoDuration: number;
  setQuickVideoRefMode: (mode: string) => void;
  setQuickVideoAspectId: (aspect: string) => void;
  setQuickVideoResolution: (resolution: '480P' | '720P' | '1080P' | '4K') => void;
  setQuickVideoDuration: (seconds: number) => void;
  quickAspectId: string;
  quickQuality: string;
  setQuickAspectId: (aspect: string) => void;
  setQuickQuality: (quality: 'high' | 'medium' | 'low') => void;
}

export function PromptBarParamsPill(props: PromptBarParamsPillProps) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<PromptComposerPreferences>(() => loadPromptPreferences());
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { panelRef, opensUp, panelStyle } = usePromptBarPopoverLayout(open, props.isUp, buttonRef, 480, 560);

  useEffect(() => {
    const saved = loadPromptPreferences();
    if (saved.image.aspect) props.setQuickAspectId(saved.image.aspect);
    props.setQuickQuality(qualityForResolution(saved.image.resolution));
    const videoAspect = saved.video.aspect === 'smart' ? 'adaptive' : saved.video.aspect;
    if (videoAspect) props.setQuickVideoAspectId(videoAspect);
    if (saved.video.resolution) props.setQuickVideoResolution(resolveVideoResolution(saved.video.resolution, props.supportedResolutions));
    if (saved.video.customDurationSec) props.setQuickVideoDuration(saved.video.customDurationSec);
    // 只在输入栏挂载时把已保存的参数同步进当前创作状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const persist = (next: PromptComposerPreferences) => {
    setPrefs(next);
    savePromptPreferences(next);
  };

  const isVideo = props.quickGenMode === 'video' || props.quickGenMode === 'depth-video';
  const isAudio = props.quickGenMode === 'audio';
  const aspectLabel = props.quickVideoAspectId === 'adaptive' || props.quickVideoAspectId === 'smart' ? '智能' : props.quickVideoAspectId;
  const imageAspectLabel = props.quickAspectId === 'smart' ? '智能' : props.quickAspectId;
  const summary = isAudio
    ? `${(prefs.audio?.format || 'mp3').toUpperCase()} · ${(prefs.audio?.speed ?? 1).toFixed(1)}x`
    : isVideo
      ? `${videoParamModeLabel(props.quickVideoRefMode)} · ${aspectLabel} · ${props.quickVideoResolution} · ${props.quickVideoDuration}秒`
      : `${imageAspectLabel} · ${imageResolutionLabel(props.quickQuality)} · ${inferenceStrengthLabel(prefs.image.inferenceStrength)}`;

  return (
    <div className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 min-w-0 max-w-[240px] cursor-pointer items-center gap-0.5 rounded-lg px-1 text-[13px] transition-colors ${
          open
            ? 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-500 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-300'
        }`}
        title={summary}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className={`absolute z-50 overflow-y-auto rounded-3xl border border-slate-200/90 bg-white/95 p-4 text-left shadow-[0_20px_50px_rgba(0,0,0,0.15)] backdrop-blur-xl [scrollbar-width:thin] animate-fade-in dark:border-white/10 dark:bg-[#18191c]/95 dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] ${
            opensUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
          }`}
        >
          {isAudio ? (
            <PromptBarAudioTab
              prefs={prefs}
              models={[]}
              updateAudioPrefs={(patch) => persist({ ...prefs, audio: { ...prefs.audio, ...patch } })}
            />
          ) : isVideo ? (
            <PromptBarVideoTab
              modelId={props.modelId}
              supportedAspectRatios={props.supportedAspectRatios}
              supportedResolutions={props.supportedResolutions}
              mode={props.quickVideoRefMode}
              aspect={props.quickVideoAspectId}
              resolution={props.quickVideoResolution}
              duration={props.quickVideoDuration}
              onMode={props.setQuickVideoRefMode}
              onAspect={(aspect) => {
                props.setQuickVideoAspectId(aspect);
                persist({ ...prefs, video: { ...prefs.video, aspect: (aspect === 'adaptive' ? 'smart' : aspect) as VideoAspectOption } });
              }}
              onResolution={(resolution) => {
                props.setQuickVideoResolution(resolution);
                persist({ ...prefs, video: { ...prefs.video, resolution } });
              }}
              onDuration={(seconds) => {
                props.setQuickVideoDuration(seconds);
                persist({ ...prefs, video: { ...prefs.video, durationMode: 'custom', customDurationSec: seconds } });
              }}
            />
          ) : (
            <PromptBarImageTab
              aspect={props.quickAspectId}
              resolution={imageResolutionLabel(props.quickQuality)}
              strength={prefs.image.inferenceStrength}
              onAspect={(aspect) => {
                props.setQuickAspectId(aspect);
                persist({ ...prefs, image: { ...prefs.image, aspect: aspect as PromptComposerPreferences['image']['aspect'] } });
              }}
              onResolution={(resolution: ImageResolutionOption) => {
                props.setQuickQuality(qualityForResolution(resolution));
                persist({ ...prefs, image: { ...prefs.image, resolution } });
              }}
              onStrength={(strength: ImageInferenceStrength) => persist({ ...prefs, image: { ...prefs.image, inferenceStrength: strength } })}
            />
          )}
        </div>
      )}
    </div>
  );
}
