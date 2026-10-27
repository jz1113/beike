import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { Check, FolderClosed, MoreHorizontal, Plus, Settings2, X } from 'lucide-react';
import { apiFetch } from '@client/shared/api/apiClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { PromptFolderDeleteDialog } from './PromptFolderDeleteDialog';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import type { PromptGroupFolder } from '../../model/promptGroupFolders';
import { PromptFolderContextMenu } from './PromptFolderContextMenu';
import { PromptFolderRulesDialog } from './PromptFolderRulesDialog';
import { promptFolderRuleCategories, promptFolderRuleCategory } from '../../model/promptFolderRuleCategories';

export { buildPromptGroupFolders, buildPromptGroupSubcategoryFolders } from '../../model/promptGroupFolders';

interface Props {
  categories: AssetProductCategory[];
  folders: PromptGroupFolder[];
  onOpen: (id: string) => void;
  onChanged: (organization: { categories: AssetProductCategory[]; albums: PromptAlbum[] }) => void;
  onNotice: (message: string) => void;
  onMoveGroups: (ids: string[]) => void;
  onArchived: () => void;
  parentId?: string;
  activeId?: string;
}

export function PromptGroupCategoryFolders({ categories, folders, onOpen, onChanged, onNotice, onMoveGroups, onArchived, parentId, activeId }: Props) {
  const [rulesId, setRulesId] = useState<string | null>(null);
  const ruleCategories = promptFolderRuleCategories(categories);
  const defaultRulesId = parentId;
  const inputId = useId();
  const ruleCategory = rulesId ? promptFolderRuleCategory(ruleCategories, rulesId, rulesId === parentId ? undefined : parentId) : undefined;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PromptGroupFolder[] | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; folder?: PromptGroupFolder; ids: string[] } | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; initialName: string; draft: string; error: string; saving: boolean } | null>(null);
  const editingId = editing?.id;
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameSavingRef = useRef(false);
  const ignoreRenameBlurRef = useRef(false);
  const nameButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuRef = useRef<HTMLDivElement>(null);
  const menuOriginRef = useRef<HTMLElement | null>(null);
  const anchorIdRef = useRef<string | null>(null);

  useEffect(() => {
    setSelectedFolderIds(previous => previous.filter(id => folders.some(folder => folder.id === id)));
  }, [folders]);

  const selectOrOpen = (event: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey'>, folder: PromptGroupFolder) => {
    if (event.metaKey || event.ctrlKey) {
      setSelectedFolderIds(previous => previous.includes(folder.id)
        ? previous.filter(id => id !== folder.id) : [...previous, folder.id]);
      anchorIdRef.current = folder.id;
    } else if (event.shiftKey) {
      const start = folders.findIndex(item => item.id === anchorIdRef.current);
      const end = folders.findIndex(item => item.id === folder.id);
      setSelectedFolderIds(start < 0 ? [folder.id] : folders.slice(Math.min(start, end), Math.max(start, end) + 1).map(item => item.id));
    } else {
      setSelectedFolderIds([]);
      anchorIdRef.current = folder.id;
      onOpen(folder.id);
    }
  };

  useEffect(() => {
    if (!menu) return;
    requestAnimationFrame(() => menuRef.current?.querySelector('button')?.focus());
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(null);
        menuOriginRef.current?.focus();
      }
    };
    const dismissOnScroll = () => setMenu(null);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissOnEscape);
    window.addEventListener('scroll', dismissOnScroll, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissOnEscape);
      window.removeEventListener('scroll', dismissOnScroll, true);
    };
  }, [menu]);

  const openMenu = (event: MouseEvent, folder?: PromptGroupFolder) => {
    event.preventDefault();
    event.stopPropagation();
    menuOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX || rect.left + Math.min(rect.width / 2, 80);
    const y = event.clientY || rect.top + Math.min(rect.height / 2, 80);
    const ids = folder ? selectedFolderIds.includes(folder.id) ? selectedFolderIds : [folder.id] : [];
    setSelectedFolderIds(ids);
    setMenu({
      x: Math.max(8, Math.min(x, window.innerWidth - 188)),
      y: Math.max(8, Math.min(y, window.innerHeight - (folder ? 220 : 56))),
      folder, ids,
    });
  };

  const openCreateDialog = () => {
    setMenu(null);
    setCreateDialogOpen(true);
  };

  const beginInlineRename = (folder: PromptGroupFolder) => {
    setMenu(null);
    if (renameSavingRef.current) return;
    ignoreRenameBlurRef.current = false;
    setEditing({ id: folder.id, initialName: folder.name, draft: folder.name, error: '', saving: false });
  };

  const openDeleteDialog = (ids: string[]) => {
    setMenu(null);
    setDeleteError('');
    setDeleteTarget(folders.filter(folder => ids.includes(folder.id) && !folder.isVirtual));
  };

  const deleteFolder = async () => {
    if (!deleteTarget?.length || saving) return;
    setSaving(true);
    setDeleteError('');
    try {
      const response = await apiFetch('/api/catalog/assets/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive-prompt-folders', ids: deleteTarget.map(folder => folder.id), parentId }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success || !Array.isArray(result.categories) || !Array.isArray(result.albums)) {
        throw new Error(result?.error || '删除失败');
      }
      invalidateGlobalAssetCache();
      onChanged(result);
      setDeleteTarget(null);
      setSelectedFolderIds([]);
      onArchived();
      onNotice(`已删除 ${result.archivedCount} 个分类，母本已保留`);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : '删除失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!createDialogOpen) return;
    setName('');
    setError('');
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => createInputRef.current?.focus());
    return () => { cancelAnimationFrame(frame); if (origin?.isConnected) origin.focus(); };
  }, [createDialogOpen]);

  useEffect(() => {
    if (!editingId) return;
    requestAnimationFrame(() => renameInputRef.current?.select());
  }, [editingId]);

  const finishInlineRename = (id: string, restoreFocus: boolean) => {
    setEditing(current => current?.id === id ? null : current);
    if (restoreFocus) requestAnimationFrame(() => nameButtonRefs.current.get(id)?.focus());
  };

  const cancelInlineRename = (id: string) => {
    if (renameSavingRef.current) return;
    ignoreRenameBlurRef.current = true;
    finishInlineRename(id, true);
  };

  const persistFolder = async (folderId: string | undefined, folderName: string) => {
    const response = await apiFetch('/api/catalog/assets/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parentId
        ? { action: 'save-prompt-subcategory', parentId, ...(folderId ? { value: folderId } : {}), name: folderName }
        : { action: 'save-product-category', ...(folderId ? { id: folderId } : {}), name: folderName }),
    });
    const result = await response.json();
    if (!response.ok || !result?.success || !Array.isArray(result.categories) || !Array.isArray(result.albums)) {
      throw new Error(result?.error || '保存失败');
    }
    invalidateGlobalAssetCache();
    onChanged(result);
  };

  const commitInlineRename = async (restoreFocus: boolean) => {
    if (!editing || renameSavingRef.current) return;
    const { id, initialName } = editing;
    const trimmed = editing.draft.trim();
    if (!trimmed || trimmed.length > 40) {
      setEditing(current => current?.id === id ? { ...current, error: '分类名称需为 1–40 个字' } : current);
      requestAnimationFrame(() => renameInputRef.current?.focus());
      return;
    }
    if (trimmed === initialName) {
      finishInlineRename(id, restoreFocus);
      return;
    }
    renameSavingRef.current = true;
    setEditing(current => current?.id === id ? { ...current, saving: true, error: '' } : current);
    try {
      await persistFolder(id, trimmed);
      finishInlineRename(id, restoreFocus);
      onNotice('分类已改名');
    } catch (cause) {
      setEditing(current => current?.id === id ? {
        ...current, saving: false, error: cause instanceof Error ? cause.message : '保存失败，请重试',
      } : current);
      requestAnimationFrame(() => renameInputRef.current?.focus());
    } finally {
      renameSavingRef.current = false;
    }
  };

  const saveFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!createDialogOpen || saving) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 40) {
      setError('分类名称需为 1–40 个字');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await persistFolder(undefined, trimmed);
      setCreateDialogOpen(false);
      onNotice('分类已创建');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return <section data-prompt-folder-area aria-label={parentId ? '商品细分管理' : '商品大类管理'} className="asset-category-list"
    onContextMenu={event => openMenu(event)}
    onClick={event => { if (event.target === event.currentTarget) setSelectedFolderIds([]); }}
    onKeyDown={event => { if (event.key === 'Escape' && !menu && !createDialogOpen && !deleteTarget && selectedFolderIds.length) { event.preventDefault(); event.stopPropagation(); setSelectedFolderIds([]); } }}>
    <div className="asset-category-list-heading">
      <h3>{parentId ? '商品细分' : '商品大类'} · {folders.length}</h3>
      <div className="asset-category-list-actions">
        {defaultRulesId && ruleCategories.some(category => category.id === defaultRulesId) && <button type="button" onClick={() => setRulesId(defaultRulesId)}><Settings2 size={12} />大类规则</button>}
        <button type="button" onClick={openCreateDialog}><Plus size={12} />{parentId ? '新建细分' : '新建大类'}</button>
      </div>
    </div>
    {selectedFolderIds.length > 0 && <p className="mb-2 text-[11px] text-slate-500">已选 {selectedFolderIds.length} 个分类 · Esc 清除</p>}

    {folders.length ? <div>
      {folders.map(folder => {
        const isSelected = selectedFolderIds.includes(folder.id);
        return <div key={folder.id} data-prompt-folder className="asset-category-edit-row" data-selected={isSelected || activeId === folder.id}
          onContextMenu={event => openMenu(event, folder)}
          onKeyDown={event => {
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
              event.preventDefault();
              const target = event.target as HTMLElement;
              const rect = target.getBoundingClientRect();
              menuOriginRef.current = target;
              const ids = isSelected ? selectedFolderIds : [folder.id];
              setSelectedFolderIds(ids);
              setMenu({
                x: Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 188)),
                y: Math.max(8, Math.min(rect.bottom, window.innerHeight - 220)),
                folder, ids,
              });
            }
          }}>
          <FolderClosed size={16} strokeWidth={1.6} className="shrink-0" />
          {editing?.id === folder.id ? <input
            ref={renameInputRef} data-prompt-folder-rename-input
            aria-label={`重命名${folder.name}`} aria-invalid={Boolean(editing.error)}
            aria-describedby={editing.error ? `prompt-folder-rename-error-${folder.id}` : undefined}
            value={editing.draft} maxLength={40} disabled={editing.saving}
            onChange={event => setEditing(current => current?.id === folder.id
              ? { ...current, draft: event.target.value, error: '' } : current)}
            onClick={event => event.stopPropagation()}
            onContextMenu={event => event.stopPropagation()}
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                void commitInlineRename(true);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelInlineRename(folder.id);
              }
            }}
            onBlur={() => {
              if (ignoreRenameBlurRef.current) {
                ignoreRenameBlurRef.current = false;
                return;
              }
              void commitInlineRename(false);
            }}
            className="min-w-0 flex-1 rounded-md border border-slate-400 bg-transparent px-2 py-1 text-xs text-slate-900 outline-none disabled:opacity-60 dark:text-slate-100"
          /> : <button type="button" ref={element => {
            if (element) nameButtonRefs.current.set(folder.id, element);
            else nameButtonRefs.current.delete(folder.id);
          }} onClick={event => selectOrOpen(event, folder)}
            className="asset-category-edit-name" aria-current={activeId === folder.id ? 'true' : undefined}
            aria-label={isSelected ? `${folder.name}，已选中` : undefined} title={folder.name}>
            <span className="min-w-0 truncate">{folder.name}</span>{isSelected && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-indigo-600" />}
          </button>}
          {editing?.id === folder.id && editing.error && <p id={`prompt-folder-rename-error-${folder.id}`} role="alert"
            className="order-last w-full text-[11px] leading-4 text-rose-600">{editing.error}</p>}
          <small>{folder.items.length} 组</small>
          <button type="button" className="asset-category-edit-more" aria-label={`${folder.name}分类操作`} aria-haspopup="menu" onClick={event => openMenu(event, folder)}><MoreHorizontal size={15} /></button>
        </div>;
      })}
    </div> : <div className="asset-category-empty">
      还没有商品{parentId ? '细分' : '大类'}，点击上方按钮即可添加。
    </div>}

    {menu && <PromptFolderContextMenu menu={menu} menuRef={menuRef} folders={folders}
      onOpen={id => { onOpen(id); setMenu(null); setSelectedFolderIds([]); }}
      onRename={beginInlineRename}
      onRules={id => { nameButtonRefs.current.get(id)?.focus(); setRulesId(id); setMenu(null); }}
      onMoveGroups={ids => { onMoveGroups(ids); setMenu(null); }}
      onDelete={openDeleteDialog} onCreate={openCreateDialog} />}

    {createDialogOpen && <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreateDialogOpen(false); }}>
      <form role="dialog" aria-modal="true" aria-label={parentId ? '新建商品细分' : '新建商品大类'} onSubmit={saveFolder}
        onKeyDown={event => { if (event.key === 'Escape' && !saving) setCreateDialogOpen(false); }}
        className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#18191c]">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{parentId ? '新建商品细分' : '新建商品大类'}</h3>
          <button type="button" aria-label="关闭" disabled={saving} onClick={() => setCreateDialogOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <label htmlFor={inputId} className="mt-5 block text-xs font-semibold text-slate-600 dark:text-slate-300">{parentId ? '商品细分名称' : '商品大类名称'}</label>
        <input ref={createInputRef} id={inputId} value={name} maxLength={40} onChange={event => setName(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:text-slate-100 dark:border-white/10"
          placeholder={parentId ? '例如：手机本体、手机壳' : '例如：手机数码、珠宝首饰'} />
        {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={() => setCreateDialogOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">取消</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{saving ? '保存中…' : '保存'}</button>
        </div>
      </form>
    </div>}
    {deleteTarget && <PromptFolderDeleteDialog folders={deleteTarget} saving={saving} error={deleteError}
      onCancel={() => setDeleteTarget(null)} onDelete={() => void deleteFolder()} />}
    {ruleCategory && <PromptFolderRulesDialog key={ruleCategory.id} category={ruleCategory} categories={ruleCategories}
      onClose={() => setRulesId(null)} onChanged={onChanged} onNotice={onNotice} />}
  </section>;
}
