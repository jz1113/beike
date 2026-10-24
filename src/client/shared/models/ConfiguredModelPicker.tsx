import { useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  agentTriggerModelName,
  PromptBarModelPickerModal,
} from '@client/shared/prompt-bar/controls/PromptBarModelPickerModal';
import { listModelChannels } from '@client/shared/prompt-bar/controls/modelPickerChannels';
import type { PreferenceModelItem } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import { upstreamModelId } from '@shared/domain/models/workflowModels';

export interface ConfiguredModelPickerOption {
  id: string;
  name?: string;
  shortName?: string;
  provider?: string;
  upstreamId?: string;
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  supportedDurations?: number[];
}

export interface ConfiguredModelPickerProps {
  options: readonly ConfiguredModelPickerOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  modalityKind?: 'chat' | 'image' | 'video' | 'audio';
  isUp?: boolean;
  emptyLabel?: string;
  className?: string;
}

function splitModelNameAndChannel(rawName: string, explicitProvider?: string) {
  const parts = rawName.split(' · ').map((part) => part.trim()).filter(Boolean);
  const name = parts[0] || rawName.trim();
  const inferredChannel = parts.length > 1 ? parts.slice(1).join(' · ') : '';
  const provider = explicitProvider?.trim() || inferredChannel || undefined;
  return { name, provider };
}

function modalityKindFallback(id: string, modalityKind: 'chat' | 'image' | 'video' | 'audio'): string {
  if (modalityKind === 'image' || modalityKind === 'video') {
    return upstreamModalityModelId(modalityKind, id) || upstreamModelId(id);
  }
  const resolved = selectedTextModel(id).modelId;
  return (resolved ? upstreamModelId(resolved) : upstreamModelId(id)).replace(/^deepseek:/, '');
}

export function toPreferenceModelItems(
  options: readonly ConfiguredModelPickerOption[],
  desc: string,
  modalityKind: 'chat' | 'image' | 'video' | 'audio' = 'chat',
): PreferenceModelItem[] {
  return options.map((option) => {
    const rawName = option.name || option.shortName || option.id;
    const { name, provider } = splitModelNameAndChannel(rawName, option.provider);
    const resolvedUpstream = option.upstreamId
      || (modalityKindFallback(option.id, modalityKind) || upstreamModelId(option.id));
    return {
      id: option.id,
      name,
      desc,
      ...(provider ? { provider } : {}),
      ...(option.supportedAspectRatios ? { supportedAspectRatios: option.supportedAspectRatios } : {}),
      ...(option.supportedResolutions ? { supportedResolutions: option.supportedResolutions } : {}),
      ...(option.supportedDurations ? { supportedDurations: option.supportedDurations } : {}),
      upstreamId: resolvedUpstream,
    };
  });
}

export function ConfiguredModelPicker({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  modalityKind = 'chat',
  isUp = false,
  emptyLabel = '未配置模型',
  className = '',
}: ConfiguredModelPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const models = useMemo(
    () => toPreferenceModelItems(options, ariaLabel, modalityKind),
    [options, ariaLabel, modalityKind],
  );
  const channels = useMemo(() => listModelChannels(models), [models]);
  const selected = useMemo(
    () => models.find((item) => item.id === value || item.upstreamId === value) || models[0],
    [models, value],
  );
  const upstream = selected?.upstreamId || selected?.id || '';
  const label = selected ? agentTriggerModelName(upstream, selected.name) : emptyLabel;
  const isDisabled = disabled || models.length === 0;

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={open && !isDisabled}
        aria-label={ariaLabel}
        title={selected ? (selected.provider ? `${label} · ${selected.provider}` : label) : emptyLabel}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border bg-white/95 px-3 text-xs font-semibold text-slate-800 shadow-2xs transition-all disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#1B1C20]/95 dark:text-slate-100 ${
          open && !isDisabled
            ? 'border-indigo-400 ring-2 ring-indigo-500/15 dark:border-indigo-400/60'
            : 'border-slate-200/90 hover:border-indigo-300 dark:border-white/10 dark:hover:border-indigo-400/40'
        } ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected && <ModelIcon modelId={upstream} className="h-4 w-4 shrink-0" />}
          <span className="truncate">{label}</span>
          {selected?.provider && channels.length > 1 && (
            <span className="hidden shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:inline dark:bg-white/[0.07] dark:text-slate-400">
              {selected.provider}
            </span>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open && !isDisabled ? 'rotate-180' : ''}`} />
      </button>
      <PromptBarModelPickerModal
        isOpen={open && !isDisabled}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        isUp={isUp}
        models={models}
        selectedModelId={selected?.id || value}
        modalityKind={modalityKind}
        onSelectModel={(modelId) => {
          onChange(modelId);
          setOpen(false);
        }}
      />
    </div>
  );
}
