import type { CoverMemoryEntry, CoverMemorySample } from '@shared/contracts/coverMemory';
import { COVER_MEMORY_BRANCHES } from '@shared/contracts/coverMemory';

interface Props {
  samples: CoverMemorySample[];
  entries: CoverMemoryEntry[];
  busy: boolean;
  onSetStatus: (entry: CoverMemoryEntry, status: CoverMemoryEntry['status']) => void;
}

export function CoverSampleMemoryList({ samples, entries, busy, onSetStatus }: Props) {
  const visible = samples.filter((sample) => entries.some((entry) => entry.sampleId === sample.id && entry.status !== 'trashed'));
  if (visible.length === 0) return <p className="absolute left-1/2 top-1/2 -translate-x-1/2 text-sm text-slate-300">还没有样张。把封面投喂给右下角的小怪兽。</p>;

  return (
    <div className="absolute inset-0 overflow-y-auto p-6">
      <div className="mx-auto grid max-w-5xl gap-4">
        {visible.map((sample) => {
          const related = entries.filter((entry) => entry.sampleId === sample.id && entry.status !== 'trashed');
          const grouped = sample.imageUrls.length > 1;
          return (
            <article key={sample.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex gap-1">
                  {sample.imageUrls.slice(0, 4).map((url) => <img key={url} src={url} alt="" className="h-14 w-11 rounded-lg object-cover" />)}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black">{sample.title || '封面样张'}</h3>
                  <p className="text-[11px] text-slate-400">{grouped ? '旧版分组反推，特点没有按单张拆开' : '这一张自己的特点'} · {sample.status === 'failed' ? sample.error || '反推失败' : `${related.length} 条`}</p>
                </div>
              </div>
              <div className="space-y-2">
                {related.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-white/10 p-3 text-xs">
                    <p className="font-bold text-amber-200">{COVER_MEMORY_BRANCHES.find((branch) => branch.id === entry.branch)?.label}</p>
                    <p className="mt-1 leading-5">{entry.rule}</p>
                    {entry.evidence && <p className="mt-1 text-[11px] text-slate-400">依据：{entry.evidence}</p>}
                    <div className="mt-2 flex gap-2">
                      {entry.status !== 'adopted' && <button type="button" disabled={busy} onClick={() => onSetStatus(entry, 'adopted')} className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-bold text-slate-950 disabled:opacity-40">采纳</button>}
                      <button type="button" disabled={busy} onClick={() => onSetStatus(entry, 'trashed')} className="rounded-lg px-2 py-1 text-[10px] font-bold text-rose-300 disabled:opacity-40">丢弃</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
