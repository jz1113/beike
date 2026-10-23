import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { ArrowRight, Check, Settings2, X } from 'lucide-react';
import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import Folder from '@client/shared/media/widgets/Folder';
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
  total: number;
  onOpen: (id: string) => void;
  onOpenAll?: () => void;
  onChanged: (organization: { categories: AssetProductCategory[]; albums: PromptAlbum[] }) => void;
  onNotice: (message: string) => void;
  onMoveGroups: (ids: string[]) => void;
  onArchived: () => void;
  parentId?: string;
}

export function PromptGroupCategoryFolders({ categories, folders, total, onOpen, onOpenAll, onChanged, onNotice, onMoveGroups, onArchived, parentId }: Props) {
  const [rulesId, setRulesId] = useState<string | null>(null);
  const ruleCategories = promptFolderRuleCategories(categories);
  const defaultRulesId = parentId || ruleCategories.find(category => !category.parentId)?.id;
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
      onNotice(`已删除 ${result.archivedCount} 个文件夹，母组已保留`);
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
    requestAnimationFrame(() => createInputRef.current?.focus());
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
      setEditing(current => current?.id === id ? { ...current, error: '文件夹名称需为 1–40 个字' } : current);
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
      onNotice('文件夹已改名');
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
      setError('文件夹名称需为 1–40 个字');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await persistFolder(undefined, trimmed);
      setCreateDialogOpen(false);
      onNotice('文件夹已创建');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return <section data-prompt-folder-area aria-label={parentId ? '商品细分文件夹' : '商品大类文件夹'} className="min-h-full pt-1"
    onContextMenu={event => openMenu(event)}
    onClick={event => { if (event.target === event.currentTarget) setSelectedFolderIds([]); }}
    onKeyDown={event => { if (event.key === 'Escape') setSelectedFolderIds([]); }}>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">{parentId ? '商品细分' : '商品大类'}</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{total} 组母本，按商品{parentId ? '细分' : '大类'}归档</p>
        {selectedFolderIds.length > 0 && <p className="mt-1 text-[11px] text-indigo-600">已选 {selectedFolderIds.length} 个文件夹 · 右键操作，按 Esc 清除</p>}
      </div>
      <div className="flex items-center gap-2">
        {defaultRulesId && ruleCategories.some(category => category.id === defaultRulesId) && <button type="button" onClick={() => setRulesId(defaultRulesId)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-white/10">
          <Settings2 className="h-3.5 w-3.5" />分类规则
        </button>}
        {total > 0 && onOpenAll && <button type="button" onClick={onOpenAll}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-indigo-500">
          查看全部母组<ArrowRight className="h-3.5 w-3.5" />
        </button>}
      </div>
    </div>

    {folders.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(152px,1fr))] gap-x-4 gap-y-5 max-w-6xl">
      {folders.map(folder => {
        const previews = folder.items.slice(0, 3).map(item => proxyMediaUrl(item.coverUrl, { thumb: true, width: 180 })).filter(Boolean);
        const isSelected = selectedFolderIds.includes(folder.id);
        return <div key={folder.id} data-prompt-folder className="group relative min-w-0 rounded-2xl px-2 py-3 text-center"
          onContextMenu={event => openMenu(event, folder)}
          onKeyDown={event => {
            if ((event.key === 'Enter' || event.key === ' ') && (event.target as HTMLElement).closest('.folder-stage')) {
              event.preventDefault();
              selectOrOpen(event, folder);
              return;
            }
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
          <div className="flex h-[136px] items-center justify-center overflow-hidden">
            <Folder color={folder.isVirtual ? '#64748B' : '#4F46E5'} size={0.52} items={previews.length ? previews : [{ title: folder.name }]}
              open={false} peek={false} intro={false} tilt={0} bounce={0} draggable={false} zoomOnClick={false}
              count={folder.items.length} badgeSuffix="组" ariaLabel={`打开${folder.name}，${folder.items.length}组母本`}
              onClick={event => selectOrOpen(event, folder)} />
          </div>
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
            className="mt-0.5 block w-full rounded-md border border-indigo-400 bg-white px-1 py-0.5 text-center text-sm font-semibold text-slate-900 outline-none ring-2 ring-indigo-100 disabled:opacity-60 dark:text-slate-100 dark:bg-[#18191c]"
          /> : <button type="button" ref={element => {
            if (element) nameButtonRefs.current.set(folder.id, element);
            else nameButtonRefs.current.delete(folder.id);
          }} onClick={event => selectOrOpen(event, folder)}
            className="mt-1 flex w-full items-center justify-center gap-1 text-sm font-semibold text-slate-800 hover:text-indigo-600 focus-visible:outline-none focus-visible:underline focus-visible:decoration-2 focus-visible:decoration-indigo-500 focus-visible:underline-offset-4 dark:text-slate-100"
            aria-label={isSelected ? `${folder.name}，已选中` : undefined} title={folder.name}>
            <span className="min-w-0 truncate">{folder.name}</span>{isSelected && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-indigo-600" />}
          </button>}
          {editing?.id === folder.id && editing.error && <p id={`prompt-folder-rename-error-${folder.id}`} role="alert"
            className="mt-1 text-[11px] leading-4 text-rose-600">{editing.error}</p>}
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{folder.items.length} 组母本</p>
        </div>;
      })}
    </div> : <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400 dark:border-white/10">
      还没有商品{parentId ? '细分' : '大类'}，右键空白处可新建文件夹。
    </div>}

    <button type="button" onClick={openCreateDialog}
      className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-xs focus:text-indigo-600 focus:shadow-md">
      新建文件夹
    </button>

    {menu && <PromptFolderContextMenu menu={menu} menuRef={menuRef} folders={folders}
      onOpen={id => { onOpen(id); setMenu(null); setSelectedFolderIds([]); }}
      onRename={beginInlineRename}
      onRules={id => { nameButtonRefs.current.get(id)?.focus(); setRulesId(id); setMenu(null); }}
      onMoveGroups={ids => { onMoveGroups(ids); setMenu(null); }}
      onDelete={openDeleteDialog} onCreate={openCreateDialog} />}

    {createDialogOpen && <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreateDialogOpen(false); }}>
      <form role="dialog" aria-modal="true" aria-label="新建文件夹" onSubmit={saveFolder}
        onKeyDown={event => { if (event.key === 'Escape' && !saving) setCreateDialogOpen(false); }}
        className="w-full max-w-sm rounded-2xl border border-white bg-white p-5 shadow-2xl dark:bg-[#18191c]">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">新建文件夹</h3>
          <button type="button" aria-label="关闭" disabled={saving} onClick={() => setCreateDialogOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <label htmlFor="prompt-folder-name" className="mt-5 block text-xs font-semibold text-slate-600 dark:text-slate-300">{parentId ? '商品细分名称' : '商品大类名称'}</label>
        <input ref={createInputRef} id="prompt-folder-name" value={name} maxLength={40} onChange={event => setName(event.target.value)}
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
