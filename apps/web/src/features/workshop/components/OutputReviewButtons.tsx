export function OutputReviewButtons({
  decision,
  onDecide,
}: {
  decision?: 'unreviewed' | 'accepted' | 'retry_requested' | 'rejected';
  onDecide: (decision: 'accepted' | 'retry_requested' | 'rejected') => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onDecide('accepted')} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${decision === 'accepted' ? 'bg-emerald-500 text-white' : 'bg-white/90 text-emerald-700'}`}>采用</button>
      <button type="button" onClick={() => onDecide('retry_requested')} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${decision === 'retry_requested' ? 'bg-amber-500 text-white' : 'bg-white/90 text-amber-700'}`}>重做</button>
      <button type="button" onClick={() => onDecide('rejected')} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${decision === 'rejected' ? 'bg-rose-500 text-white' : 'bg-white/90 text-rose-700'}`}>淘汰</button>
    </div>
  );
}
