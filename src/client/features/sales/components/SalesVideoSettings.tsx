import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, SlidersHorizontal, X } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { PromptBarVideoTab, videoParamModeLabel } from '@client/shared/prompt-bar/controls/preferences/PromptBarVideoTab';
import { usePromptBarPopoverLayout } from '@client/shared/prompt-bar/hooks/usePromptBarPopoverLayout';
import { getVideoModelById } from '@shared/domain/media/video';
import { videoDurationOptions, videoRatioLocked, videoResolutionLabel } from '@shared/domain/media/videoCapabilities';
import type { ModalityPickerSelection } from '@shared/domain/models/modalityStorage';
import type { SalesReferenceSlot, SalesScriptDomain } from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { resolveSalesVideoSettings } from '../model/salesVideoSettings';
import { salesVideoModelPatch } from '../model/salesVideoCompatibility';
import { salesFocusClass } from './salesChrome';

interface Props {
  plan: SalesProductionPlanState;
  script: SalesScriptDomain;
  videoModels: readonly ModalityPickerSelection[];
  references: readonly SalesReferenceSlot[];
  audios?: readonly string[];
  disabled: boolean;
  isUp?: boolean;
  planning?: boolean;
  onPatchPlan: (patch: Partial<SalesProductionPlanState>) => void;
}

export function SalesVideoSettings({ plan, script, videoModels, references, audios, disabled, isUp = true, planning = false, onPatchPlan }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const settings = useMemo(() => resolveSalesVideoSettings(plan, script, references, audios), [plan, script, references, audios]);
  const profile = getVideoModelById(settings.model, settings.baseUrl);
  const options = useMemo(() => videoModels.map((item) => ({ ...item, upstreamId: item.modelId })), [videoModels]);
  const selected = options.find((item) => item.id === plan.videoModel || item.modelId === plan.videoModel);
  const pickerOptions = selected ? options : [{ id: plan.videoModel, upstreamId: settings.model, name: `${profile?.name || settings.model}（已保存）` }, ...options];
  const visible = open && !disabled;
  const { panelRef, opensUp, panelStyle } = usePromptBarPopoverLayout(visible, planning ? 'below' : isUp, triggerRef, 460, 460, false, true);

  const caretPointsDown = visible ? opensUp : planning || !isUp;

  useEffect(() => {
    if (!visible) return;
    const closeOutside = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [visible, panelRef]);

  const ratioText = settings.aspectRatio === 'adaptive' ? '智能画幅' : settings.aspectRatio;
  const resText = videoResolutionLabel(settings.model, settings.resolution, settings.baseUrl);
  // A shorter choice replans the production timeline; the current script is not the slider's lower bound.
  const durations = videoDurationOptions(settings.model, settings.resolution, settings.refMode, settings.baseUrl);
  const durationSec = planning
    ? (durations.includes(plan.videoDurationSec) ? plan.videoDurationSec : durations.find((value) => value >= Math.ceil(script.durationSec)) || durations.at(-1) || settings.durationSec)
    : settings.durationSec;
  const durationLabel = durations.includes(durationSec) ? `${durationSec}s` : '时长不兼容';
  const patchVideoParameters = (patch: Partial<SalesProductionPlanState>) => {
    const next = resolveSalesVideoSettings({ ...plan, ...patch }, script, references, audios);
    const nextDurations = videoDurationOptions(next.model, next.resolution, next.refMode, next.baseUrl);
    onPatchPlan({ ...patch, videoDurationSec: nextDurations.includes(durationSec) ? durationSec : 0 });
  };

  return (
    <div className="sales-video-settings-inline">
      {planning && <h3 className="sales-sb-group-title">成片设置</h3>}
      <span className={planning ? 'sales-sb-field-label' : 'sales-delivery-setting-label'}>{planning ? '成片模型' : '模型选择'}</span>
      <ConfiguredModelPicker
        options={pickerOptions}
        value={selected?.id || plan.videoModel}
        disabled={disabled}
        ariaLabel="视频生成模型"
        modalityKind="video"
        variant={planning ? 'default' : 'agent'}
        className={planning ? 'sales-sb-model-picker' : undefined}
        isUp={isUp}
        onChange={(videoModel) => onPatchPlan(salesVideoModelPatch(videoModel, { plan, script, references, audios }))}
      />
      <span className={planning ? 'sales-sb-field-label' : 'sales-delivery-setting-label'}>{planning ? '生成参数' : '模型设置'}</span>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={visible}
        aria-controls={menuId}
        aria-label="视频生成参数"
        onClick={() => setOpen((value) => !value)}
        className={`sales-dropup-btn ${salesFocusClass}`}
      >
        <SlidersHorizontal size={12} className="text-[var(--sales-muted)]" aria-hidden />
        <span className="sales-dropup-val">
          {videoParamModeLabel(settings.refMode)} · {ratioText} · {resText} · {durationLabel}
        </span>
        <ChevronUp size={12} className={`sales-dropup-caret ${caretPointsDown ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {visible && createPortal(
        <div
          ref={panelRef}
          id={menuId}
          role="dialog"
          aria-label="视频生成参数"
          tabIndex={-1}
          style={panelStyle}
          className="fixed z-[10010] overflow-y-auto rounded-[6px] border border-stone-300 bg-white p-4 shadow-xl outline-none dark:border-zinc-700 dark:bg-[#181818]"
        >
          <div className="mb-3 flex items-center justify-between text-xs font-semibold text-stone-900 dark:text-zinc-100">
            <span>视频生成参数</span>
            <button type="button" aria-label="关闭视频参数" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} className={`rounded p-1 ${salesFocusClass}`}>
              <X size={15} />
            </button>
          </div>
          <PromptBarVideoTab
            modelId={settings.model}
            baseUrl={settings.baseUrl}
            supportedAspectRatios={videoRatioLocked(settings.model, settings.refMode) ? ['adaptive'] : profile?.supportedAspectRatios}
            supportedResolutions={settings.supportedResolutions}
            supportedDurations={durations}
            mode={settings.refMode}
            aspect={settings.aspectRatio}
            resolution={settings.resolution}
            duration={durationSec}
            contextIrEnabled={plan.videoContextIrEnabled ?? true}
            onContextIrEnabled={(videoContextIrEnabled) => onPatchPlan({ videoContextIrEnabled })}
            onMode={(videoRefMode) => patchVideoParameters({ videoRefMode, customPrompt: '' })}
            onAspect={(videoAspectRatio) => onPatchPlan({ videoAspectRatio, customPrompt: '' })}
            onResolution={(videoResolution) => patchVideoParameters({ videoResolution })}
            onDuration={(videoDurationSec) => onPatchPlan({ videoDurationSec })}
          />
          <p className="mt-3 text-xs text-stone-500 dark:text-zinc-400">{planning
            ? `当前模型在此配置下最长支持 ${Math.max(...durations)} 秒。超过时长时按原时序保留前面的完整动作段，口播与字幕仅按保留段适配，余时自然收势。`
            : `本次分镜约 ${script.durationSec} 秒。缩短时长会按原时序保留前面的完整动作段，口播和字幕需按保留段重新核对。`}</p>
          {settings.validationError && (!planning || settings.validationError !== settings.durationError) && <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">{settings.validationError}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
