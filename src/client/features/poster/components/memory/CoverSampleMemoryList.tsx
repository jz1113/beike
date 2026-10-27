import { useState } from 'react';
import type { CoverMemoryEntry, CoverMemorySample } from '@shared/contracts/coverMemory';
import { COVER_MEMORY_BRANCHES } from '@shared/contracts/coverMemory';

interface Props {
  samples: CoverMemorySample[];
  entries: CoverMemoryEntry[];
  busy: boolean;
  onRetry: (sample: CoverMemorySample) => void;
  onSetStatus: (entry: CoverMemoryEntry, status: CoverMemoryEntry['status']) => void;
}

export function CoverSampleMemoryList({ samples, entries, busy, onSetStatus, onRetry }: Props) {
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(30);
  const visible = samples.filter((sample) => !search.trim() || `${sample.title} ${sample.model} ${entries.filter((entry) => entry.sampleId === sample.id && entry.status !== 'trashed').map((entry) => entry.rule).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="absolute inset-0 overflow-y-auto p-6">
      <div className="mx-auto grid max-w-5xl gap-4">
        <label className="text-xs text-slate-400">样张 {samples.length} 张 · 搜索标题或规则
          <input value={search} onChange={(event) => { setSearch(event.target.value); setLimit(30); }} className="mt-2 block w-full rounded-xl border border-white/20 bg-transparent px-3 py-2 text-sm text-white" />
        </label>
        {visible.length === 0 && <p className="text-sm text-slate-400">{samples.length ? '没有匹配的样张' : '还没有样张。把封面投喂给右下角的小怪兽。'}</p>}
        {visible.slice(0, limit).map((sample) => {
          const related = entries.filter((entry) => entry.sampleId === sample.id && entry.status !== 'trashed');
          const grouped = sample.imageUrls.length > 1;
          const retried = samples.some((candidate) => candidate.requestKey?.startsWith(`retry_${sample.id}_`));
          return (
            <article key={sample.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex gap-1">
                  {sample.imageUrls.slice(0, 4).map((url) => <img key={url} src={url} alt="" loading="lazy" className="h-14 w-11 rounded-lg object-cover" />)}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black">{sample.title || '封面样张'}</h3>
                  <p className="text-[11px] text-slate-400">{grouped ? '旧版分组反推，特点没有按单张拆开' : '这一张自己的特点'} · {sample.status === 'failed' ? sample.error || '反推失败' : sample.status === 'running' ? '反推中，自动核对原任务' : `${related.length} 条，其中 ${related.filter((entry) => entry.status === 'adopted').length} 条已采纳`}</p>
                </div>
              </div>
              {sample.status === 'failed' && retried && <p className="mb-3 text-xs text-slate-400">已创建重试，请查看较新的样张记录。</p>}
              {sample.status === 'failed' && !retried && <button type="button" disabled={busy} onClick={() => onRetry(sample)} className="mb-3 text-xs font-bold text-amber-200 disabled:opacity-40">核对并重试</button>}
              <div className="space-y-2">
                {related.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-white/10 p-3 text-xs">
                    <p className="font-bold text-amber-200">{COVER_MEMORY_BRANCHES.find((branch) => branch.id === entry.branch)?.label}</p>
                    <p className="mt-1 leading-5">{entry.rule}</p>
                    {entry.evidence && <p className="mt-1 text-[11px] text-slate-400">依据：{entry.evidence}</p>}
                    <div className="mt-2 flex gap-2">
                      {entry.status === 'adopted' && <button type="button" disabled={busy} onClick={() => onSetStatus(entry, 'pending')} className="rounded-lg px-2 py-1 text-[10px] font-bold text-slate-300 disabled:opacity-40">停用</button>}
                      {entry.status !== 'adopted' && <button type="button" disabled={busy} onClick={() => onSetStatus(entry, 'adopted')} className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-bold text-slate-950 disabled:opacity-40">采纳</button>}
                      <button type="button" disabled={busy} onClick={() => onSetStatus(entry, 'trashed')} className="rounded-lg px-2 py-1 text-[10px] font-bold text-rose-300 disabled:opacity-40">丢弃</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
        {limit < visible.length && <button type="button" onClick={() => setLimit((value) => value + 30)} className="text-xs text-amber-200">查看更多样张</button>}
      </div>
    </div>
  );
}
