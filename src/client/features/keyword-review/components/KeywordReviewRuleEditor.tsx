import { useEffect, useState } from 'react';
import type { KeywordReviewMode, KeywordReviewRuleEntry } from '@shared/contracts/generate';
import { apiFetch } from '@client/shared/api/apiClient';

type Revision = {
  version: number;
  entries: KeywordReviewRuleEntry[];
  note: string;
  createdAt: string | null;
};

const SECTIONS = ['垂类边界', '不制作', '其他说明'] as const;

export function KeywordReviewRuleEditor({ open, mode }: { open: boolean; mode: KeywordReviewMode }) {
  const [current, setCurrent] = useState<Revision | null>(null);
  const [history, setHistory] = useState<Revision[]>([]);
  const [entries, setEntries] = useState<KeywordReviewRuleEntry[]>([]);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void apiFetch('/api/generate/keyword-review/rules')
      .then(async (response) => {
        if (!response.ok) throw new Error('读取补充规则失败');
        return response.json() as Promise<{ current: Revision; history: Revision[] }>;
      })
      .then((data) => {
        if (!active) return;
        setCurrent(data.current);
        setEntries(data.current.entries);
        setHistory(data.history);
        setNote('');
        setMessage('');
      })
      .catch((error: Error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [open, mode]);

  const save = async () => {
    if (!current || saving) return;
    if (!note.trim()) { setMessage('请填写本次修改原因'); return; }
    if (entries.some((entry) => entry.text.trim().length < 4)) { setMessage('每条补充规则至少填写 4 个字'); return; }
    if (entries.reduce((total, entry) => total + entry.text.length, 0) > 6000) { setMessage('补充规则总长度不能超过 6000 字'); return; }
    setSaving(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/generate/keyword-review/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseVersion: current.version, entries, note: note.trim() }),
      });
      const data = await response.json() as { success?: boolean; current?: Revision; error?: string };
      if (!response.ok || !data.success || !data.current) throw new Error(data.error || '保存失败');
      setCurrent(data.current);
      setEntries(data.current.entries);
      setHistory((items) => [data.current as Revision, ...items].slice(0, 30));
      setNote('');
      setMessage(`已发布 v${data.current.version}，下次审核开始使用`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 border-t border-slate-100 pt-5">
      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{mode === 'video' ? '视频' : '图文'}补充规则 · {current ? `v${current.version}` : '读取中'}</h3>
        <p className="mt-2 text-[13px] leading-6 text-slate-600">发现误判后，在当前类型新增或修改具体规则。两种类型的补充规则分别应用；发布后只影响新开始的审核。</p>
      </div>
      {current && <>
        {entries.map((entry, index) => (entry.mode || 'image') === mode ? (
          <div key={index} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row">
            <select aria-label={`第 ${index + 1} 条规则类别`} value={entry.section} onChange={(event) => setEntries((items) => items.map((item, i) => i === index ? { ...item, section: event.target.value as KeywordReviewRuleEntry['section'] } : item))} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs sm:w-28">
              {SECTIONS.map((section) => <option key={section}>{section}</option>)}
            </select>
            <textarea aria-label={`第 ${index + 1} 条补充规则`} value={entry.text} maxLength={300} rows={2} onChange={(event) => setEntries((items) => items.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs leading-5" placeholder="写清触发条件、判断结论和边界例外" />
            <button type="button" onClick={() => setEntries((items) => items.filter((_, i) => i !== index))} className="self-start text-xs font-semibold text-rose-600">删除</button>
          </div>
        ) : null)}
        <button type="button" disabled={entries.length >= 30} onClick={() => setEntries((items) => [...items, { section: '其他说明', text: '', mode }])} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">添加规则</button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="本次修改原因" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder="本次修改原因，例如：修正宠物训练误判" />
          <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? '保存中…' : '发布新版本'}</button>
        </div>
        {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
        {history.length > 0 && <details className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-bold">历史版本（最近 {history.length} 个）</summary>
          <ul className="mt-3 space-y-2">
            {history.map((revision) => <li key={revision.version} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
              <span>v{revision.version} · {revision.note} · {revision.entries.length} 条</span>
              {revision.version !== current.version && <button type="button" onClick={() => { setEntries(revision.entries); setNote(`恢复 v${revision.version}：${revision.note}`.slice(0, 200)); setMessage('已载入旧版内容，点击“发布新版本”后生效'); }} className="shrink-0 font-bold text-blue-600">载入此版</button>}
            </li>)}
          </ul>
        </details>}
      </>}
    </section>
  );
}
