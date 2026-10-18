import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { KeywordReviewMode, KeywordReviewRuleEntry } from '@shared/contracts/generate';
import { KeywordReviewRuleEntrySchema } from '@shared/contracts/generate';
import { apiFetch } from '@client/shared/api/apiClient';

const RevisionSchema = z.object({
  version: z.number().int().nonnegative(),
  entries: KeywordReviewRuleEntrySchema.array(),
  note: z.string(),
  createdAt: z.string().nullable(),
});
const RulesResponseSchema = z.object({ current: RevisionSchema, history: RevisionSchema.array() });
type Revision = z.infer<typeof RevisionSchema>;

const SECTIONS = ['垂类边界', '不制作', '其他说明'] as const;

export function KeywordReviewRuleEditor({ open, mode }: { open: boolean; mode: KeywordReviewMode }) {
  const [current, setCurrent] = useState<Revision | null>(null);
  const [history, setHistory] = useState<Revision[]>([]);
  const [entries, setEntries] = useState<KeywordReviewRuleEntry[]>([]);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [publishNeedsCheck, setPublishNeedsCheck] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    void apiFetch('/api/generate/keyword-review/rules', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('读取补充规则失败');
        return response.json() as Promise<unknown>;
      })
      .then((raw) => {
        if (!active) return;
        const parsed = RulesResponseSchema.safeParse(raw);
        if (!parsed.success) throw new Error('审核规则数据异常，请重试');
        const data = parsed.data;
        setCurrent(data.current);
        setEntries(data.current.entries);
        setHistory(data.history);
        setNote('');
        setPublishNeedsCheck(false);
        setSaveFailed(false);
        setMessage(reloadAttempt ? `已重新读取 v${data.current.version}，请核对当前规则后再发布` : '');
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : '读取补充规则失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [open, reloadAttempt]);

  const save = async () => {
    if (!current || savingRef.current || loading || publishNeedsCheck) return;
    if (!note.trim()) { setMessage('请填写本次修改原因'); return; }
    if (entries.some((entry) => entry.text.trim().length < 4)) { setMessage('每条补充规则至少填写 4 个字'); return; }
    if (entries.reduce((total, entry) => total + entry.text.length, 0) > 6000) { setMessage('补充规则总长度不能超过 6000 字'); return; }
    const snapshot = { baseVersion: current.version, entries: entries.map((entry) => ({ ...entry })), note: note.trim() };
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    setMessage('');
    try {
      const response = await apiFetch('/api/generate/keyword-review/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json() as { success?: boolean; current?: Revision; error?: string };
      const parsed = RevisionSchema.safeParse(data.current);
      if (!response.ok || !data.success || !parsed.success) throw new Error(data.error || '保存失败，返回的规则数据异常');
      if (!mountedRef.current) return;
      const published = parsed.data;
      setCurrent(published);
      setEntries(published.entries);
      setHistory((items) => [published, ...items].slice(0, 30));
      setNote('');
      setMessage(`已发布 v${published.version}，新导入的任务开始使用，当前表继续原规则版本`);
    } catch (error) {
      if (mountedRef.current) {
        const uncertain = error instanceof Error && ['TimeoutError', 'AbortError', 'TypeError', 'SyntaxError'].includes(error.name);
        setSaveFailed(true);
        setPublishNeedsCheck(uncertain);
        setMessage(uncertain ? '发布结果尚未确认，请重新读取规则核对；当前草稿已保留，核对前暂不可再次发布。' : error instanceof Error ? error.message : '保存失败');
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  const restoreRevision = (revision: Revision) => {
    if (savingRef.current || loading) return;
    setEntries((items) => [
      ...items.filter((entry) => (entry.mode || 'image') !== mode),
      ...revision.entries.filter((entry) => (entry.mode || 'image') === mode),
    ]);
    setNote(`恢复${mode === 'video' ? '视频' : '图文'}规则 v${revision.version}：${revision.note}`.slice(0, 200));
    setMessage('已载入当前类型的旧版内容，其他类型规则保持不变；点击“发布新版本”后生效');
  };

  return (
    <section className="space-y-3 border-t border-slate-100 pt-5 dark:border-white/10">
      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{mode === 'video' ? '视频' : '图文'}补充规则 · {current ? `v${current.version}` : loading ? '读取中' : '读取失败'}</h3>
        <p className="mt-2 text-[13px] leading-6 text-slate-600 dark:text-slate-300">发现误判后，在当前类型新增或修改具体规则。两种类型的补充规则分别应用；发布后只影响新导入的审核任务；当前表继续使用首次审核时的版本。</p>
      </div>
      {loading && <p role="status" className="text-xs text-slate-500 dark:text-slate-400">正在读取补充规则…</p>}
      {loadError && <div className="space-y-2 rounded-xl bg-rose-50 p-3"><p role="alert" className="break-words text-xs leading-5 text-rose-700">{loadError}</p><button type="button" disabled={loading || saving} onClick={() => setReloadAttempt((value) => value + 1)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50 dark:bg-[#18191c]">重试读取规则</button></div>}
      {saveFailed && !loadError && <button type="button" disabled={loading || saving} onClick={() => setReloadAttempt((value) => value + 1)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">重新读取已发布规则并核对</button>}
      {current && <fieldset disabled={saving || loading} className="min-w-0 space-y-3 border-0 p-0" aria-label="补充规则编辑">
        {entries.map((entry, index) => (entry.mode || 'image') === mode ? (
          <div key={index} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row dark:border-white/10">
            <select aria-label={`第 ${index + 1} 条规则类别`} value={entry.section} onChange={(event) => setEntries((items) => items.map((item, i) => i === index ? { ...item, section: event.target.value as KeywordReviewRuleEntry['section'] } : item))} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs sm:w-28 dark:border-white/10 dark:bg-[#18191c]">
              {SECTIONS.map((section) => <option key={section}>{section}</option>)}
            </select>
            <textarea aria-label={`第 ${index + 1} 条补充规则`} value={entry.text} maxLength={300} rows={2} onChange={(event) => setEntries((items) => items.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs leading-5 dark:border-white/10" placeholder="写清触发条件、判断结论和边界例外" />
            <button type="button" onClick={() => setEntries((items) => items.filter((_, i) => i !== index))} className="self-start text-xs font-semibold text-rose-600">删除</button>
          </div>
        ) : null)}
        <button type="button" disabled={entries.length >= 30} onClick={() => setEntries((items) => [...items, { section: '其他说明', text: '', mode }])} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50 dark:text-slate-300 dark:border-white/10">添加规则</button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="本次修改原因" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-white/10" placeholder="本次修改原因，例如：修正宠物训练误判" />
          <button type="button" disabled={saving || publishNeedsCheck} onClick={() => void save()} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">{saving ? '保存中…' : '发布新版本'}</button>
        </div>
        {history.length > 0 && <details className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600 dark:text-slate-300 dark:border-white/10">
          <summary className="cursor-pointer font-bold">历史版本（最近 {history.length} 个）</summary>
          <ul className="mt-3 space-y-2">
            {history.map((revision) => <li key={revision.version} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 dark:border-white/10">
              <span className="min-w-0 break-words">v{revision.version} · {revision.note} · 当前类型 {revision.entries.filter((entry) => (entry.mode || 'image') === mode).length} 条</span>
              {revision.version !== current.version && <button type="button" onClick={() => restoreRevision(revision)} className="shrink-0 font-bold text-blue-600 disabled:opacity-50">载入此版</button>}
            </li>)}
          </ul>
        </details>}
      </fieldset>}
      {message && <p role="status" className="break-words text-xs leading-5 text-slate-600 dark:text-slate-300">{message}</p>}
    </section>
  );
}
