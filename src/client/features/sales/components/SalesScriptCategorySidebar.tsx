import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FolderClosed, Pencil, Plus, Trash2, X } from 'lucide-react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { ScriptTaxonomyItem } from '@shared/contracts/salesScriptTaxonomy';
import type { StoredSalesScript } from '../api/salesScripts';
import { type ScriptCategoryFilter } from '../model/salesScriptLibrary';
import { salesFocusClass, salesInputClass } from './salesChrome';

interface Props {
  items: readonly StoredSalesScript[];
  taxonomyItems: readonly ScriptTaxonomyItem[];
  loading: boolean;
  busy?: boolean;
  activeCategory: ScriptCategoryFilter;
  onSelectCategory: (cat: ScriptCategoryFilter) => void;
  onManage: () => void;
  onCreateCategory?: (name: string) => Promise<ScriptTaxonomyItem | null>;
  onRenameCategory?: (id: string, name: string) => Promise<boolean>;
  onRemoveCategory?: (item: ScriptTaxonomyItem) => Promise<boolean>;
}

interface CategoryMenuState {
  category: ScriptTaxonomyItem;
  x: number;
  y: number;
}

export function SalesScriptCategorySidebar({
  items, taxonomyItems, loading, busy = false, activeCategory,
  onSelectCategory, onManage, onCreateCategory, onRenameCategory, onRemoveCategory,
}: Props) {
  const categories = taxonomyItems.filter((item) => item.kind === 'category');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [contextMenu, setContextMenu] = useState<CategoryMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setContextMenu(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  const submitCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed || busy || loading || !onCreateCategory) return;
    void onCreateCategory(trimmed).then((created) => {
      if (created) {
        setNewName('');
        setAdding(false);
        onSelectCategory(`category:${created.id}`);
      }
    });
  };

  const submitRename = (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed || busy || !onRenameCategory) return;
    void onRenameCategory(id, trimmed).then((ok) => {
      if (ok) setEditingId('');
    });
  };

  const handleRemove = (category: ScriptTaxonomyItem) => {
    if (busy || !onRemoveCategory) return;
    void confirmAction({
      title: `移除分类「${category.name}」？`,
      confirmText: '移除分类',
      description: '关联脚本将转为未分类，分镜内容保留。',
    }).then((ok) => {
      if (ok) void onRemoveCategory(category);
    });
  };

  const menuX = contextMenu && typeof window !== 'undefined'
    ? Math.max(12, Math.min(contextMenu.x, window.innerWidth - 156))
    : contextMenu?.x ?? 0;
  const menuY = contextMenu && typeof window !== 'undefined'
    ? Math.max(12, Math.min(contextMenu.y, window.innerHeight - 108))
    : contextMenu?.y ?? 0;

  return <aside className="sales-cat-sidebar" aria-label="脚本分类导航">
    <nav className="sales-cat-group sales-cat-tree" aria-label="我的脚本分类">
      <div className="sales-taxonomy-nav-heading">
        <span className="sales-cat-heading">我的分类</span>
        <button
          type="button"
          onClick={() => {
            if (onCreateCategory) {
              setAdding((v) => !v);
              setEditingId('');
            } else {
              onManage();
            }
          }}
          aria-label="新建脚本分类"
          title="新建分类"
          className={salesFocusClass}
        >
          <Plus size={13} aria-hidden />
        </button>
      </div>

      {adding && onCreateCategory && (
        <form
          className="sales-taxonomy-inline-form"
          onSubmit={(e) => { e.preventDefault(); submitCreate(); }}
        >
          <input
            autoFocus
            value={newName}
            maxLength={40}
            disabled={busy || loading}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
            placeholder="输入分类名称"
            aria-label="新分类名称"
            className={salesInputClass}
          />
          <button type="submit" disabled={!newName.trim() || busy || loading} aria-label="确认新建分类" className={`sales-script-icon-btn ${salesFocusClass}`}><Check size={13} aria-hidden /></button>
          <button type="button" disabled={busy} onClick={() => { setAdding(false); setNewName(''); }} aria-label="取消新建分类" className={`sales-script-icon-btn ${salesFocusClass}`}><X size={13} aria-hidden /></button>
        </form>
      )}

      {loading ? (
        <p className="sales-taxonomy-sidebar-hint" role="status">读取中…</p>
      ) : categories.length ? (
        categories.map((category) => (
          editingId === category.id && onRenameCategory ? (
            <form
              key={category.id}
              className="sales-taxonomy-inline-form"
              onSubmit={(e) => { e.preventDefault(); submitRename(category.id); }}
            >
              <input
                autoFocus
                value={editName}
                maxLength={40}
                disabled={busy}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(''); }}
                aria-label={`重命名 ${category.name}`}
                className={salesInputClass}
              />
              <button type="submit" disabled={!editName.trim() || busy} aria-label={`保存 ${category.name}`} className={`sales-script-icon-btn ${salesFocusClass}`}><Check size={13} aria-hidden /></button>
              <button type="button" disabled={busy} onClick={() => setEditingId('')} aria-label="取消重命名" className={`sales-script-icon-btn ${salesFocusClass}`}><X size={13} aria-hidden /></button>
            </form>
          ) : (
            <button
              key={category.id}
              type="button"
              data-prompt-library-context
              aria-current={activeCategory === `category:${category.id}` ? 'true' : undefined}
              onClick={() => onSelectCategory(`category:${category.id}`)}
              onDoubleClick={() => {
                if (!busy && onRenameCategory) {
                  setEditingId(category.id);
                  setEditName(category.name);
                  setAdding(false);
                }
              }}
              onContextMenu={(e) => {
                if (!onRenameCategory && !onRemoveCategory) return;
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ category, x: e.clientX, y: e.clientY });
              }}
              title="右键可重命名或删除"
              className={`sales-cat-item ${salesFocusClass}`}
            >
              <FolderClosed size={14} aria-hidden /><span>{category.name}</span><small>{items.filter((item) => item.script.taxonomy.categoryId === category.id).length}</small>
            </button>
          )
        ))
      ) : !adding && (
        <button
          type="button"
          onClick={() => { if (onCreateCategory) setAdding(true); else onManage(); }}
          className={`sales-cat-item ${salesFocusClass}`}
        >
          <Plus size={14} aria-hidden /><span>新建分类</span>
        </button>
      )}
    </nav>

    {contextMenu && typeof document !== 'undefined' && createPortal(
      <div
        ref={menuRef}
        role="menu"
        data-prompt-library-context
        aria-label={`${contextMenu.category.name} 分类操作菜单`}
        style={{ left: `${menuX}px`, top: `${menuY}px` }}
        className="fixed z-[999999] min-w-[144px] rounded-xl border border-slate-200/90 bg-white/95 p-1 text-[11px] text-slate-700 shadow-2xl backdrop-blur-xl select-none animate-in fade-in zoom-in-95 duration-100 dark:border-slate-700/90 dark:bg-slate-900/95 dark:text-slate-200"
      >
        <div className="space-y-0.5">
          {onRenameCategory && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                const target = contextMenu.category;
                setContextMenu(null);
                setEditingId(target.id);
                setEditName(target.name);
                setAdding(false);
              }}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors duration-100 hover:bg-blue-600 hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5 shrink-0 opacity-75 group-hover:opacity-100" aria-hidden />
              <span className="font-medium">重命名分类</span>
            </button>
          )}
          {onRenameCategory && onRemoveCategory && (
            <div className="mx-1 my-1 h-px bg-slate-200/70 dark:bg-slate-700/70" />
          )}
          {onRemoveCategory && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                const target = contextMenu.category;
                setContextMenu(null);
                handleRemove(target);
              }}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-rose-600 transition-colors duration-100 hover:bg-rose-600 hover:text-white dark:text-rose-400 dark:hover:bg-rose-600 dark:hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-80 group-hover:opacity-100" aria-hidden />
              <span className="font-medium">删除分类</span>
            </button>
          )}
        </div>
      </div>,
      document.body,
    )}
  </aside>;
}
