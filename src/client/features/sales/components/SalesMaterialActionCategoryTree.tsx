import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FolderClosed, Pencil, Trash2, X } from 'lucide-react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { ScriptTaxonomyItem } from '@shared/contracts/salesScriptTaxonomy';
import { matchesActionCategoryFilter, type ActionCategoryFilter, type SalesMaterialCard } from '../model/salesMaterialCatalog';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { salesFocusClass, salesInputClass } from './salesChrome';

interface Props {
  compact?: boolean;
  filterOptions?: readonly { value: string; label: string; count?: number }[];
  unclassifiedCount?: number;
  actionCards: readonly Pick<SalesMaterialCard, 'categoryId' | 'productCategoryIds'>[];
  categories: readonly ScriptTaxonomyItem[];
  activeFilter: ActionCategoryFilter;
  loading: boolean;
  busy?: boolean;
  onSelectFilter: (filter: ActionCategoryFilter) => void;
  onRenameCategory?: (id: string, name: string) => Promise<boolean>;
  onRemoveCategory?: (item: ScriptTaxonomyItem) => Promise<boolean>;
}

export function SalesMaterialActionCategoryTree({
  compact = false, filterOptions, unclassifiedCount, actionCards,
  categories,
  activeFilter,
  loading,
  busy = false,
  onSelectFilter,
  onRenameCategory,
  onRemoveCategory,
}: Props) {
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ category: ScriptTaxonomyItem; x: number; y: number } | null>(null);
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

  const validIds = new Set(categories.map((c) => c.id));
  const countFor = (filter: ActionCategoryFilter) =>
    actionCards.filter((card) => matchesActionCategoryFilter(card, filter, validIds)).length;
  const options = filterOptions ?? [
    { value: 'all', label: '全部分类', count: actionCards.length },
    { value: 'unclassified', label: '未分类', count: unclassifiedCount ?? countFor('unclassified') },
    ...categories.map((category) => ({ value: `category:${category.id}`, label: category.name, count: countFor(`category:${category.id}`) })),
  ];
  const countLabel = (filter: ActionCategoryFilter) => {
    if (loading) return '…';
    const count = options.find((option) => option.value === filter)?.count;
    return count === undefined ? '—' : `${count} 组`;
  };

  const submitRename = (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed || busy || loading || !onRenameCategory) return;
    void onRenameCategory(id, trimmed).then((ok) => {
      if (ok) setEditingId('');
    });
  };

  const handleRemove = (category: ScriptTaxonomyItem) => {
    if (busy || !onRemoveCategory) return;
    void confirmAction({
      title: `移除商品类目「${category.name}」？`,
      confirmText: '移除类目',
      description: '关联动作与脚本将转为未分类，动作素材本身保留。',
    }).then((ok) => {
      if (ok) void onRemoveCategory(category);
    });
  };

  if (compact) return <SalesLibrarySelect label="按素材分类筛选" value={activeFilter} disabled={loading}
    showSelectedCount={false} countUnit="组"
    active={activeFilter !== 'all'} searchable onChange={(value) => onSelectFilter(value as ActionCategoryFilter)}
    options={options} />;

  return (
    <nav className="sales-cat-subs" aria-label="动作商品类目导航" aria-busy={loading}>
      {loading && <p className="sales-taxonomy-sidebar-hint" role="status">正在读取分类…</p>}

      {categories.map((category) => {
        const key: ActionCategoryFilter = `category:${category.id}`;
        if (editingId === category.id) {
          return (
            <form
              key={category.id}
              className="sales-taxonomy-inline-form"
              onSubmit={(e) => { e.preventDefault(); submitRename(category.id); }}
            >
              <input
                autoFocus
                value={editName}
                maxLength={40}
                disabled={busy || loading}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(''); }}
                aria-label={`修改 ${category.name} 名称`}
                className={salesInputClass}
              />
              <button type="submit" disabled={!editName.trim() || busy || loading} aria-label="保存类目名称" className={`sales-script-icon-btn ${salesFocusClass}`}><Check size={12} aria-hidden /></button>
              <button type="button" disabled={busy} onClick={() => setEditingId('')} aria-label="取消修改" className={`sales-script-icon-btn ${salesFocusClass}`}><X size={12} aria-hidden /></button>
            </form>
          );
        }
        return (
          <button
            key={category.id}
            type="button"
            disabled={loading}
            data-prompt-library-context
            aria-current={activeFilter === key ? 'true' : undefined}
            onClick={() => onSelectFilter(key)}
            onDoubleClick={() => {
              if (!busy && !loading && onRenameCategory) {
                setEditingId(category.id);
                setEditName(category.name);
              }
            }}
            onContextMenu={(e) => {
              if (busy || loading || (!onRenameCategory && !onRemoveCategory)) return;
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ category, x: e.clientX, y: e.clientY });
            }}
            title={category.name}
            className={`sales-cat-sub-item ${salesFocusClass}`}
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <FolderClosed size={12} className="shrink-0" aria-hidden />
              <span className="truncate" title={category.name}>{category.name}</span>
            </span>
            <small>{countLabel(key)}</small>
          </button>
        );
      })}

      {contextMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          data-prompt-library-context
          aria-label={`${contextMenu.category.name} 类目操作菜单`}
          style={{
            left: `${Math.max(12, Math.min(contextMenu.x, window.innerWidth - 180))}px`,
            top: `${Math.max(12, Math.min(contextMenu.y, window.innerHeight - 108))}px`,
          }}
          className="fixed z-[999999] min-w-[168px] rounded-xl border border-slate-200/90 bg-white/95 p-1 text-[12.5px] text-slate-700 shadow-2xl backdrop-blur-xl select-none animate-in fade-in zoom-in-95 duration-100 dark:border-slate-700/90 dark:bg-slate-900/95 dark:text-slate-200"
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
                }}
                className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-100 hover:bg-blue-600 hover:text-white"
              >
                <Pencil className="h-4 w-4 shrink-0 opacity-75 group-hover:opacity-100" aria-hidden />
                <span className="font-medium">重命名</span>
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
                className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-rose-600 transition-colors duration-100 hover:bg-rose-600 hover:text-white dark:text-rose-400 dark:hover:bg-rose-600 dark:hover:text-white"
              >
                <Trash2 className="h-4 w-4 shrink-0 opacity-80 group-hover:opacity-100" aria-hidden />
                <span className="font-medium">删除</span>
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </nav>
  );
}
