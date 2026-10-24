import { useEffect, useState } from 'react';
import { imageResolutionLabel } from '@client/shared/prompt-bar/controls/preferences/PromptBarImageTab';
import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { useAppStore } from '@client/store';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { GENERATION_BATCH_LIMIT } from '@shared/domain/assistant/generationPrompts';
import type { GenerationPromptSource } from './generationBatchSources';
import { currentBatchSettings, dispatchGenerationBatch } from './dispatchGenerationBatch';
import { readGenerationBatchReceipts, type GenerationBatchReceipt } from './generationBatchReceipts';
import type { BatchGenerationSettings, BatchPromptDraft } from './buildGenerationPromptBatch';
import GenerationBatchSettings, {
  resolveBatchModelSummary,
  resolvePreferredBatchModel,
  syncBatchSettingsStore,
} from './GenerationBatchSettings';
import { readGenerationBatchDraft, saveGenerationBatchDraft } from './generationBatchDrafts';

const ITEM_ASPECT_OPTIONS = [
  { id: '', label: '沿用默认' }, { id: 'smart', label: '智能' }, { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' }, { id: '4:3', label: '4:3' }, { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' }, { id: '2:3', label: '2:3' }, { id: '3:2', label: '3:2' }, { id: '21:9', label: '21:9' },
];

export function initialBatchDraft(source: GenerationPromptSource) {
  try {
    const saved = readGenerationBatchDraft(source);
    if (saved) {
      return { drafts: source.entries.map(entry => saved.entries.find(item => item.id === entry.id) || entry), settings: saved.settings, error: '' };
    }
    const base = currentBatchSettings();
    const firstImageAspect = source.entries.find(entry => entry.mediaType === 'image' && entry.aspect)?.aspect;
    const firstVideoAspect = source.entries.find(entry => entry.mediaType === 'video' && entry.aspect)?.aspect;
    const firstVideoDuration = source.entries.find(entry => entry.mediaType === 'video' && typeof entry.duration === 'number')?.duration;
    return {
      drafts: source.entries,
      settings: {
        ...base,
        ...(firstImageAspect ? { imageAspect: firstImageAspect } : {}),
        ...(firstVideoAspect ? { videoAspect: firstVideoAspect } : {}),
        ...(firstVideoDuration !== undefined ? { videoDuration: firstVideoDuration } : {}),
      },
      error: '',
    };
  } catch (error) {
    return { drafts: source.entries, settings: currentBatchSettings(), error: error instanceof Error ? error.message : '草稿读取失败' };
  }
}

function formatAspectLabel(aspect: string): string {
  return !aspect || aspect === 'smart' || aspect === 'adaptive' || aspect === 'auto' ? '智能' : aspect;
}

function formatCountSummary(total: number, imageCount: number, videoCount: number): string {
  if (imageCount > 0 && videoCount > 0) return `共 ${total} 项：${imageCount} 张图片、${videoCount} 条视频`;
  return videoCount > 0 ? `共 ${total} 项：${videoCount} 条视频` : `共 ${total} 项：${imageCount} 张图片`;
}

function taskState(task?: GenerationTask) {
  if (!task) return '提交记录待核实';
  if (task.status === 'SUCCESS') return '已完成';
  if (task.submissionRecoveryRequired) return '结果待核实';
  if (task.status === 'FAILURE') return task.failReason || '失败';
  return task.taskId ? '生成中' : task.progress === '0%' ? '等待提交' : '提交中';
}

export default function GenerationBatchPanel({
  source,
  disabled = false,
  defaultOpen = false,
}: {
  source: GenerationPromptSource;
  disabled?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [initial] = useState(() => initialBatchDraft(source));
  const [drafts, setDrafts] = useState<BatchPromptDraft[]>(initial.drafts);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [settings, setSettings] = useState<BatchGenerationSettings>(initial.settings);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { ready: modelsReady, imageModels, videoModels } = usePreferenceModels();
  const sessions = useAppStore(state => state.sessions);
  const ready = useAppStore(state => state.generationHistoryReady);
  let receipts: GenerationBatchReceipt[] = [];
  let receiptError = '';
  try { receipts = readGenerationBatchReceipts(source.sourceId); }
  catch (cause) { receiptError = cause instanceof Error ? cause.message : '无法读取提交回执'; }

  const submitted = new Set(receipts.flatMap(receipt => receipt.entryIds));
  const selected = drafts.filter(entry => !excluded.includes(entry.id) && !submitted.has(entry.id));
  const imageCount = drafts.filter(entry => entry.mediaType === 'image').length;
  const videoCount = drafts.length - imageCount;
  const resultSessionId = receipts[0]?.sessionId || source.legacySessionId;

  const persistQuietly = (nextDrafts: BatchPromptDraft[], nextSettings: BatchGenerationSettings) => {
    try {
      const targetDrafts = nextDrafts.length <= GENERATION_BATCH_LIMIT
        ? nextDrafts
        : nextDrafts.filter(entry => !excluded.includes(entry.id) && !submitted.has(entry.id)).slice(0, GENERATION_BATCH_LIMIT);
      if (targetDrafts.length > 0) saveGenerationBatchDraft(source.sourceId, targetDrafts, nextSettings);
    } catch { /* Explicit save/generate surfaces storage errors when needed. */ }
  };

  useEffect(() => {
    if (!modelsReady) return;
    const updates: Partial<BatchGenerationSettings> = {};
    if (imageCount > 0 && imageModels.length > 0) {
      const nextImage = resolvePreferredBatchModel('image', settings.imageModel, imageModels);
      if (nextImage && nextImage !== settings.imageModel) updates.imageModel = nextImage;
    }
    if (videoCount > 0 && videoModels.length > 0) {
      const nextVideo = resolvePreferredBatchModel('video', settings.videoModel, videoModels);
      if (nextVideo && nextVideo !== settings.videoModel) updates.videoModel = nextVideo;
    }
    if (Object.keys(updates).length > 0) {
      const next = { ...settings, ...updates };
      setSettings(next);
      syncBatchSettingsStore(updates);
      persistQuietly(drafts, next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsReady, imageCount, videoCount, imageModels, videoModels]);

  if (!drafts.length) return null;

  const imageSummary = resolveBatchModelSummary('image', settings.imageModel, imageModels);
  const videoSummary = resolveBatchModelSummary('video', settings.videoModel, videoModels);

  const patch = (id: string, change: Partial<BatchPromptDraft>) => {
    setDrafts(old => {
      const next = old.map(entry => (entry.id === id ? { ...entry, ...change } : entry));
      persistQuietly(next, settings);
      return next;
    });
  };

  const handleSettingsChange = (nextSettings: BatchGenerationSettings, changed?: Partial<BatchGenerationSettings>) => {
    setSettings(nextSettings);
    if (changed && (changed.imageAspect !== undefined || changed.videoAspect !== undefined || changed.videoDuration !== undefined)) {
      setDrafts(old => {
        const next = old.map(entry => {
          if (submitted.has(entry.id)) return entry;
          if (entry.mediaType === 'image' && changed.imageAspect !== undefined) return { ...entry, aspect: changed.imageAspect };
          if (entry.mediaType === 'video') {
            return {
              ...entry,
              ...(changed.videoAspect !== undefined ? { aspect: changed.videoAspect } : {}),
              ...(changed.videoDuration !== undefined ? { duration: changed.videoDuration } : {}),
            };
          }
          return entry;
        });
        persistQuietly(next, nextSettings);
        return next;
      });
    } else {
      persistQuietly(drafts, nextSettings);
    }
  };

  const viewResults = () => {
    const state = useAppStore.getState();
    if (!resultSessionId || !state.sessions.some(session => session.id === resultSessionId)) {
      setError('原结果会话暂未找到；提交回执已保留，不会自动再次生成。');
      return;
    }
    state.switchSession(resultSessionId); state.setCurrentView('generate'); state.setIsAssistantOpen(false);
  };

  const canGenerate = !disabled && ready && !submitting && selected.length > 0 && selected.length <= GENERATION_BATCH_LIMIT && !receiptError && !source.legacySessionId;
  const generate = () => {
    if (!canGenerate) return;
    setSubmitting(true);
    try {
      saveGenerationBatchDraft(source.sourceId, drafts.length <= GENERATION_BATCH_LIMIT ? drafts : selected, settings);
      dispatchGenerationBatch({ sourceId: source.sourceId, entryIds: selected.map(entry => entry.id), kind: source.kind, sessionId: source.sessionId, drafts: selected, settings });
      setError(''); setNotice('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '批量提交失败'); }
    finally { setSubmitting(false); }
  };

  return (
    <section aria-label="提示词批量生成" className="my-3 w-full rounded-2xl border border-slate-200/90 bg-white/95 p-4 text-xs text-slate-700 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#18191c]/95 dark:text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCountSummary(drafts.length, imageCount, videoCount)}</span>
          {imageCount > 0 && (
            <button
              type="button"
              onClick={() => setOpen(value => !value)}
              title="点击展开或收起生成设置"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-100/90 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-200/70 dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
            >
              <ModelIcon modelId={imageSummary.upstreamId} className="h-3.5 w-3.5 shrink-0" />
              <span>{imageSummary.label}</span>
              <span className="text-slate-400 dark:text-slate-400">· {formatAspectLabel(settings.imageAspect)} · {imageResolutionLabel(settings.imageQuality)}</span>
            </button>
          )}
          {videoCount > 0 && (
            <button
              type="button"
              onClick={() => setOpen(value => !value)}
              title="点击展开或收起生成设置"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-100/90 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-200/70 dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
            >
              <ModelIcon modelId={videoSummary.upstreamId} className="h-3.5 w-3.5 shrink-0" />
              <span>{videoSummary.label}</span>
              <span className="text-slate-400 dark:text-slate-400">· {formatAspectLabel(settings.videoAspect)} · {settings.videoResolution} · {settings.videoDuration}秒</span>
            </button>
          )}
          {disabled && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">回复完成后可提交</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {resultSessionId && <button type="button" onClick={viewResults} className="cursor-pointer rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10">查看本组结果</button>}
          {!open && selected.length > 0 && <button type="button" disabled={!canGenerate} onClick={generate} className="cursor-pointer rounded-xl bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950">并行生成选中的 {selected.length} 项</button>}
          <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="cursor-pointer rounded-xl border border-slate-200/90 bg-slate-100/80 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200/70 dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15">{open ? '收起清单' : '展开清单'}</button>
        </div>
      </div>

      {!ready && <p className="mt-2 text-slate-500" role="status">生成历史正在恢复，请稍后再提交。</p>}
      {notice && <p className="mt-2 text-emerald-700 dark:text-emerald-300" role="status">{notice}</p>}
      {(error || receiptError) && <p className="mt-2 text-rose-600 dark:text-rose-400" role="alert">{error || receiptError}</p>}
      {drafts.length > GENERATION_BATCH_LIMIT && <p className="mt-2 text-amber-700 dark:text-amber-300">每次最多生成 {GENERATION_BATCH_LIMIT} 项，请分批勾选。</p>}

      {open && (
        <div className="mt-3 space-y-3">
          <GenerationBatchSettings value={settings} onChange={handleSettingsChange} image={imageCount > 0} video={videoCount > 0} disabled={disabled} />

          {drafts.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setExcluded([])} className="cursor-pointer rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10">全选未提交项</button>
              <button type="button" onClick={() => setExcluded(drafts.map(entry => entry.id))} className="cursor-pointer rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10">取消全选</button>
              <span className="text-slate-500 dark:text-slate-400">已提交项不会重复生成</span>
            </div>
          )}

          <div className="max-h-[32rem] space-y-2 overflow-y-auto">
            {drafts.map(entry => {
              const receipt = receipts.find(item => item.entryIds.includes(entry.id));
              const taskId = receipt?.taskIds[receipt.entryIds.indexOf(entry.id)];
              const task = sessions.find(session => session.id === receipt?.sessionId)?.tasks.find(item => item.id === taskId);
              const sent = submitted.has(entry.id) || Boolean(source.legacySessionId);
              const effectiveAspect = formatAspectLabel(entry.aspect || (entry.mediaType === 'video' ? settings.videoAspect : settings.imageAspect));
              const modelLabel = entry.mediaType === 'video' ? videoSummary.label : imageSummary.label;
              const specSummary = entry.mediaType === 'video'
                ? `${modelLabel} · ${effectiveAspect} · ${settings.videoResolution} · ${entry.duration ?? settings.videoDuration} 秒`
                : `${modelLabel} · ${effectiveAspect} · ${imageResolutionLabel(settings.imageQuality)}`;

              return (
                <article key={entry.id} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input aria-label={`选择 ${entry.title}`} type="checkbox" disabled={sent || disabled} checked={!excluded.includes(entry.id) && !sent} onChange={event => setExcluded(old => event.target.checked ? old.filter(id => id !== entry.id) : [...old, entry.id])} className="h-3.5 w-3.5 shrink-0 accent-slate-900 dark:accent-white" />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{entry.title}</span>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-2xs dark:bg-white/10 dark:text-slate-300">
                      {sent ? (source.legacySessionId ? '已有生成记录' : taskState(task)) : specSummary}
                    </span>
                  </label>
                  {!sent && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">编辑提示词、类型和参考素材</summary>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1.5">
                          <span className="text-slate-500 dark:text-slate-400">类型</span>
                          <select aria-label={`${entry.title}媒体类型`} value={entry.mediaType} disabled={disabled} onChange={event => patch(entry.id, { mediaType: event.target.value as 'image' | 'video' })} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-[#1B1C20]">
                            <option value="image">图片</option>
                            <option value="video">视频</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-1.5">
                          <span className="text-slate-500 dark:text-slate-400">比例</span>
                          <select aria-label={`${entry.title}比例`} value={entry.aspect || ''} disabled={disabled} onChange={event => patch(entry.id, { aspect: event.target.value || undefined })} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-[#1B1C20]">
                            {ITEM_ASPECT_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                            {entry.aspect && !ITEM_ASPECT_OPTIONS.some(opt => opt.id === entry.aspect) && <option value={entry.aspect}>{entry.aspect}</option>}
                          </select>
                        </label>
                        {entry.mediaType === 'video' && (
                          <label className="flex items-center gap-1.5">
                            <span className="text-slate-500 dark:text-slate-400">秒数</span>
                            <input aria-label={`${entry.title}时长`} type="number" min={1} max={120} value={entry.duration ?? ''} disabled={disabled} onChange={event => patch(entry.id, { duration: event.target.value ? Number(event.target.value) : undefined })} className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-[#1B1C20]" />
                          </label>
                        )}
                      </div>
                      <textarea aria-label={`${entry.title}提示词`} value={entry.prompt} disabled={disabled} onChange={event => patch(entry.id, { prompt: event.target.value })} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-2.5 leading-6 text-slate-800 dark:border-white/15 dark:bg-[#1B1C20] dark:text-slate-100" />
                      {source.media.length > 0 && (
                        <fieldset className="mt-2 flex flex-wrap gap-2">
                          <legend className="mb-1 text-slate-500 dark:text-slate-400">参考素材（首尾帧按原素材顺序）</legend>
                          {source.media.map((item, index) => item.type === 'document' ? null : (
                            <label key={`${index}-${item.url}`} className="flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 py-1 dark:border-white/10 dark:bg-white/5">
                              <input type="checkbox" disabled={disabled} checked={entry.referenceIndexes?.includes(index) ?? true} onChange={event => {
                                const current = entry.referenceIndexes || source.media.flatMap((media, i) => (media.type !== 'document' && media.url ? [i] : []));
                                patch(entry.id, { referenceIndexes: event.target.checked ? [...current, index].sort((a, b) => a - b) : current.filter(i => i !== index) });
                              }} />
                              {item.type === 'video' ? '视频' : '图片'} {entry.mediaType === 'video' ? source.media.slice(0, index + 1).filter(media => media.type === item.type).length : index + 1}{item.name ? `：${item.name}` : ''}
                            </label>
                          ))}
                        </fieldset>
                      )}
                      {entry.issue && <p className="mt-1 text-amber-700 dark:text-amber-300">{entry.issue}</p>}
                    </details>
                  )}
                  {task?.resultUrl && <button type="button" onClick={() => useAppStore.getState().setPreviewTask(task)} className="mt-2 cursor-pointer font-medium text-indigo-600 hover:underline dark:text-indigo-300">预览成品</button>}
                </article>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            <button type="button" disabled={disabled || submitting || !selected.length} onClick={() => {
              try { saveGenerationBatchDraft(source.sourceId, drafts.length <= GENERATION_BATCH_LIMIT ? drafts : selected, settings); setError(''); setNotice('清单已保存，后续可直接告诉 Agent 生成哪些项。'); }
              catch (cause) { setError(cause instanceof Error ? cause.message : '清单保存失败'); }
            }} className="cursor-pointer rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10">保存清单</button>
            <button type="button" disabled={!canGenerate} onClick={generate} className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white shadow-xs hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950">并行生成选中的 {selected.length} 项</button>
          </div>
        </div>
      )}
    </section>
  );
}
