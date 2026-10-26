import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { agentTriggerModelName, PromptBarModelPickerModal } from '@client/shared/prompt-bar/controls/PromptBarModelPickerModal';
import type { KeywordReviewModelOption } from '@client/shared/models/keywordReviewModels';

interface Props {
  options: KeywordReviewModelOption[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

export function KeywordReviewModelPicker({ options, value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value) || options[0];
  const label = selected ? agentTriggerModelName(selected.model, selected.name) : '未配置模型';
  const models = options.map((option) => ({
    id: option.value,
    name: option.name,
    desc: '词包审核',
    provider: option.channel,
    upstreamId: option.model,
  }));

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selected ? `审核模型：${selected.label}` : '审核模型'}
        title={selected?.label || '审核模型'}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-10 max-w-[240px] items-center gap-1.5 rounded-xl border bg-white/90 px-3 text-sm font-semibold text-slate-700 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#1B1B1E]/90 dark:text-slate-200 ${
          open
            ? 'border-white/[0.12] dark:border-white/[0.12]'
            : 'border-white/[0.07] hover:border-white/[0.12] dark:hover:border-white/[0.12]'
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <PromptBarModelPickerModal
        isOpen={open && !disabled}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        isUp={false}
        models={models}
        selectedModelId={selected?.value || ''}
        modalityKind="chat"
        onSelectModel={(modelId) => {
          onChange(modelId);
          setOpen(false);
        }}
      />
    </div>
  );
}
