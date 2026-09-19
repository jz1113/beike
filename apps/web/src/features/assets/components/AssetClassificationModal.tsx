import { useState } from 'react';
import type { AssetProductCategory } from '@beike/domain/assetOrganization';
import { ProductCategoryOptions } from './AssetCategorySidebar';
export default function AssetClassificationModal({ categories, fullPrompt, count, initialIds, initialUniversal, busy, onSave, onClose }: {
  categories: AssetProductCategory[]; fullPrompt: boolean; count: number; initialIds: string[]; initialUniversal: boolean; busy: boolean;
  onSave: (ids: string[], universal: boolean) => Promise<void>; onClose: () => void;
}) {
  const [ids, setIds] = useState(initialIds); const [universal, setUniversal] = useState(initialUniversal);
  return <div className="fixed inset-0 z-[90] bg-slate-900/30 flex items-center justify-center p-6" onClick={onClose}>
    <form role="dialog" aria-modal="true" aria-label="调整商品品类" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); void onSave(ids, universal); }} className="bg-white rounded-2xl shadow-xl p-6 w-96 space-y-4">
      <h2 className="font-bold">{fullPrompt ? '调整图集归属' : '设置素材适用品类'}</h2>
      <p className="text-xs text-slate-500">{fullPrompt ? `选中条目所属的 ${count} 套图集将整体调整归属。` : `为 ${count} 条素材设置适用品类，可选择多个。`}</p>
      {fullPrompt ? <select aria-label="图集主品类" value={ids[0] || ''} onChange={e => setIds(e.target.value ? [e.target.value] : [])} className="border rounded-lg p-2 w-full"><option value="">待分类</option><ProductCategoryOptions categories={categories}/></select> : <>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={universal} onChange={e => setUniversal(e.target.checked)}/>通用素材（适用所有品类）</label>
        <div className="max-h-64 overflow-y-auto space-y-2">{categories.map(c => <label key={c.id} className="flex gap-2 text-sm"><input type="checkbox" checked={ids.includes(c.id)} onChange={e => setIds(e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))}/>{c.parentId ? `${categories.find(p => p.id === c.parentId)?.name} / ` : ''}{c.name}</label>)}</div>
        <p className="text-xs text-slate-400">未勾选品类且未标为通用时，归入待分类。</p>
      </>}
      <div className="flex justify-end gap-3 text-sm"><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" disabled={busy} className="bg-indigo-600 text-white rounded-lg px-4 py-2">保存</button></div>
    </form>
  </div>;
}
