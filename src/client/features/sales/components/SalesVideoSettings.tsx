import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, SlidersHorizontal, X } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { PromptBarVideoTab, videoParamModeLabel } from '@client/shared/prompt-bar/controls/preferences/PromptBarVideoTab';
import { usePromptBarPopoverLayout } from '@client/shared/prompt-bar/hooks/usePromptBarPopoverLayout';
import { getVideoModelById } from '@shared/domain/media/video';
import { videoRatioLocked, videoResolutionLabel } from '@shared/domain/media/videoCapabilities';
import type { ModalityPickerSelection } from '@shared/domain/models/modalityStorage';
import type { SalesReferenceSlot, SalesScriptDomain } from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { resolveSalesVideoSettings } from '../model/salesVideoSettings';
import { salesFocusClass } from './salesChrome';

interface Props {
  plan: SalesProductionPlanState;
  script: SalesScriptDomain;
  videoModels: readonly ModalityPickerSelection[];
  references: readonly SalesReferenceSlot[];
  disabled: boolean;
  isUp?: boolean;
  onPatchPlan: (patch: Partial<SalesProductionPlanState>) => void;
}

export function SalesVideoSettings({ plan, script, videoModels, references, disabled, isUp = true, onPatchPlan }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const settings = useMemo(() => resolveSalesVideoSettings(plan, script, references), [plan, script, references]);
  const profile = getVideoModelById(settings.model);
  const options = useMemo(() => videoModels.map((item) => ({ ...item, upstreamId: item.modelId })), [videoModels]);
  const selected = options.find((item) => item.id === plan.videoModel || item.modelId === plan.videoModel);
  const pickerOptions = selected ? options : [{ id: plan.videoModel, upstreamId: settings.model, name: `${profile?.name || settings.model}（已保存）` }, ...options];
  const visible = open && !disabled;
  const { panelRef, panelStyle } = usePromptBarPopoverLayout(visible, isUp, triggerRef, 460, 460, false, true);

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
  const resText = videoResolutionLabel(settings.model, settings.resolution);

  return (
    <div className="sales-video-settings-inline">
      <ConfiguredModelPicker
        options={pickerOptions}
        value={selected?.id || plan.videoModel}
        disabled={disabled}
        ariaLabel="视频生成模型"
        modalityKind="video"
        variant="agent"
        isUp={isUp}
        onChange={(videoModel) => onPatchPlan({ videoModel, videoRefMode: '', videoResolution: '', videoDurationSec: 0, customPrompt: '' })}
      />
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
          {videoParamModeLabel(settings.refMode)} · {ratioText} · {resText} · {settings.durationSec}s
        </span>
        <ChevronUp size={12} className={`sales-dropup-caret ${visible ? 'rotate-180' : ''}`} aria-hidden />
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
            supportedAspectRatios={videoRatioLocked(settings.model, settings.refMode) ? ['adaptive'] : profile?.supportedAspectRatios}
            supportedResolutions={profile?.supportedResolutions}
            supportedDurations={settings.supportedDurations}
            mode={settings.refMode}
            aspect={settings.aspectRatio}
            resolution={settings.resolution}
            duration={settings.durationSec}
            onMode={(videoRefMode) => onPatchPlan({ videoRefMode, videoDurationSec: 0, customPrompt: '' })}
            onAspect={(videoAspectRatio) => onPatchPlan({ videoAspectRatio, customPrompt: '' })}
            onResolution={(videoResolution) => onPatchPlan({ videoResolution, videoDurationSec: 0 })}
            onDuration={(videoDurationSec) => onPatchPlan({ videoDurationSec })}
          />
          <p className="mt-3 text-xs text-stone-500 dark:text-zinc-400">脚本约 {script.durationSec} 秒，时长选项会保留完整分镜。</p>
          {settings.validationError && <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">{settings.validationError}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
