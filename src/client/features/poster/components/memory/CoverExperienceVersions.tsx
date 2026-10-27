import { useRef, useState } from 'react';
import type { CoverMemoryRevision } from '@shared/contracts/coverMemory';
import { readCoverRevision } from '../../api/coverMemoryApi';

interface Props {
  revisions: CoverMemoryRevision[];
  busy: boolean;
  onRestore: (id: string) => Promise<boolean>;
}

export function CoverExperienceVersions({ revisions, busy, onRestore }: Props) {
  const [selected, setSelected] = useState<CoverMemoryRevision | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(30);
  const request = useRef(0);
  const read = async (id: string) => {
    const sequence = ++request.current;
    setLoading(true); setError(''); setConfirming(false);
    try {
      const revision = await readCoverRevision(id);
      if (sequence === request.current) setSelected(revision);
    } catch (reason) {
      if (sequence === request.current) { setSelected(null); setError(reason instanceof Error ? reason.message : '版本读取失败'); }
    } finally { if (sequence === request.current) setLoading(false); }
  };
  const download = () => {
    if (!selected?.markdown) return;
    const url = URL.createObjectURL(new Blob([selected.markdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `封面经验-${selected.id}.md`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="absolute inset-0 overflow-y-auto p-6">
      <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-[280px_1fr]">
        <section className="space-y-2">
          <h2 className="text-sm font-black">经验版本 · {revisions.length}</h2>
          <p className="text-xs leading-5 text-slate-400">采纳、停用、纠正或回退后自动保存。按样张整理已采纳规则，保留来源，可导出查看。</p>
          {revisions.length === 0 && <p className="py-4 text-xs text-slate-400">首次调整采纳状态或保存纠正时，会保留原有经验并创建版本。</p>}
          {revisions.slice(0, limit).map((revision, index) => (
            <button type="button" key={revision.id} onClick={() => { void read(revision.id); }} className={`block w-full rounded-xl border p-3 text-left text-xs ${selected?.id === revision.id ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}>
              <p className="font-bold">{index === 0 ? '当前 · ' : ''}{revision.reason}</p>
              <p className="mt-1 text-slate-400">{new Date(revision.createdAt).toLocaleString()} · {revision.entryCount} 条 / {revision.sampleCount} 张</p>
            </button>
          ))}
          {limit < revisions.length && <button type="button" className="text-xs text-amber-200" onClick={() => setLimit((value) => value + 30)}>查看更多版本</button>}
        </section>
        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {loading ? <p role="status" className="text-xs text-slate-400">读取版本中…</p> : selected ? <>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button type="button" onClick={download} className="rounded-lg border border-white/20 px-3 py-2">导出经验 .md</button>
              <button type="button" disabled={busy || selected.id === revisions[0]?.id} onClick={() => setConfirming(true)} className="rounded-lg border border-amber-400/40 px-3 py-2 text-amber-200 disabled:opacity-40">回退到此版本</button>
            </div>
            {confirming && <div className="my-3 rounded-xl border border-amber-400/30 p-3 text-xs leading-5">
              <p>将采纳状态恢复到此版本的 {selected.entryCount} 条规则；历史记录保留，并创建新的回退版本。此前清空的规则也会恢复。</p>
              <div className="mt-2 flex gap-4"><button type="button" disabled={busy} onClick={() => { void onRestore(selected.id).then((ok) => { if (ok) setConfirming(false); }); }} className="font-bold text-amber-200 disabled:opacity-40">确认回退</button><button type="button" onClick={() => setConfirming(false)}>取消</button></div>
            </div>}
            <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-xs leading-6 text-slate-300">{selected.markdown}</pre>
          </> : <p className="text-xs text-slate-400">选择一个版本查看完整经验。</p>}
          {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
        </section>
      </div>
    </div>
  );
}
