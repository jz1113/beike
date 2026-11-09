import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { apiFetch } from '@client/shared/api/apiClient';
import { announceSkillLibraryChange } from '@client/shared/api/skillLibrary';
import { getMergedCategories } from '@shared/domain/prompts/vision';
import type { WorkshopSkill } from '@shared/domain/skills/library';

interface Props { skill: WorkshopSkill | null; onClose: () => void; onSaved: () => void }
const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5';

/** Category matching remains structured data, separate from display tags. */
export function WorkshopSkillEditor({ skill, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initialName = skill ? `${skill.name} · 新版` : '';
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(skill?.category || 'general');
  const [description, setDescription] = useState(skill?.desc || '');
  const [prompt, setPrompt] = useState(skill?.promptSnippet || '');
  const [categories, setCategories] = useState(getMergedCategories);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const dirty = name !== initialName || category !== (skill?.category || 'general')
    || description !== (skill?.desc || '') || prompt !== (skill?.promptSnippet || '');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const close = () => {
    if (savingRef.current || (dirty && !window.confirm('当前技能还有未保存的修改，确定关闭吗？'))) return;
    onClose();
  };
  const save = async () => {
    if (savingRef.current) return;
    if (!name.trim() || !prompt.trim()) { setError('请填写技能名称和完整规则'); return; }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch('/api/catalog/styles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), category, desc: description, promptSnippet: prompt, tag: skill?.tag || '工坊技能',
          coverUrl: skill?.coverUrl || '', sampleImages: skill?.sampleImages || [], sourceUrl: skill ? `skill:${skill.id}` : '' }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || '保存失败，编辑内容已保留');
      announceSkillLibraryChange();
      onSaved();
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : '技能保存失败'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return createPortal(<dialog ref={dialog} onCancel={event => { event.preventDefault(); close(); }}
    aria-labelledby="workshop-skill-editor-title" className="m-auto w-[min(720px,calc(100vw-2rem))] max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 backdrop:bg-black/40 dark:bg-[#18191c] dark:text-slate-100">
    <header className="mb-5 flex items-center justify-between">
      <h2 id="workshop-skill-editor-title" className="font-semibold">{skill?.isOfficial ? '编辑官方技能副本' : skill ? '编辑电商图文技能' : '新建电商图文技能'}</h2>
      <button type="button" onClick={close} aria-label="关闭技能编辑器"><X className="h-5 w-5" /></button>
    </header>
    <fieldset disabled={saving} className="space-y-4">
      {skill && <p className="text-xs text-slate-500">修订后另存新版，保留原版和当前电商图文选择；新版须明确应用后才用于生产。</p>}
      <label className="block space-y-1 text-xs">技能名称<input value={name} onChange={event => setName(event.target.value)} className={inputClass} /></label>
      <label className="block space-y-1 text-xs">适用商品类目<select value={category} onChange={event => setCategory(event.target.value)} className={inputClass}>
        {!categories.some(item => item.id === category) && <option value={category}>{category}</option>}
        {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <div className="flex gap-2"><input aria-label="新类目名称" placeholder="新类目名称" value={newCategory} onChange={event => setNewCategory(event.target.value)} className={inputClass} />
        <button type="button" className="shrink-0 text-xs" disabled={!newCategory.trim()} onClick={() => {
          const item = { id: `cat_${crypto.randomUUID()}`, name: newCategory.trim(), isCustom: true };
          const next = [...categories, item];
          localStorage.setItem('custom_categories', JSON.stringify(next));
          setCategories(next); setCategory(item.id); setNewCategory('');
        }}>添加类目</button></div>
      <label className="block space-y-1 text-xs">用途说明<textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} className={inputClass} /></label>
      <label className="block space-y-1 text-xs">商品保真与换品规则<textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={15} className={`${inputClass} font-mono leading-relaxed`} /></label>
      <p className="text-xs text-slate-500">参考样本决定每镜画面，技能提供可复用的方法；保存不会改变当前生产选择或历史批次。</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <footer className="flex justify-end gap-4"><button type="button" disabled={saving} onClick={close}>取消</button>
        <button type="button" disabled={saving} onClick={() => { void save(); }} className="rounded-full bg-indigo-600 px-5 py-2 text-sm text-white disabled:opacity-50">{saving ? '保存中…' : skill ? '另存新版' : '保存技能'}</button></footer>
    </fieldset>
  </dialog>, document.body);
}
