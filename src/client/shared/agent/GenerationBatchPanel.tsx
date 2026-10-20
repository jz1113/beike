import { useState } from 'react';
import { useAppStore } from '@client/store';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { GENERATION_BATCH_LIMIT } from '@shared/domain/assistant/generationPrompts';
import type { GenerationPromptSource } from './generationBatchSources';
import { currentBatchSettings, dispatchGenerationBatch } from './dispatchGenerationBatch';
import { readGenerationBatchReceipts, type GenerationBatchReceipt } from './generationBatchReceipts';
import type { BatchPromptDraft } from './buildGenerationPromptBatch';
import GenerationBatchSettings from './GenerationBatchSettings';
import { readGenerationBatchDraft, saveGenerationBatchDraft } from './generationBatchDrafts';

function initialDraft(source: GenerationPromptSource) {
  try {
    const saved = readGenerationBatchDraft(source);
    return { drafts: source.entries.map(entry => saved?.entries.find(item => item.id === entry.id) || entry), settings: saved?.settings || currentBatchSettings(), error: '' };
  } catch (error) { return { drafts: source.entries, settings: currentBatchSettings(), error: error instanceof Error ? error.message : '草稿读取失败' }; }
}

function taskState(task?: GenerationTask) {
  if (!task) return '提交记录待核实';
  if (task.status === 'SUCCESS') return '已完成';
  if (task.submissionRecoveryRequired) return '结果待核实';
  if (task.status === 'FAILURE') return task.failReason || '失败';
  return task.taskId ? '生成中' : task.progress === '0%' ? '等待提交' : '提交中';
}

export default function GenerationBatchPanel({ source, disabled = false }: { source: GenerationPromptSource; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [initial] = useState(() => initialDraft(source));
  const [drafts, setDrafts] = useState<BatchPromptDraft[]>(initial.drafts);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [settings, setSettings] = useState(initial.settings);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const sessions = useAppStore(state => state.sessions);
  const ready = useAppStore(state => state.generationHistoryReady);
  let receipts: GenerationBatchReceipt[] = []; let receiptError = '';
  try { receipts = readGenerationBatchReceipts(source.sourceId); }
  catch (cause) { receiptError = cause instanceof Error ? cause.message : '无法读取提交回执'; }
  if (!drafts.length) return null;
  const submitted = new Set(receipts.flatMap(receipt => receipt.entryIds));
  const selected = drafts.filter(entry => !excluded.includes(entry.id) && !submitted.has(entry.id));
  const imageCount = drafts.filter(entry => entry.mediaType === 'image').length;
  const videoCount = drafts.length - imageCount;
  const resultSessionId = receipts[0]?.sessionId || source.legacySessionId;
  const patch = (id: string, change: Partial<BatchPromptDraft>) => setDrafts(old => old.map(entry => entry.id === id ? { ...entry, ...change } : entry));
  const viewResults = () => {
    const state = useAppStore.getState();
    if (!resultSessionId || !state.sessions.some(session => session.id === resultSessionId)) { setError('原结果会话暂未找到；提交回执已保留，不会自动再次生成。'); return; }
    state.switchSession(resultSessionId); state.setCurrentView('generate'); state.setIsAssistantOpen(false);
  };
  const generate = () => {
    if (submitting || disabled) return;
    setSubmitting(true);
    try {
      saveGenerationBatchDraft(source.sourceId, drafts.length <= 30 ? drafts : selected, settings);
      dispatchGenerationBatch({ sourceId: source.sourceId, entryIds: selected.map(entry => entry.id), kind: source.kind, sessionId: source.sessionId, drafts: selected, settings });
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '批量提交失败'); }
    finally { setSubmitting(false); }
  };
  return <section aria-label="提示词批量生成" className="my-3 w-full rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-xs text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-200">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-medium">共 {drafts.length} 项：{imageCount} 张图片、{videoCount} 条视频{disabled ? ' · 回复完成后可提交' : ''}</span>
      <div className="flex items-center gap-2">
        {resultSessionId && <button type="button" onClick={viewResults} className="rounded-lg border border-slate-300 px-2.5 py-1.5 dark:border-white/20">查看本组结果</button>}
        <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="rounded-lg bg-slate-900 px-3 py-1.5 text-white dark:bg-slate-200 dark:text-slate-900">{open ? '收起清单' : '选择并行生成'}</button>
      </div>
    </div>
    {!ready && <p className="mt-2" role="status">生成历史正在恢复，请稍后再提交。</p>}
    {notice && <p className="mt-2 text-emerald-700 dark:text-emerald-300" role="status">{notice}</p>}
    {(error || receiptError) && <p className="mt-2 text-rose-600 dark:text-rose-400" role="alert">{error || receiptError}</p>}
    {drafts.length > GENERATION_BATCH_LIMIT && <p className="mt-2">每次最多生成 {GENERATION_BATCH_LIMIT} 项，请分批勾选。</p>}
    {open && <div className="mt-3 space-y-3">
      <GenerationBatchSettings value={settings} onChange={setSettings} image={imageCount > 0} video={videoCount > 0} />
      <div className="flex gap-3"><button type="button" onClick={() => setExcluded([])}>全选未提交项</button><button type="button" onClick={() => setExcluded(drafts.map(entry => entry.id))}>取消全选</button><span className="text-slate-500">已提交项不会重复生成</span></div>
      <div className="max-h-[32rem] space-y-2 overflow-y-auto">
        {drafts.map(entry => {
          const receipt = receipts.find(item => item.entryIds.includes(entry.id));
          const taskId = receipt?.taskIds[receipt.entryIds.indexOf(entry.id)];
          const task = sessions.find(session => session.id === receipt?.sessionId)?.tasks.find(item => item.id === taskId);
          const sent = submitted.has(entry.id) || Boolean(source.legacySessionId);
          return <article key={entry.id} className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-white/10 dark:bg-black/10">
            <label className="flex items-start gap-2"><input aria-label={`选择 ${entry.title}`} type="checkbox" disabled={sent || disabled} checked={!excluded.includes(entry.id) && !sent} onChange={event => setExcluded(old => event.target.checked ? old.filter(id => id !== entry.id) : [...old, entry.id])} /><span className="flex-1 font-medium">{entry.title}</span><span>{sent ? source.legacySessionId ? '已有生成记录' : taskState(task) : `${entry.mediaType === 'video' ? '视频' : '图片'} · ${entry.aspect || (entry.mediaType === 'video' ? settings.videoAspect : settings.imageAspect)}${entry.mediaType === 'video' ? ` · ${entry.duration ?? settings.videoDuration} 秒` : ''}`}</span></label>
            {!sent && <details className="mt-2"><summary className="cursor-pointer text-slate-500">编辑提示词、类型和参考素材</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <label>类型 <select aria-label={`${entry.title}媒体类型`} value={entry.mediaType} disabled={disabled} onChange={event => patch(entry.id, { mediaType: event.target.value as 'image' | 'video' })} className="rounded border bg-transparent px-1 py-1"><option value="image">图片</option><option value="video">视频</option></select></label>
                <label>比例 <input aria-label={`${entry.title}比例`} value={entry.aspect || ''} placeholder="沿用默认" disabled={disabled} onChange={event => patch(entry.id, { aspect: event.target.value || undefined })} className="w-20 rounded border bg-transparent px-1 py-1" /></label>
                {entry.mediaType === 'video' && <label>秒数 <input aria-label={`${entry.title}时长`} type="number" value={entry.duration ?? ''} disabled={disabled} onChange={event => patch(entry.id, { duration: event.target.value ? Number(event.target.value) : undefined })} className="w-16 rounded border bg-transparent px-1 py-1" /></label>}
              </div>
              <textarea aria-label={`${entry.title}提示词`} value={entry.prompt} disabled={disabled} onChange={event => patch(entry.id, { prompt: event.target.value })} rows={5} className="mt-2 w-full rounded-lg border border-slate-200 bg-transparent p-2 leading-6 dark:border-white/15" />
              {source.media.length > 0 && <fieldset className="mt-2 flex flex-wrap gap-2"><legend>参考素材（首尾帧按原素材顺序）</legend>{source.media.map((item, index) => item.type === 'document' ? null : <label key={`${index}-${item.url}`} className="flex items-center gap-1"><input type="checkbox" disabled={disabled} checked={entry.referenceIndexes?.includes(index) ?? true} onChange={event => {
                const current = entry.referenceIndexes || source.media.flatMap((media, i) => media.type !== 'document' && media.url ? [i] : []);
                patch(entry.id, { referenceIndexes: event.target.checked ? [...current, index].sort((a, b) => a - b) : current.filter(i => i !== index) });
              }} />{item.type === 'video' ? '视频' : '图片'} {entry.mediaType === 'video' ? source.media.slice(0, index + 1).filter(media => media.type === item.type).length : index + 1}{item.name ? `：${item.name}` : ''}</label>)}</fieldset>}
              {entry.issue && <p className="mt-1 text-amber-700 dark:text-amber-300">{entry.issue}</p>}
            </details>}
            {task?.resultUrl && <button type="button" onClick={() => useAppStore.getState().setPreviewTask(task)} className="mt-2 text-indigo-600 dark:text-indigo-300">预览成品</button>}
          </article>;
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={disabled || submitting || !selected.length} onClick={() => {
        try { saveGenerationBatchDraft(source.sourceId, drafts.length <= 30 ? drafts : selected, settings); setError(''); setNotice('清单已保存，后续可直接告诉 Agent 生成哪些项。'); }
        catch (cause) { setError(cause instanceof Error ? cause.message : '清单保存失败'); }
      }} className="rounded-lg border border-slate-300 px-3 py-2 dark:border-white/20">保存清单</button><button type="button" disabled={disabled || !ready || submitting || !selected.length || selected.length > 30 || Boolean(receiptError) || Boolean(source.legacySessionId)} onClick={generate} className="rounded-lg bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-40 dark:bg-slate-200 dark:text-slate-900">并行生成选中的 {selected.length} 项</button><span className="text-slate-500">将调用图片／视频模型，可能产生费用。</span></div>
    </div>}
  </section>;
}
