import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OutputRating, OutputReviewScores } from '@shared/contracts/categorySkills';
import { outputReviewScoresSchema } from '@shared/contracts/categorySkills';

type Decision = 'accepted' | 'retry_requested' | 'rejected';
const metrics = [['productFidelity', '商品保真'], ['composition', '构图还原'], ['aesthetic', '生活真实感'], ['consistency', '组图一致性']] as const;
export function OutputReviewButtons({ decision, onDecide, rating }: {
  decision?: 'unreviewed' | Decision; rating?: OutputRating;
  onDecide: (decision: Decision, rating?: OutputRating) => void;
}) {
  const [open, setOpen] = useState(false);
  return <div className="flex flex-wrap items-center gap-1">
    {([['accepted', '采用', 'emerald'], ['retry_requested', '重做', 'amber'], ['rejected', '淘汰', 'rose']] as const).map(([value, label]) => <button type="button" key={value} onClick={() => onDecide(value)} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${decision === value ? 'bg-indigo-600 text-white' : 'bg-white/90 text-slate-700 dark:bg-[#18191c]/95 dark:text-slate-200'}`}>{label}</button>)}
    <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-[#18191c]/95 dark:text-indigo-300">{rating ? '修改评分' : '评分反馈'}</button>
    {open && <OutputRatingDialog rating={rating} decision={decision === 'unreviewed' ? undefined : decision} onClose={() => setOpen(false)} onSubmit={(next, rating) => { onDecide(next, rating); setOpen(false); }} />}
  </div>;
}
function OutputRatingDialog({ rating, decision, onClose, onSubmit }: { rating?: OutputRating; decision?: Decision; onClose: () => void; onSubmit: (decision: Decision, rating: OutputRating) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scores, setScores] = useState<Record<keyof OutputReviewScores, string>>({ productFidelity: rating ? String(rating.scores.productFidelity) : '', composition: rating ? String(rating.scores.composition) : '', aesthetic: rating ? String(rating.scores.aesthetic) : '', consistency: rating ? String(rating.scores.consistency) : '' });
  const [note, setNote] = useState(rating?.note || '');
  const [nextDecision, setNextDecision] = useState<Decision>(decision === 'retry_requested' ? 'rejected' : decision || 'accepted');
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(<dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="output-rating-title" className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-2xl bg-white p-6 text-slate-900 backdrop:bg-black/50 dark:bg-[#18191c] dark:text-slate-100">
    <form onSubmit={event => {
      event.preventDefault();
      const result = outputReviewScoresSchema.safeParse(Object.fromEntries(metrics.map(([key]) => [key, Number(scores[key])])));
      if (!result.success || metrics.some(([key]) => scores[key] === '')) { setError('请填写四项 0–100 的整数评分'); return; }
      onSubmit(nextDecision, { scores: result.data, note: note.trim() });
    }}>
      <h3 id="output-rating-title" className="font-semibold">成图评分反馈</h3>
      <p className="mb-4 mt-2 text-xs leading-5 text-slate-500">对照当前商品图和原参考图评分，记录走样、光线、手部接触或风格偏差。反馈关联本次生成时使用的技能版本。</p>
      <div className="grid grid-cols-2 gap-3">{metrics.map(([key, label]) => <label key={key} className="space-y-1 text-xs"><span>{label}（0–100）</span><input type="number" required min={0} max={100} step={1} value={scores[key]} onChange={event => setScores(previous => ({ ...previous, [key]: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-transparent p-2 dark:border-white/10" /></label>)}</div>
      <label className="mt-4 block text-xs">处理结果<select value={nextDecision} onChange={event => setNextDecision(event.target.value as Decision)} className="ml-3 rounded-md bg-slate-100 p-2 dark:bg-white/10"><option value="accepted">采用</option><option value="rejected">淘汰</option></select></label>
      <label className="mt-4 block text-xs">具体问题与改进建议<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-200 bg-transparent p-2 dark:border-white/10" /></label>
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
      <footer className="mt-5 flex justify-end gap-3 text-sm"><button type="button" onClick={onClose}>取消</button><button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-white">保存评分</button></footer>
    </form>
  </dialog>, document.body);
}
