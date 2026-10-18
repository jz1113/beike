import { Info, RotateCcw, Settings2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import ElasticSlider from '@client/shared/ui/ElasticSlider';
import GlideSelect, { type GlideSelectOption } from '@client/shared/ui/GlideSelect';
import JellyRadio from '@client/shared/ui/JellyRadio';
import { PosterDialogFrame } from './PosterDialogFrame';
import {
  MAX_POSTER_CONCURRENCY,
  modelLabel,
  normalizeConcurrency,
  type ImageQuality,
  type PosterProductionSettings,
} from '../model/posterTypes';

interface Props {
  settingsDraft: PosterProductionSettings;
  availableImageModels: Array<{ id: string; name?: string; shortName?: string }>;
  availableTitleModels: Array<{ id: string; name?: string; shortName?: string }>;
  isRunning: boolean;
  onClose: () => void;
  onChange: (next: PosterProductionSettings) => void;
  onSave: () => void;
  onOpenSettings?: () => void;
}

const IMAGE_QUALITY_OPTIONS = [
  { value: 'low', label: '1K' },
  { value: 'medium', label: '2K' },
  { value: 'high', label: '4K' },
];

interface ControlProps {
  label: string;
  detail: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

function CustomControl({ label, detail, value, min, max, step, disabled, onChange }: ControlProps) {
  return (
    <div role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={detail} aria-disabled={disabled} className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2 focus-visible:outline-2 focus-visible:outline-slate-400" onKeyDown={(event) => {
      if (disabled) return;
      const next = event.key === 'Home' ? min : event.key === 'End' ? max
        : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? Math.min(max, value + step)
          : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? Math.max(min, value - step) : null;
      if (next === null) return;
      event.preventDefault();
      onChange(next);
    }}>
      <span className="shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>
      <ElasticSlider
        value={value}
        startingValue={min}
        maxValue={max}
        isStepped
        stepSize={step}
        onValueChange={onChange}
        leftIcon={null}
        rightIcon={null}
        tone="light"
        className={`min-w-0 flex-1 ${disabled ? 'pointer-events-none opacity-45' : ''}`}
      />
      <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">{detail}</span>
    </div>
  );
}

function ChoiceControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-2">
      <span className="shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </div>
  );
}

export function PosterSettingsDialog({
  settingsDraft, availableImageModels, availableTitleModels, isRunning,
  onClose, onChange, onSave,
}: Props) {
  const { isDark } = useAppTheme();
  const patch = (partial: Partial<PosterProductionSettings>) => onChange({ ...settingsDraft, ...partial });
  const jellyChip = isDark ? '#1c1c20' : '#f8fafc';
  const jellyText = isDark ? '#cbd5e1' : '#475569';
  const jellyActive = isDark ? '#f8fafc' : '#0f172a';
  const jellyActiveText = isDark ? '#121214' : '#ffffff';
  const imageModelOptions: GlideSelectOption[] = [
    { value: settingsDraft.imageModel, label: modelLabel(availableImageModels.find((model) => model.id === settingsDraft.imageModel), settingsDraft.imageModel) },
    ...availableImageModels.filter((model) => model.id !== settingsDraft.imageModel).map((model) => ({ value: model.id, label: modelLabel(model, model.id) })),
  ];
  const titleModelOptions: GlideSelectOption[] = [
    { value: settingsDraft.titleModel, label: modelLabel(availableTitleModels.find((model) => model.id === settingsDraft.titleModel), settingsDraft.titleModel) },
    ...availableTitleModels.filter((model) => model.id !== settingsDraft.titleModel).map((model) => ({ value: model.id, label: modelLabel(model, model.id) })),
  ];
  const resetDraft = () => onChange({
    imageModel: availableImageModels[0]?.id || settingsDraft.imageModel,
    titleModel: availableTitleModels[0]?.id || settingsDraft.titleModel,
    titleHandling: 'rewrite', imageQuality: 'high', concurrency: 1,
  });

  return (
    <PosterDialogFrame label="生产设置" onClose={onClose} backdropClassName="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px]" className="max-h-[calc(100dvh-32px)] w-full max-w-[680px] overflow-y-auto rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)] dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]">
        <header className="flex items-start justify-between gap-5 px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-rose-100"><Settings2 className="h-3.5 w-3.5 text-rose-500" /></span><h2 className="text-sm font-black tracking-tight">生产设置</h2></div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10" aria-label="关闭生产设置"><X className="h-4 w-4" /></button>
        </header>

        <div className="space-y-4 px-5 pb-4 pt-2 sm:px-6">
          <section>
            <div className="mb-2"><h3 className="text-sm font-black">模型策略</h3></div>
            <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0 dark:divide-white/10">
              <label className="flex min-w-0 items-center gap-2.5 pb-2 md:pb-0 md:pr-4">
                <span className="w-[92px] shrink-0 text-xs font-bold text-slate-700 dark:text-slate-200">封面生成模型</span>
                <GlideSelect options={imageModelOptions} value={settingsDraft.imageModel} onChange={(value) => patch({ imageModel: value })} disabled={isRunning} ariaLabel="选择封面生成模型" showTags={false} size="md" menuWidth={280} placement="bottom" flipOnViewportOverflow align="right" accentColor={isDark ? '#e2e8f0' : '#0f172a'} surfaceColor={isDark ? '#1e232b' : '#ffffff'} highlightColor={isDark ? '#2a313d' : '#f1f5f9'} textColor={isDark ? '#f8fafc' : '#1e293b'} className="min-w-0 flex-1 [&_.glide-select__label]:min-w-0 [&_.glide-select__label]:truncate [&_.glide-select__trigger]:w-full [&_.glide-select__trigger]:justify-between [&_.glide-select__trigger]:rounded-lg [&_.glide-select__trigger]:ring-1 [&_.glide-select__trigger]:ring-slate-200 dark:[&_.glide-select__trigger]:ring-white/10" />
              </label>
              <label className="flex min-w-0 items-center gap-2.5 pt-2 md:pl-4 md:pt-0">
                <span className="w-[92px] shrink-0 text-xs font-bold text-slate-700 dark:text-slate-200">封面设计模型</span>
                <GlideSelect options={titleModelOptions} value={settingsDraft.titleModel} onChange={(value) => patch({ titleModel: value })} disabled={isRunning} ariaLabel="选择封面设计模型" showTags={false} size="md" menuWidth={280} placement="bottom" flipOnViewportOverflow align="right" accentColor={isDark ? '#e2e8f0' : '#0f172a'} surfaceColor={isDark ? '#1e232b' : '#ffffff'} highlightColor={isDark ? '#2a313d' : '#f1f5f9'} textColor={isDark ? '#f8fafc' : '#1e293b'} className="min-w-0 flex-1 [&_.glide-select__label]:min-w-0 [&_.glide-select__label]:truncate [&_.glide-select__trigger]:w-full [&_.glide-select__trigger]:justify-between [&_.glide-select__trigger]:rounded-lg [&_.glide-select__trigger]:ring-1 [&_.glide-select__trigger]:ring-slate-200 dark:[&_.glide-select__trigger]:ring-white/10" />
              </label>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-3 dark:border-white/10">
            <div className="mb-1.5 flex items-center justify-between"><h3 className="text-sm font-black">生成偏好</h3><button type="button" onClick={resetDraft} disabled={isRunning} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-white/10"><RotateCcw className="h-3.5 w-3.5" />恢复默认</button></div>
            <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0 dark:divide-white/10">
              <ChoiceControl label="是否改标题">
                <JellyRadio items={[{ value: 'rewrite', label: '是' }, { value: 'original', label: '否' }]} value={settingsDraft.titleHandling} onChange={(value) => patch({ titleHandling: value === 'rewrite' ? 'rewrite' : 'original' })} disabled={isRunning} ariaLabel="是否改标题" size="sm" gap={3} radius={8} swell={0.08} barge={2} shrink={0.02} jelly={0.3} bounce={0.16} chipColor={jellyChip} activeColor={jellyActive} textColor={jellyText} activeTextColor={jellyActiveText} className="min-w-0" />
              </ChoiceControl>
              <ChoiceControl label="图片质量">
                <JellyRadio items={IMAGE_QUALITY_OPTIONS} value={settingsDraft.imageQuality} onChange={(value) => patch({ imageQuality: value as ImageQuality })} disabled={isRunning} ariaLabel="选择图片质量" size="sm" gap={3} radius={8} swell={0.06} barge={2} shrink={0.02} jelly={0.25} bounce={0.16} chipColor={jellyChip} activeColor={jellyActive} textColor={jellyText} activeTextColor={jellyActiveText} className="min-w-0" />
              </ChoiceControl>
              <CustomControl label="并行任务" detail={`${settingsDraft.concurrency} 条`} value={settingsDraft.concurrency} min={1} max={MAX_POSTER_CONCURRENCY} step={1} disabled={isRunning} onChange={(value) => patch({ concurrency: normalizeConcurrency(value) })} />
            </div>
          </section>

          <div className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-400"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span>成品规格按导入第三列：<b className="font-semibold text-slate-600 dark:text-slate-300">文字竖 720 × 960 · 文字横 1440 × 1440 · JPG · 大于 200 KB 且小于 5 MB</b></span></div>
        </div>

        <footer className="flex justify-end gap-2 rounded-b-[20px] border-t border-slate-100 bg-slate-50/50 px-5 py-3 sm:px-6 dark:border-white/10 dark:bg-[#18181b]"><button type="button" onClick={onClose} className="rounded-xl px-3.5 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-white hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-400 dark:hover:bg-white/10">取消</button><button type="button" onClick={onSave} disabled={isRunning} className="rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-200">保存设置</button></footer>
    </PosterDialogFrame>
  );
}
