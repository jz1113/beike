import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, X } from 'lucide-react';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { buildPromptGroupFolders, buildPromptGroupSubcategoryFolders } from '../../model/promptGroupFolders';
import { PromptGroupCategoryFolders } from './PromptGroupCategoryFolders';

interface Props {
  items: AssetLibrarySlim[];
  categories: AssetProductCategory[];
  albums: PromptAlbum[];
  initialCategory: string;
  onBrowse: (category: string, subcategory?: string) => void;
  onClose: () => void;
  onChanged: (organization: { categories: AssetProductCategory[]; albums: PromptAlbum[] }) => void;
  onNotice: (message: string) => void;
  onMoveGroups: (ids: string[]) => void;
  onArchived: () => void;
}

export function PromptCategoryManager({ items, categories, albums, initialCategory, onBrowse, onClose, onChanged, onNotice, onMoveGroups, onArchived }: Props) {
  const [selectedId, setSelectedId] = useState(initialCategory);
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const rootFolders = useMemo(() => buildPromptGroupFolders(items, categories, albums), [items, categories, albums]);
  const parent = rootFolders.find(folder => folder.id === selectedId && !folder.isVirtual) || rootFolders.find(folder => !folder.isVirtual);
  const folders = useMemo(() => parent ? buildPromptGroupSubcategoryFolders(items, categories, albums, parent.id) : [], [items, categories, albums, parent]);
  useEffect(() => {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const siblings = [...document.body.children].filter((element): element is HTMLElement => element instanceof HTMLElement && !element.contains(dialogRef.current));
    const inertBefore = siblings.map(element => element.inert);
    siblings.forEach(element => { element.inert = true; });
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      siblings.forEach((element, index) => { element.inert = inertBefore[index]; });
      document.body.style.overflow = overflow;
      if (origin?.isConnected) origin.focus();
    };
  }, []);
  const browse = (category: string, subcategory?: string) => { onBrowse(category, subcategory); onClose(); };
  const common = { categories, onChanged, onNotice, onMoveGroups, onArchived };
  return createPortal(<div className="asset-category-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="asset-category-dialog"
      onKeyDown={event => {
        const current = (event.target as HTMLElement).closest<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"]');
        if (!current || current.getAttribute('role') === 'menu' || !event.currentTarget.contains(current)) return;
        if (event.key === 'Escape' && current === event.currentTarget) { event.preventDefault(); onClose(); }
        if (event.key !== 'Tab') return;
        const buttons = [...current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(element => element.getClientRects().length);
        const first = buttons[0]; const last = buttons.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
      <header className="asset-category-dialog-header">
        <div><h2 id={titleId}>分类与规则</h2><p>左侧选择商品大类，右侧管理细分与规则。</p></div>
        <button type="button" onClick={onClose} aria-label="关闭分类管理"><X size={18} /></button>
      </header>
      <div className="asset-category-manager-columns">
        <div><PromptGroupCategoryFolders {...common} folders={rootFolders} activeId={parent?.id}
          onOpen={id => { if (rootFolders.find(folder => folder.id === id)?.isVirtual) browse(id); else setSelectedId(id); }} /></div>
        <div>{parent ? <>
          <div className="asset-category-manager-current"><h3>{parent.name}</h3><button type="button" onClick={() => browse(parent.id)}>查看 {parent.items.length} 组母本<ArrowUpRight size={13} /></button></div>
          <PromptGroupCategoryFolders {...common} key={parent.id} folders={folders} parentId={parent.id} onOpen={id => browse(parent.id, id)} />
        </> : <div className="asset-category-empty">先新建一个商品大类，<br />再添加细分分类。</div>}</div>
      </div>
    </section>
  </div>, document.body);
}
