import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Images, Search, Sparkles, X } from 'lucide-react';
import { useAppStore } from '@client/store';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { buildCategorySkillNavigation } from '../../model/promptLibraryNavigation';
import { useAssetList } from '../../hooks/useAssetList';
import { usePromptRulesDialogFocus } from '../../hooks/usePromptRulesDialogFocus';
import { CategorySkillPanel, type CategorySkillTab } from './CategorySkillPanel';

const ignoreFeedback = () => {};

export function CategorySkillsDialog({ categories, albums, initialFolder, onClose, onPreview, onBrowse }: {
  categories: AssetProductCategory[];
  albums: PromptAlbum[];
  initialFolder?: string;
  onClose: () => void;
  onPreview: (id: string) => void;
  onBrowse: (category: string, subcategory: string) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const setCurrentView = useAppStore(state => state.setCurrentView);
  const { items, isLoading, loadError, refreshAssets } = useAssetList({ activeSubTab: 'full_prompt', showToast: ignoreFeedback, setCopiedId: ignoreFeedback });
  const options = useMemo(() => buildCategorySkillNavigation(items, categories, albums), [items, categories, albums]);
  const groupNumbers = useMemo(() => new Map(items.filter(item => typeof item.displayNumber === 'number').map(item => [item.id, item.displayNumber!])), [items]);
  const [selected, setSelected] = useState(initialFolder || options[0]?.folderId || '');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<CategorySkillTab>('skill');
  const folder = options.find(option => option.folderId === selected) || options[0];
  const visible = options.filter(option => `${option.parent} ${option.label}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const canLeave = () => !dialogRef.current?.querySelector('[data-skill-dirty="true"]') || window.confirm('技能修改尚未保存，确定离开吗？');
  const close = () => { if (canLeave()) onClose(); };
  usePromptRulesDialogFocus(dialogRef, close);
  return createPortal(<div className="asset-category-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label="创作技能管理" tabIndex={-1} className="asset-category-dialog asset-skills-dialog">
      <header className="asset-category-dialog-header"><div><h2 className="flex items-center gap-2"><Sparkles size={17} />创作技能</h2><p>按商品细分查看技能正文、编辑新版本，或补充长期偏好。</p></div><button type="button" aria-label="关闭创作技能" onClick={close}><X size={18} /></button></header>
      <div className="asset-skills-workspace">
        <aside className="asset-skills-sidebar">
          <p className="asset-skills-caption">{options.length} 个技能类目</p>
          <label className="asset-category-search"><Search size={13} /><input aria-label="查找技能类目" placeholder="查找商品类目" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="清除类目查找" onClick={() => setQuery('')}><X size={12} /></button>}</label>
          <nav aria-label="技能类目" className="min-h-0 flex-1 overflow-y-auto">{visible.map(option => <button type="button" key={option.folderId} aria-current={folder?.folderId === option.folderId ? 'true' : undefined} className="asset-skill-category" onClick={() => { if (option.folderId !== folder?.folderId && canLeave()) { setSelected(option.folderId); setTab('skill'); } }}><small>{option.parent}</small><span className="asset-skill-category-label"><span>{option.label}</span><small>{loadError ? '—' : isLoading ? '…' : `${option.count} 组`}</small></span></button>)}{!visible.length && <div className="asset-category-no-results">没有匹配的类目{query && <button type="button" onClick={() => setQuery('')} className="mt-2 block underline">清除查找</button>}</div>}</nav>
          <button type="button" className="asset-category-manage" onClick={() => { if (canLeave()) { onClose(); setCurrentView('skills'); } }}>手动技能库<ArrowUpRight size={13} /></button>
        </aside>
        <div className="asset-skills-content">{folder ? <>
          <div className="asset-skills-heading"><div><p>{folder.parent} / 创作技能</p><h3>{folder.label}</h3></div><button type="button" onClick={() => { if (canLeave()) onBrowse(folder.parentId, folder.id); }} className="asset-skills-reference-link"><Images size={14} />查看参考图库<ArrowUpRight size={13} /></button></div>
          {loadError && <p role="alert" className="mb-3 text-xs text-amber-600">参考图数量读取失败。<button type="button" onClick={refreshAssets} className="ml-2 underline">重试</button></p>}
          <CategorySkillPanel key={folder.folderId} folderId={folder.folderId} tab={tab} onTab={setTab} groupNumbers={groupNumbers} autoLearn={false} showReferences={false} onPreview={id => { if (canLeave()) onPreview(id); }} />
        </> : <div className="asset-skills-empty"><Sparkles size={30} /><p>还没有可管理的技能类目<br />先在“分类与规则”中添加商品细分，或编写独立技能。</p><button type="button" className="asset-secondary-button" onClick={() => { if (canLeave()) { onClose(); setCurrentView('skills'); } }}>打开手动技能库<ArrowUpRight size={13} /></button></div>}</div>
      </div>
    </section>
  </div>, document.body);
}
