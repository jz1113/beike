import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '@client/shared/api/apiClient';

export function AssetCoverageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!open) return;
    void apiFetch('/api/catalog/assets/coverage').then(async (res) => setData(await res.json().catch(() => null)));
  }, [open]);
  if (!open) return null;
  const gaps = data?.gaps || [];
  const control = data?.rankingAb?.control || [];
  const experiment = data?.rankingAb?.experiment || [];
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">资产覆盖度与推荐对照</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-[11px] text-slate-500">类目 × 景别 × 动作槽位缺口；对照规则排序与加权推荐。</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 text-xs font-bold text-slate-700">覆盖缺口</div>
            <div className="space-y-1">
              {gaps.slice(0, 12).map((gap: any) => (
                <div key={`${gap.categoryId}-${gap.shotScale}-${gap.actionSlot}`} className="flex justify-between text-[11px] text-slate-600">
                  <span>{gap.categoryId} / {gap.shotScale} / {gap.actionSlot}</span>
                  <span className="font-bold text-rose-600">缺 {gap.gap}</span>
                </div>
              ))}
              {gaps.length === 0 ? <div className="text-[11px] text-slate-400">暂无缺口</div> : null}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 text-xs font-bold text-slate-700">A/B 推荐</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <div className="mb-1 font-bold text-slate-500">规则对照</div>
                {control.slice(0, 6).map((item: any) => <div key={item.id}>{item.id.slice(0, 8)} · {Math.round(item.score)}</div>)}
              </div>
              <div>
                <div className="mb-1 font-bold text-indigo-600">加权实验</div>
                {experiment.slice(0, 6).map((item: any) => <div key={item.id}>{item.id.slice(0, 8)} · {Math.round(item.score)}</div>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
