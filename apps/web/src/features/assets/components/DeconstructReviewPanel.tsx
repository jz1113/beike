import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/shared/api/apiClient';

type Review = { id: string; albumName: string; payload: { productCategoryId?: string; imageUrls: string[]; perImageResults: { image_index: number; title?: string; reverse_prompt_zh?: string; reverse_prompt?: string }[] } };
export default function DeconstructReviewPanel({ refreshKey, onApproved }: { refreshKey: boolean; onApproved: () => void }) {
  const [rows, setRows] = useState<Review[]>([]);
  const [rejected, setRejected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/catalog/assets/reviews?status=${rejected ? 'rejected' : 'pending'}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '读取待审核图集失败');
      setRows(data.data || []); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : '读取失败'); }
  }, [rejected]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const act = async (id: string, action: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await apiFetch('/api/catalog/assets/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '审核失败');
      await load(); if (action === 'approve') onApproved();
    } catch (e) { setError(e instanceof Error ? e.message : '审核失败'); }
    finally { setBusy(false); }
  };
  return <details className="rounded-xl border border-slate-200 p-3 bg-white">
    <summary className="cursor-pointer font-semibold">反推结果审核 · {rejected ? '已移出' : '待审核'} {rows.length} 套</summary>
    <div className="pt-3 space-y-3">
      <p className="text-slate-500">快捷反推结果保存在这里，审核通过后才进入正式库。移出后可恢复。</p>
      <button type="button" disabled={busy} className="text-indigo-600" onClick={() => setRejected(!rejected)}>{rejected ? '返回待审核' : '查看已移出图集'}</button>
      {error && <p role="alert" className="text-red-600">{error}<button type="button" onClick={() => void load()} className="ml-2 underline">重新加载</button></p>}
      {rows.map(row => <details key={row.id} className="border rounded-lg p-3">
        <summary className="cursor-pointer">{row.albumName} · {row.payload.perImageResults.length} 条提示词</summary>
        <div className="space-y-3 mt-3">
          {row.payload.perImageResults.map((item, i) => <div key={i} className="flex gap-3">
            <img src={row.payload.imageUrls[item.image_index - 1]} alt={`原图 ${item.image_index}`} className="w-24 h-28 rounded object-cover"/>
            <div className="min-w-0"><h4 className="font-semibold">第 {item.image_index} 张 · {item.title}</h4><p className="whitespace-pre-wrap text-slate-600 mt-1 select-text">{item.reverse_prompt_zh || item.reverse_prompt}</p></div>
          </div>)}
          <div className="flex gap-3">
            {rejected ? <button disabled={busy} onClick={() => void act(row.id, 'restore')} className="text-indigo-600">恢复至待审核</button> : <>
              <button disabled={busy} onClick={() => void act(row.id, 'approve')} className="bg-indigo-600 text-white px-3 py-2 rounded-lg disabled:opacity-40">审核通过并入库</button>
              <button disabled={busy} onClick={() => void act(row.id, 'reject')} className="text-slate-500 disabled:opacity-40">移出待审核</button>
            </>}
          </div>
        </div>
      </details>)}
    </div>
  </details>;
}
