import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { FolderInput, X } from 'lucide-react';
import { apiFetch } from '@client/shared/api/apiClient';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { promptGroupCategoryKey, topLevelCategories } from '../model/promptGroupCategory';
import { promptGroupSubcategoryOptions, recognizedPromptGroupSubcategory } from '../model/promptGroupSubcategory';

interface Props {
  items: AssetLibrarySlim[];
  categories: AssetProductCategory[];
  albums: PromptAlbum[];
  onClose: () => void;
  onMoved: () => void;
}

export function MovePromptGroupsDialog({ items, categories, albums, onClose, onMoved }: Props) {
  const initialCategory = useMemo(() => {
    const values = new Set(items.map(item => promptGroupCategoryKey(item, categories, albums)));
    return values.size === 1 ? [...values][0] : '';
  }, [items, categories, albums]);
  const [categoryId, setCategoryId] = useState(initialCategory === 'universal' ? '' : initialCategory);
  const [subcategoryId, setSubcategoryId] = useState(() => {
    if (!initialCategory || initialCategory === 'unclassified' || initialCategory === 'universal') return '';
    const values = new Set(items.map(item => recognizedPromptGroupSubcategory(item.productSubcategory, categories, initialCategory) || ''));
    return values.size === 1 ? [...values][0] : '';
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const categoryRef = useRef<HTMLSelectElement>(null);
  const subcategories = promptGroupSubcategoryOptions(categories, categoryId);
  const changesMajor = !!categoryId && items.some(item => promptGroupCategoryKey(item, categories, albums) !== categoryId);
  const hasChange = !!categoryId && items.some(item => {
    const currentCategory = promptGroupCategoryKey(item, categories, albums);
    if (currentCategory !== categoryId) return true;
    return categoryId !== 'unclassified'
      && (recognizedPromptGroupSubcategory(item.productSubcategory, categories, categoryId) || '') !== subcategoryId;
  });

  useEffect(() => { categoryRef.current?.focus(); }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !hasChange || items.length > 100) return;
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch('/api/catalog/assets/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move-prompt-groups',
          ids: items.map(item => item.id),
          productCategoryId: categoryId === 'unclassified' ? null : categoryId,
          productSubcategory: categoryId === 'unclassified' ? null : subcategoryId || null,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || '移动失败');
      onMoved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '移动失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(<div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
    onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="move-prompt-groups-title" onSubmit={save}
      onKeyDown={event => { if (event.key === 'Escape' && !saving) { event.stopPropagation(); onClose(); } }}
      className="w-full max-w-md rounded-2xl border border-white bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="move-prompt-groups-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
            <FolderInput className="h-4 w-4 text-indigo-600" />移动到分类
          </h2>
          <p className="mt-1 text-xs text-slate-500">已选 {items.length} 个图组母本</p>
        </div>
        <button type="button" aria-label="关闭" disabled={saving} onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-700">商品大类
          <select ref={categoryRef} value={categoryId} onChange={event => { setCategoryId(event.target.value); setSubcategoryId(''); }}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">
            <option value="" disabled>请选择大类</option>
            <option value="unclassified">待分类</option>
            {topLevelCategories(categories).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-700">商品细分
          <select value={subcategoryId} disabled={!categoryId || categoryId === 'unclassified'} onChange={event => setSubcategoryId(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400">
            <option value="">待分类</option>
            {subcategories.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
        {changesMajor
          ? '切换商品大类会同步同一图集的其他图组；未选中图组原有的商品细分会清空。'
          : '仅调整选中图组的商品细分；同一图集的其他图组不受影响。'}
      </p>
      {items.length > 100 && <p role="alert" className="mt-3 text-xs text-rose-600">单次最多移动 100 组，请缩小选择范围。</p>}
      {error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">取消</button>
        <button type="submit" disabled={saving || !hasChange || items.length > 100}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">
          {saving ? '移动中…' : `移动 ${items.length} 组`}
        </button>
      </div>
    </form>
  </div>, document.body);
}
