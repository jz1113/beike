import { useState } from 'react';
import { X } from 'lucide-react';
import { COVER_MEMORY_BRANCHES, type CoverMemoryBranch, type CoverMemoryEntry, type CoverMemorySample } from '@shared/contracts/coverMemory';

interface Props {
  branch: CoverMemoryBranch;
  entries: CoverMemoryEntry[];
  samples: CoverMemorySample[];
  busy: boolean;
  onClose: () => void;
  onSetStatus: (entry: CoverMemoryEntry, status: CoverMemoryEntry['status']) => void;
  onAddCorrection: (rule: string) => void;
}

export function CoverBranchDetailPopover({ branch, entries, samples, busy, onClose, onSetStatus, onAddCorrection }: Props) {
  const [rule, setRule] = useState('');
  const title = COVER_MEMORY_BRANCHES.find((item) => item.id === branch)?.label || '记忆';
  const visible = entries.filter((entry) => entry.status !== 'trashed');
  const pending = visible.filter((entry) => entry.status === 'pending');
  const adopted = visible.filter((entry) => entry.status === 'adopted');
  const sampleOf = (entry: CoverMemoryEntry) => samples.find((sample) => sample.id === entry.sampleId);

  const submit = () => {
    const next = rule.trim();
    if (next.length < 2) return;
    onAddCorrection(next);
    setRule('');
  };

  return (
    <div className="w-80 rounded-2xl border border-white/10 bg-[#1a1a1e]/95 p-3 text-xs text-slate-100 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold">{title}</span>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="关闭"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="max-h-72 space-y-3 overflow-y-auto">
        {[{ name: '待确认', list: pending }, { name: '已采纳', list: adopted }].map((group) => (
          <section key={group.name}>
            <p className="mb-1 text-[10px] font-bold text-slate-400">{group.name} {group.list.length}</p>
            {group.list.length === 0 ? <p className="text-[11px] text-slate-500">没有条目</p> : group.list.map((entry) => (
              <article key={entry.id} className="mb-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <div className="flex gap-2">
                  {sampleOf(entry)?.imageUrls[0] && <img src={sampleOf(entry)?.imageUrls[0]} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
                  <p className="min-w-0 flex-1 leading-5">{entry.rule}</p>
                </div>
                {(sampleOf(entry)?.imageUrls.length || 0) > 1 && <p className="mt-1 text-[10px] text-slate-500">旧版分组反推，缩略图是这组的第一张</p>}
                {entry.evidence && <p className="mt-1 text-[10px] text-slate-400">依据：{entry.evidence}</p>}
                <div className="mt-2 flex gap-2">
                  {entry.status !== 'adopted' && <button type="button" disabled={busy} onClick={() => onSetStatus(entry, 'adopted')} className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-bold text-slate-950 disabled:opacity-40">采纳</button>}
                  <button type="button" disabled={busy} onClick={() => onSetStatus(entry, 'trashed')} className="rounded-lg px-2 py-1 text-[10px] font-bold text-rose-300 hover:bg-white/10 disabled:opacity-40">丢弃</button>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
      {branch === 'correction' && (
        <div className="mt-2 flex gap-1.5 border-t border-white/10 pt-2">
          <input value={rule} onChange={(event) => setRule(event.target.value)} placeholder="例如：不要挡住镜头" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 outline-none" />
          <button type="button" disabled={busy || rule.trim().length < 2} onClick={submit} className="rounded-lg bg-white px-2 text-[11px] font-bold text-slate-950 disabled:opacity-40">写入</button>
        </div>
      )}
    </div>
  );
}
