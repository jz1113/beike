import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { agentTriggerModelName, PromptBarModelPickerModal } from '@client/shared/prompt-bar/controls/PromptBarModelPickerModal';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import { REASONING_EFFORT_LABELS, normalizeReasoningEffort, reasoningCapability } from '@shared/domain/assistant/reasoning';
import type { CoverFeedJob } from '../../hooks/useCoverSampleFeed';
import type { CoverVisionModel } from '../../model/coverVisionModels';
import { coverVisionModelLabel, coverVisionPickerModels } from '../../model/coverVisionModels';
import { canStartCoverFeed } from '../../model/coverFeedState';
import { CoverFeedEffort } from './CoverFeedEffort';

interface Props {
  jobs: CoverFeedJob[];
  models: CoverVisionModel[];
  selectionId: string;
  effort: ReasoningEffort;
  busy: boolean;
  notice: string | null;
  onSelectModel: (id: string) => void;
  onEffortChange: (effort: ReasoningEffort) => void;
  onClose: () => void;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onStart: () => void;
  onRetry: () => void;
  onOpenSettings?: () => void;
}

const statusText: Record<CoverFeedJob['status'], string> = {
  queued: '待投喂', uploading: '上传中', analyzing: '反推中', done: '待确认', failed: '失败', uncertain: '待核对',
};

function coverEffortLabel(model: CoverVisionModel | undefined, effort: ReasoningEffort) {
  const capability = reasoningCapability(model?.modelId || '', model?.textProtocol);
  const resolved = normalizeReasoningEffort(model?.modelId || '', effort, model?.textProtocol);
  return capability.levels.length > 1 ? REASONING_EFFORT_LABELS[resolved] : capability.unavailableLabel || '默认';
}

export function CoverFeedPanel({
  jobs, models, selectionId, effort, busy, notice, onSelectModel, onEffortChange, onClose, onFiles, onRemove, onStart, onRetry, onOpenSettings,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const modelButtonId = useId();
  const [showModelPicker, setShowModelPicker] = useState(false);
  const pickerModels = coverVisionPickerModels(models);
  const selected = models.find((model) => model.selectionId === selectionId && !model.unavailable);
  const modelName = selected ? agentTriggerModelName(selected.modelId, selected.name) : pickerModels.length ? '选择反推模型' : '暂无可用的视觉模型';
  const modelLabel = selected?.channel ? `${modelName} · ${selected.channel}` : modelName;
  const pickerOpen = showModelPicker && !busy;
  useEffect(() => {
    if (busy) setShowModelPicker(false);
  }, [busy]);
  const ready = canStartCoverFeed(jobs.map((job) => job.status));
  const uncertain = jobs.some((job) => job.status === 'uncertain');
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  return (
    <section className="w-[min(92vw,380px)] rounded-3xl border border-violet-200/80 bg-white/95 p-4 text-slate-900 shadow-2xl dark:border-violet-300/20 dark:bg-[#16161a] dark:text-slate-100" aria-label="封面样张收件">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black">投喂给小怪兽</h3>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">一次 1 到 10 张。JPG、PNG、WebP，或装有这些图片的 ZIP。确认后才会逐张反推。</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="关闭投喂"><X className="h-4 w-4" /></button>
      </div>
      <div className="relative mb-3">
        <label htmlFor={modelButtonId} className="block text-[11px] font-bold text-slate-500">反推模型</label>
        <button
          ref={modelButtonRef}
          id={modelButtonId}
          type="button"
          aria-expanded={pickerOpen}
          disabled={busy}
          title={selected ? `当前模型：${coverVisionModelLabel(selected)}` : '选择反推模型'}
          onClick={() => setShowModelPicker((open) => !open)}
          className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-violet-500 disabled:opacity-50 dark:border-white/10 dark:bg-black/30 dark:text-slate-100 dark:hover:bg-white/5"
        >
          <span className="truncate">{modelLabel}</span>
          {pickerOpen ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
        </button>
        <PromptBarModelPickerModal
          isOpen={pickerOpen}
          onClose={() => setShowModelPicker(false)}
          triggerRef={modelButtonRef}
          isUp={false}
          models={pickerModels}
          selectedModelId={selectionId}
          modalityKind="chat"
          onSelectModel={(id) => {
            if (!busy && pickerModels.some((model) => model.id === id)) onSelectModel(id);
          }}
        />
      </div>
      <CoverFeedEffort
        modelId={selected?.modelId || ''}
        protocol={selected?.textProtocol}
        effort={effort}
        disabled={busy || !selected}
        onChange={onEffortChange}
      />
      {pickerModels.length === 0 && <button type="button" onClick={onOpenSettings} className="mb-3 text-[11px] font-bold text-violet-600">去设置同步模型</button>}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="flex min-h-16 w-full items-center justify-center rounded-2xl border border-dashed border-violet-300 text-xs font-bold text-violet-700 disabled:opacity-50 dark:text-violet-200">选择图片或 ZIP</button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.zip,application/zip" multiple className="hidden" onChange={onChange} />
      {jobs.length > 0 && (
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
          {jobs.map((job) => (
            <li key={job.id} className="flex items-center gap-2 text-xs">
              <img src={job.previewUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              <span className="min-w-0 flex-1 truncate">{job.name}</span>
              <span className="shrink-0 text-slate-400">{statusText[job.status]}</span>
              {!busy && <button type="button" onClick={() => onRemove(job.id)} className="text-slate-400" aria-label={`移除 ${job.name}`}>×</button>}
            </li>
          ))}
        </ul>
      )}
      {jobs.some((job) => job.error) && <p className="mt-2 text-[11px] leading-5 text-rose-500">{jobs.find((job) => job.error)?.error}</p>}
      {uncertain && <p className="mt-2 text-[11px] leading-5 text-amber-600">有待核对的原任务，请先刷新核对。其他图片会在核对后继续。</p>}
      {notice && <p className="mt-2 text-[11px] leading-5 text-amber-600">{notice}</p>}
      <p className="sr-only" aria-live="polite">{selected ? `当前模型 ${coverVisionModelLabel(selected)}` : '没有可用的反推模型'}，思考强度 {coverEffortLabel(selected, effort)}，{jobs.length} 张样张</p>
      <div className="mt-3 flex justify-end gap-2">
        {uncertain && <button type="button" onClick={onRetry} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500">刷新核对</button>}
        <button type="button" disabled={busy || !ready || !selected || selected.unavailable} onClick={onStart} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">投喂并反推</button>
      </div>
    </section>
  );
}
