import { useState } from 'react';
import { Plus, ChevronUp, ChevronDown, Pencil, Gem, FolderOpen, Settings2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { AssetOrganizationApi } from '../hooks/useAssetOrganization';
import type { AssetProductCategory } from '@beike/domain/assetOrganization';

export function ProductCategoryOptions({ categories }: { categories: AssetProductCategory[] }) {
  return <>{categories.filter(c => !c.parentId).flatMap(parent => [
    <option key={parent.id} value={parent.id}>{parent.name}</option>,
    ...categories.filter(c => c.parentId === parent.id).map(child => <option key={child.id} value={child.id}>{'  '}{parent.name} / {child.name}</option>),
  ])}</>;
}
export default function AssetCategorySidebar({ organization, counts }: { organization: AssetOrganizationApi; counts: Record<string, number> }) {
  const { categories, selectedCategory, setSelectedCategory, mutate, busy } = organization;
  const [managing, setManaging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; parentId: string | null; name: string } | null>(null);
  const reorder = (category: AssetProductCategory, offset: number) => {
    const siblings = categories.filter(c => c.parentId === category.parentId).map(c => c.id);
    const index = siblings.indexOf(category.id); const target = index + offset;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    void mutate({ action: 'reorder-product-categories', parentId: category.parentId, ids: siblings });
  };
  const categoryRow = (c: AssetProductCategory) => <div key={c.id} className={`group rounded-xl ${selectedCategory === c.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'} ${c.parentId ? 'ml-4' : ''}`}>
    <button aria-current={selectedCategory === c.id ? 'page' : undefined} onClick={() => setSelectedCategory(c.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm"><Gem size={14}/><span className="truncate flex-1">{c.name}</span><span className="text-xs text-slate-400">{counts[c.id] || 0}</span></button>
    {managing && <div className="flex justify-end gap-3 px-3 pb-2 text-slate-400">
      {!c.parentId && <button disabled={busy} title={`在${c.name}下新增品类`} onClick={() => setEditing({ name: '', parentId: c.id })}><Plus size={12}/></button>}
      <button disabled={busy} title={`重命名${c.name}`} onClick={() => setEditing(c)}><Pencil size={12}/></button>
      <button disabled={busy} title={`上移${c.name}`} onClick={() => reorder(c,-1)}><ChevronUp size={12}/></button>
      <button disabled={busy} title={`下移${c.name}`} onClick={() => reorder(c,1)}><ChevronDown size={12}/></button>
    </div>}
  </div>;
  if (collapsed) return <aside aria-label="商品品类" className="w-12 border-r border-slate-200 bg-white shrink-0 py-4 flex justify-center"><button title="展开商品品类" onClick={() => setCollapsed(false)} className="h-8 w-8 flex justify-center items-center text-slate-500 rounded-lg hover:bg-slate-100"><PanelLeftOpen size={17}/></button></aside>;
  return <aside aria-label="商品品类" className="w-48 xl:w-52 shrink-0 border-r border-slate-200 px-3 py-5 overflow-y-auto bg-white">
    <div className="px-3 mb-4 flex items-center gap-2 text-xs font-medium text-slate-400"><span className="flex-1">商品品类</span><button title={managing ? '完成品类管理' : '管理品类'} aria-pressed={managing} onClick={() => setManaging(!managing)} className={managing ? 'text-indigo-600' : 'hover:text-slate-700'}><Settings2 size={14}/></button><button title="收起商品品类" onClick={() => setCollapsed(true)} className="hover:text-slate-700"><PanelLeftClose size={14}/></button></div>
    <button onClick={() => setSelectedCategory('all')} className={`w-full flex items-center gap-2 px-3 py-3 rounded-xl text-sm ${selectedCategory === 'all' ? 'bg-indigo-50 text-indigo-700' : ''}`}><FolderOpen size={15}/>全部<span className="ml-auto text-xs">{counts.all || 0}</span></button>
    <div className="space-y-1 my-2">{categories.filter(c => !c.parentId).map(c => <div key={c.id}>{categoryRow(c)}{categories.filter(child => child.parentId === c.id).map(categoryRow)}</div>)}</div>
    <button onClick={() => setSelectedCategory('unclassified')} className={`w-full px-3 py-3 rounded-xl text-left text-sm ${selectedCategory === 'unclassified' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'}`}>待分类 <span className="float-right text-xs">{counts.unclassified || 0}</span></button>
    <button onClick={() => setEditing({ name: '', parentId: null })} className="mt-4 flex items-center gap-2 px-3 py-2 text-xs text-indigo-600"><Plus size={14}/>新增品类</button>
    {editing && <form className="mt-3 space-y-2" onSubmit={async e => { e.preventDefault(); if (await mutate({ action: 'save-product-category', ...editing })) setEditing(null); }}>
      <label className="text-xs text-slate-500">{editing.id ? '重命名品类' : editing.parentId ? '新增二级品类' : '新增商品品类'}</label>
      <input aria-label="品类名称" autoFocus required maxLength={40} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full rounded-lg border px-2 py-2 text-sm"/>
      <div className="flex gap-3 text-xs"><button disabled={busy} className="text-indigo-600" type="submit">保存</button><button type="button" onClick={() => setEditing(null)}>取消</button></div>
    </form>}
  </aside>;
}
