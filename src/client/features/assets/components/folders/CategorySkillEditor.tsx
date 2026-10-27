import { useState } from 'react';
import type { CategorySkillVersion } from '@shared/contracts/categorySkills';

export function CategorySkillEditor({ version, busy, onRun, onClose }: {
  version: CategorySkillVersion;
  busy: boolean;
  onRun: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
  onClose: () => void;
}) {
  const [content, setContent] = useState(version.promptSnippet);
  const [summary, setSummary] = useState('');
  const dirty = content !== version.promptSnippet || Boolean(summary);
  const close = () => { if (!busy && (!dirty || window.confirm('技能修改尚未保存，确定取消吗？'))) onClose(); };
  return <form data-skill-dirty={dirty ? 'true' : undefined} className="mt-4 space-y-3" onSubmit={async event => {
    event.preventDefault();
    if (busy || !content.trim() || content.trim() === version.promptSnippet.trim()) return;
    if (await onRun('edit', { versionId: version.id, promptSnippet: content, summary })) onClose();
  }}>
    <p className="text-xs leading-6 text-slate-500">修改后保存为新候选版本。确认内容后，可试用或设为正式技能，已有版本保留供回滚。</p>
    <label className="block text-xs font-medium">技能正文<textarea autoFocus aria-label="技能正文" disabled={busy} value={content} maxLength={16000} onChange={event => setContent(event.target.value)} className="mt-2 min-h-72 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-black/20" /></label>
    <label className="block text-xs font-medium">修改说明<input aria-label="技能修改说明" disabled={busy} value={summary} maxLength={200} onChange={event => setSummary(event.target.value)} placeholder="例如：减少道具，改用自然侧光" className="mt-2 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-xs outline-none focus:border-indigo-400 dark:border-white/10" /></label>
    <div className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-500">{content.length} / 16000 字</span><div className="flex gap-2">
      <button type="button" disabled={busy} onClick={close} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">取消编辑</button>
      <button type="submit" disabled={busy || !content.trim() || content.trim() === version.promptSnippet.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white disabled:opacity-40">{busy ? '保存中…' : '保存为新版本'}</button>
    </div></div>
  </form>;
}
