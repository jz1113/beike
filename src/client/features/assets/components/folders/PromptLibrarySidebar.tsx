import { useMemo, useState } from 'react';
import { ChevronDown, FolderClosed, Images, Search, Settings2, Sparkles, X } from 'lucide-react';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { buildPromptLibraryNavigation, filterPromptLibraryNavigation, populatedPromptLibraryNavigation } from '../../model/promptLibraryNavigation';

interface Props {
  items: AssetLibrarySlim[];
  categories: AssetProductCategory[];
  albums: PromptAlbum[];
  category: string;
  subcategory: string;
  onSelect: (category: string, subcategory?: string) => void;
  onManage: () => void;
  onOpenSkills?: () => void;
}

export function PromptLibrarySidebar({ items, categories, albums, category, subcategory, onSelect, onManage, onOpenSkills }: Props) {
  const folders = useMemo(() => buildPromptLibraryNavigation(items, categories, albums), [items, categories, albums]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const populated = populatedPromptLibraryNavigation(folders, category, subcategory);
  const visible = filterPromptLibraryNavigation(populated, query);
  const showSearch = populated.length > 5 || populated.some(folder => folder.children.length > 6) || Boolean(query);
  const select = (id: string, child?: string) => {
    setCollapsed(previous => previous.filter(value => value !== id));
    onSelect(id, child);
  };
  return <aside aria-label="母本分类导航" className="asset-category-sidebar">
    <div className="asset-category-caption"><h2>商品分类</h2><button type="button" onClick={onManage} className="asset-category-settings" aria-label="分类与规则" title="分类与规则"><Settings2 size={14} strokeWidth={1.6} /></button></div>
    {showSearch && <label className="asset-category-search"><Search size={13} /><input aria-label="查找商品分类" placeholder="查找分类" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery('')} aria-label="清除分类查找"><X size={12} /></button>}</label>}
    <nav className="asset-category-tree" aria-label="按商品分类筛选">
      <button type="button" aria-current={category === 'all' ? 'true' : undefined} onClick={() => onSelect('all')} className="asset-category-row"><Images size={15} strokeWidth={1.6} /><span>全部母本</span><small>{items.length}</small></button>
      <div className="asset-category-divider" />
      {visible.map(folder => <div key={folder.id} className="asset-category-branch">
        <div className="asset-category-parent">
          <button type="button" aria-current={category === folder.id && subcategory === 'all' ? 'true' : undefined} onClick={() => select(folder.id)} className="asset-category-row"><FolderClosed size={15} strokeWidth={1.6} /><span title={folder.name}>{folder.name}</span><small>{folder.count}</small></button>
          {folder.children.length > 0 && <button type="button" aria-label={`${collapsed.includes(folder.id) && !query ? '展开' : '收起'}${folder.name}`} aria-expanded={!collapsed.includes(folder.id) || Boolean(query)} onClick={() => setCollapsed(previous => previous.includes(folder.id) ? previous.filter(id => id !== folder.id) : [...previous, folder.id])} className="asset-category-toggle"><ChevronDown size={13} className={collapsed.includes(folder.id) && !query ? '-rotate-90' : ''} /></button>}
        </div>
        {(!collapsed.includes(folder.id) || query) && folder.children.length > 0 && <div className="asset-category-children">
          {folder.children.map(child => <button key={child.id} type="button" aria-current={category === folder.id && subcategory === child.id ? 'true' : undefined} onClick={() => select(folder.id, child.id)} className="asset-category-row"><span title={child.name}>{child.name}</span><small>{child.count}</small></button>)}
        </div>}
      </div>)}
      {query && !visible.length && <p className="asset-category-no-results">没有匹配的分类</p>}
    </nav>
    {onOpenSkills && <button type="button" onClick={onOpenSkills} className="asset-category-skills"><Sparkles size={15} strokeWidth={1.6} /><span>创作技能</span></button>}
  </aside>;
}
