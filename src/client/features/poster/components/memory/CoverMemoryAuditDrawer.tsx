import { useState } from 'react';
import { CoverUsageFeedback, type SaveCoverFeedback } from './CoverUsageFeedback';
import { X } from 'lucide-react';
import { COVER_MEMORY_BRANCHES, type CoverMemoryEntry, type CoverMemoryUsage } from '@shared/contracts/coverMemory';

interface Props {
  usages: CoverMemoryUsage[];
  entries: CoverMemoryEntry[];
  busy: boolean;
  onClose: () => void;
  onRestore: (entry: CoverMemoryEntry) => void;
  onClearTrash: () => void;
  onSaveFeedback: SaveCoverFeedback;
}

const SHEET = [
  ['构图', 'layout'],
  ['字体', 'typeface'],
  ['字色', 'textColor'],
  ['背景', 'background'],
  ['主体', 'subject'],
  ['搭配', 'harmony'],
  ['排重', 'variation'],
] as const;

export function CoverMemoryAuditDrawer({ usages, entries, busy, onClose, onRestore, onClearTrash, onSaveFeedback }: Props) {
  const [limit, setLimit] = useState(30);
  const trash = entries.filter((entry) => entry.status === 'trashed');
  const label = (id: string) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) return id;
    return `${COVER_MEMORY_BRANCHES.find((branch) => branch.id === entry.branch)?.label || '记忆'}：${entry.rule}`;
  };

  return (
    <aside className="absolute right-4 top-4 z-30 flex max-h-[calc(100%-32px)] w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#16161a]/95 text-slate-100 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-bold">记忆审计</span>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="关闭审计"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 border-b border-white/10 text-center text-xs">
        <div className="bg-amber-500/15 py-2 font-bold text-amber-200">引用记录 {usages.length}</div>
        <div className="py-2 font-bold text-slate-400">回收站 {trash.length}</div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section className="space-y-2">
          {usages.length === 0 ? <p className="text-xs leading-5 text-slate-400">生成封面后，这里记录用了哪些记忆，以及那张封面的构图、字体、字色、背景和主体。</p> : usages.slice(0, limit).map((usage) => (
            <article key={usage.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs">
              <p className="font-bold">{usage.itemTitle || '封面'}</p>
              <dl className="mt-2 space-y-1 text-[11px] text-slate-300">
                {SHEET.filter(([, key]) => usage.design[key]).map(([name, key]) => <div key={key}><dt className="inline font-bold text-slate-100">{name} </dt><dd className="inline">{usage.design[key]}</dd></div>)}
              </dl>
              <p className="mt-2 text-[10px] text-slate-400">{new Date(usage.createdAt).toLocaleString()}{usage.design.memoryRevisionId ? ` · 版本 ${usage.design.memoryRevisionId}` : ''}</p>
              <p className="mt-2 whitespace-pre-wrap text-[10px] leading-4 text-amber-200">{'memoryRules' in usage.design ? usage.design.memoryRules || '本次未引用经验' : usage.entryIds.length ? `旧版记录（规则可能已更新）：${usage.entryIds.map(label).join('；')}` : '本次未引用经验'}</p>
              <CoverUsageFeedback usage={usage} busy={busy} onSave={onSaveFeedback} />
            </article>
          ))}
          {limit < usages.length && <button type="button" onClick={() => setLimit((value) => value + 30)} className="text-xs text-amber-200">查看更多引用</button>}
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">回收站</span>
            {trash.length > 0 && <button type="button" disabled={busy} onClick={onClearTrash} className="text-[11px] font-bold text-rose-300 disabled:opacity-40">清空</button>}
          </div>
          {trash.length === 0 ? <p className="text-xs text-slate-500">回收站是空的</p> : trash.map((entry) => (
            <div key={entry.id} className="mb-2 flex items-start justify-between gap-2 rounded-xl border border-white/10 p-2 text-xs">
              <p>{entry.rule}</p>
              <button type="button" disabled={busy} onClick={() => onRestore(entry)} className="shrink-0 font-bold text-amber-200 disabled:opacity-40">恢复</button>
            </div>
          ))}
        </section>
      </div>
    </aside>
  );
}
