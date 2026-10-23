import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { agentTriggerModelName, PromptBarModelPickerModal } from '@client/shared/prompt-bar/controls/PromptBarModelPickerModal';
import { matchesStoredModel, type PreferenceModelItem } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { readEffectiveModalityModels } from '@shared/domain/models/modalityStorage';

type PickerModality = 'chat' | 'image' | 'video';

function preferredSelectionId(kind: PickerModality, models: PreferenceModelItem[]): string {
  const read = readEffectiveModalityModels(kind);
  if (read.configured) {
    const preferred = read.models.find((item) => item.isDefault) || read.models[0];
    if (preferred) {
      const match = models.find((model) => matchesStoredModel(model, preferred.id) || matchesStoredModel(model, preferred.modelId));
      if (match) return match.id;
    }
  }
  return models[0]?.id || '';
}

interface Props {
  modality: PickerModality;
  value: string;
  models: PreferenceModelItem[];
  ready: boolean;
  disabled: boolean;
  onChange: (modelId: string) => void;
}

export function SalesModelPicker({ modality, value, models, ready, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = models.find((model) => matchesStoredModel(model, value));
  const sourceId = selected?.upstreamId || selected?.id || '';
  const label = sourceId ? agentTriggerModelName(sourceId, selected?.name || '') : '未配置模型';

  useEffect(() => {
    if (!ready) return;
    if (!models.length) {
      if (value) onChange('');
      return;
    }
    if (models.some((model) => matchesStoredModel(model, value))) return;
    const next = preferredSelectionId(modality, models);
    if (next && next !== value) onChange(next);
  }, [ready, models, value, modality, onChange]);

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={value ? `当前模型：${label}` : '未配置模型'}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-medium ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          open
            ? 'bg-white text-slate-900 ring-black/[0.08] dark:bg-[#2C2C32] dark:text-white dark:ring-white/15'
            : 'bg-black/[0.04] text-slate-900 ring-transparent hover:bg-black/[0.06] dark:bg-white/[0.06] dark:text-[#EDEDED] dark:hover:bg-white/10'
        }`}
      >
        <span className="truncate">{label}</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#8E8E93]" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#8E8E93]" />}
      </button>
      <PromptBarModelPickerModal
        isOpen={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        isUp
        models={models}
        selectedModelId={selected?.id || value}
        modalityKind={modality}
        onSelectModel={onChange}
      />
    </div>
  );
}
