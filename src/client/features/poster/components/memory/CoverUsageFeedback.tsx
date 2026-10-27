import { useState } from 'react';
import type { CoverMemoryUsage } from '@shared/contracts/coverMemory';

export type SaveCoverFeedback = (id: string, rating: '' | 'good' | 'bad', note: string, correction: string) => Promise<boolean>;

export function CoverUsageFeedback({ usage, busy, onSave }: { usage: CoverMemoryUsage; busy: boolean; onSave: SaveCoverFeedback }) {
  const [rating, setRating] = useState<'' | 'good' | 'bad'>(usage.rating || '');
  const [note, setNote] = useState(usage.note || '');
  const [correction, setCorrection] = useState('');
  const [saved, setSaved] = useState(false);
  return (
    <details className="mt-3 border-t border-white/10 pt-2">
      <summary className="cursor-pointer font-bold text-slate-300">成图反馈{usage.rating ? ` · ${usage.rating === 'good' ? '有效' : '需改进'}` : ''}</summary>
      <form className="mt-2 space-y-2" onSubmit={(event) => { event.preventDefault(); setSaved(false); void onSave(usage.id, rating, note, correction).then((ok) => { if (ok) { setCorrection(''); setSaved(true); } }); }}>
        <label className="block">评价
          <select aria-label="成图评价" value={rating} disabled={busy} onChange={(event) => { setRating(event.target.value as typeof rating); setSaved(false); }} className="mt-1 block w-full rounded-lg border border-white/20 bg-[#222228] p-2">
            <option value="">未评价</option><option value="good">有效，符合预期</option><option value="bad">需改进</option>
          </select>
        </label>
        <label className="block">效果备注（只记录观察）<textarea value={note} maxLength={500} disabled={busy} onChange={(event) => { setNote(event.target.value); setSaved(false); }} className="mt-1 w-full rounded-lg border border-white/20 bg-transparent p-2" /></label>
        <label className="block">加入全局纠正（可选，保存即采纳）<textarea value={correction} minLength={correction ? 2 : undefined} maxLength={300} disabled={busy} onChange={(event) => { setCorrection(event.target.value); setSaved(false); }} placeholder="例如：商品商标附近避免叠加标题" className="mt-1 w-full rounded-lg border border-white/20 bg-transparent p-2" /></label>
        <p className="text-[10px] leading-4 text-slate-400">评价影响自动选样；备注不改变规则。同条记录再次填写纠正会更新该条纠正。留空保留已有纠正，可在纠正分支停用。</p>
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-400 px-3 py-1.5 font-bold text-slate-950 disabled:opacity-40">保存反馈</button>
        {saved && <p role="status" className="text-emerald-300">反馈已保存</p>}
      </form>
    </details>
  );
}
