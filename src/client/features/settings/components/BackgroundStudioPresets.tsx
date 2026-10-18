import { ChevronDown, X } from 'lucide-react';
import { studioValueEquals, type StudioValues } from '@client/shared/media/backgrounds/studio';
import type { CustomStudioPreset } from '@client/shared/media/backgrounds/studio/customPresets';

export function PresetSection({
  presets,
  saved,
  values,
  activePreset,
  presetName,
  saveOpen,
  atLimit,
  onPresetName,
  onToggleSave,
  onApply,
  onApplySaved,
  onDelete,
  onSave,
}: {
  presets: Array<{ id: string; label: string; mainColor: string; accentColor: string; values: StudioValues }>;
  saved: CustomStudioPreset[];
  values: StudioValues;
  activePreset: string | null;
  presetName: string;
  saveOpen: boolean;
  atLimit: boolean;
  onPresetName: (value: string) => void;
  onToggleSave: () => void;
  onApply: (presetId: string) => void;
  onApplySaved: (preset: CustomStudioPreset) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="shrink-0 space-y-2 px-4 pb-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium text-slate-500 dark:text-[#8E8E93]">预设</h3>
        <button
          type="button"
          aria-expanded={saveOpen}
          onClick={onToggleSave}
          className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 dark:text-[#8E8E93] dark:hover:text-white"
        >
          保存当前
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${saveOpen ? '' : '-rotate-90'}`} />
        </button>
      </div>
      {saveOpen ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <input
            aria-label="自定义预设名称"
            value={presetName}
            maxLength={16}
            placeholder="预设名称"
            onChange={(event) => onPresetName(event.target.value)}
            className="studio-control-input h-7 min-w-0 flex-1 rounded-full border border-slate-200/90 bg-white px-2.5 text-xs outline-none focus:border-violet-500 dark:border-white/10 dark:bg-[#161619] dark:text-[#EDEDED]"
          />
          <button
            type="submit"
            disabled={atLimit}
            title={atLimit ? '每种背景最多保存 8 个预设' : undefined}
            className="h-7 shrink-0 cursor-pointer rounded-full border border-slate-200/90 px-2.5 text-[11px] text-slate-600 enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-[#C7C7CC] dark:enabled:hover:bg-white/10"
          >
            保存
          </button>
        </form>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <PresetChip
            key={preset.id}
            label={preset.label}
            mainColor={preset.mainColor}
            accentColor={preset.accentColor}
            active={activePreset === preset.id}
            onClick={() => onApply(preset.id)}
          />
        ))}
        {saved.map((preset) => {
          const active = Object.entries(preset.values).every(([key, value]) => studioValueEquals(value, values[key]));
          return (
            <span key={preset.id} className="inline-flex items-center">
              <PresetChip label={preset.label} active={active} onClick={() => onApplySaved(preset)} />
              <button
                type="button"
                aria-label={`删除预设${preset.label}`}
                onClick={() => onDelete(preset.id)}
                className="-ml-0.5 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
    </section>
  );
}

function PresetChip({
  label,
  mainColor,
  accentColor,
  active,
  onClick,
}: {
  label: string;
  mainColor?: string;
  accentColor?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium ${
        active
          ? 'border-violet-500 bg-violet-50 text-slate-900 dark:border-violet-400 dark:bg-violet-950/40 dark:text-white'
          : 'border-slate-200/90 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-[#C7C7CC]'
      }`}
    >
      {mainColor && accentColor ? (
        <span className="flex h-2.5 w-4 overflow-hidden rounded-full">
          <span className="h-full w-1/2" style={{ background: mainColor }} />
          <span className="h-full w-1/2" style={{ background: accentColor }} />
        </span>
      ) : null}
      {label}
    </button>
  );
}
