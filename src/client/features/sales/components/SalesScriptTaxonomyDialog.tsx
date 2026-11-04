import { useEffect, useId, useRef, useState } from 'react';
import { Check, FolderClosed, Loader2, Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
import { salesFocusClass, salesGhostButtonClass, salesInputClass, salesPrimaryButtonClass } from './salesChrome';

const KIND_META = {
  category: { title: '素材分类', unit: '分类', example: '例如：服饰、护肤、家居', Icon: FolderClosed },
  style: { title: '拍摄风格', unit: '风格', example: '例如：手势舞、口播、细节展示', Icon: Sparkles },
};
const KINDS: ScriptTaxonomyKind[] = ['category', 'style'];

interface Props {
  initialKind: ScriptTaxonomyKind;
  items: readonly ScriptTaxonomyItem[];
  usageCounts: Readonly<Record<string, number>>;
  usageLoading?: boolean;
  loading: boolean;
  busy: boolean;
  error: string;
  onCreate: (kind: ScriptTaxonomyKind, name: string) => Promise<ScriptTaxonomyItem | boolean | null>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onRemove: (item: ScriptTaxonomyItem) => Promise<boolean>;
  onRetry: () => void;
  onClose: () => void;
}

interface RowMenuState { item: ScriptTaxonomyItem; x: number; y: number }

export function SalesScriptTaxonomyDialog({ initialKind, items, usageCounts, usageLoading, loading, busy, error, onCreate, onRename, onRemove, onRetry, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mutationLock = useRef(false);
  const id = useId();
  const [kind, setKind] = useState(initialKind);
  const [queries, setQueries] = useState({ category: '', style: '' });
  const [names, setNames] = useState({ category: '', style: '' });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [removingId, setRemovingId] = useState('');
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const saving = busy || pending;
  const disabled = saving || loading;
  const meta = KIND_META[kind];
  const Icon = meta.Icon;
  const rows = items.filter((item) => item.kind === kind);
  const query = queries[kind].trim().toLocaleLowerCase();
  const visibleRows = rows.filter((item) => item.name.toLocaleLowerCase().includes(query));
  const duplicate = (name: string, excludedId = '') => rows.some((item) => item.id !== excludedId && item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());

  useEffect(() => { dialogRef.current?.showModal(); }, []);
  useEffect(() => {
    if (!rowMenu) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setRowMenu(null); };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRowMenu(null); }
    };
    const close = () => setRowMenu(null);
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [rowMenu]);

  const mutate = async (operation: () => Promise<unknown>) => {
    if (disabled || mutationLock.current) return false;
    mutationLock.current = true; setPending(true); setLocalError(''); setNotice('');
    try { return Boolean(await operation()); }
    catch (err) { setLocalError(err instanceof Error ? err.message : '保存失败，请重试'); return false; }
    finally { mutationLock.current = false; setPending(false); }
  };
  const startEdit = (item: ScriptTaxonomyItem) => {
    if (disabled) return;
    setRowMenu(null); setEditingId(item.id); setEditName(item.name); setRemovingId(''); setCreating(false);
  };
  const startRemove = (item: ScriptTaxonomyItem) => {
    if (disabled) return;
    setRowMenu(null); setRemovingId(item.id); setEditingId(''); setCreating(false);
  };
  const selectKind = (next: ScriptTaxonomyKind) => {
    if (kind === next) return;
    setKind(next); setRowMenu(null); setCreating(false); setRemovingId(''); setEditingId(''); setLocalError(''); setNotice('');
  };
  const submitNew = async () => {
    const name = names[kind].trim();
    if (!name || duplicate(name)) return;
    if (await mutate(() => onCreate(kind, name))) {
      setNames((previous) => ({ ...previous, [kind]: '' }));
      setQueries((previous) => ({ ...previous, [kind]: '' }));
      setCreating(false); setNotice('已添加「' + name + '」');
    }
  };
  const rename = async (item: ScriptTaxonomyItem) => {
    const name = editName.trim();
    if (!name || duplicate(name, item.id)) return;
    if (name === item.name) { setEditingId(''); return; }
    if (await mutate(() => onRename(item.id, name))) { setEditingId(''); setNotice('已重命名为「' + name + '」'); }
  };
  const menuX = rowMenu ? Math.max(12, Math.min(rowMenu.x, (typeof window === 'undefined' ? 1024 : window.innerWidth) - 176)) : 0;
  const menuY = rowMenu ? Math.max(12, Math.min(rowMenu.y, (typeof window === 'undefined' ? 768 : window.innerHeight) - 106)) : 0;
  const tabId = (value: ScriptTaxonomyKind) => id + '-' + value + '-tab';

  return <dialog ref={dialogRef} className="sales-taxonomy-dialog sales-taxonomy-manager" aria-labelledby={id + '-title'}
    onCancel={(event) => {
      event.preventDefault();
      if (saving) return;
      if (rowMenu) setRowMenu(null);
      else if (removingId) setRemovingId('');
      else if (editingId) setEditingId('');
      else if (creating) setCreating(false);
      else onClose();
    }} onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <header className="sales-taxonomy-manager-header">
      <h2 id={id + '-title'}>管理分类与风格</h2>
      <button type="button" aria-label="关闭分类与风格管理" disabled={saving} onClick={onClose} className={'sales-modal-close ' + salesFocusClass}><X size={17} aria-hidden /></button>
    </header>
    <div className="sales-taxonomy-manager-toolbar">
      <nav className="sales-taxonomy-manager-nav" role="tablist" aria-label="管理类型" aria-orientation="horizontal">
        {KINDS.map((value) => {
          const item = KIND_META[value]; const TabIcon = item.Icon;
          return <button type="button" key={value} id={tabId(value)} role="tab" aria-selected={kind === value}
            aria-controls={id + '-' + value + '-panel'} tabIndex={kind === value ? 0 : -1} disabled={disabled}
            onClick={() => selectKind(value)} onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 'category' : event.key === 'End' ? 'style' : kind === 'category' ? 'style' : 'category';
              selectKind(next); dialogRef.current?.ownerDocument.getElementById(tabId(next))?.focus();
            }} className={salesFocusClass}>
            <TabIcon size={15} aria-hidden /><span>{item.title}</span><small>{loading ? '…' : items.filter((entry) => entry.kind === value).length}</small>
          </button>;
        })}
      </nav>
      <button type="button" disabled={disabled || creating} className={salesPrimaryButtonClass} onClick={() => { setCreating(true); setEditingId(''); setRemovingId(''); }}><Plus size={14} aria-hidden />新建{meta.unit}</button>
    </div>
    <section id={id + '-' + kind + '-panel'} role="tabpanel" aria-labelledby={tabId(kind)} className="sales-taxonomy-manager-content">
      {(error || localError) && <div className="sales-taxonomy-error" role="alert"><span>{localError || error}</span><button type="button" disabled={disabled} onClick={onRetry}>重新读取</button></div>}
      {(rows.length > 8 || queries[kind] !== '') && <div className="sales-taxonomy-manager-search">
        <Search size={15} aria-hidden /><input type="search" value={queries[kind]} disabled={disabled} placeholder={'搜索' + meta.unit + '名称'} aria-label={'搜索' + meta.unit} onChange={(event) => setQueries((previous) => ({ ...previous, [kind]: event.target.value }))} />
        {queries[kind] && <button type="button" aria-label={'清除' + meta.unit + '搜索'} disabled={disabled} onClick={() => setQueries((previous) => ({ ...previous, [kind]: '' }))}><X size={13} aria-hidden /></button>}
      </div>}
      {creating && <form className="sales-taxonomy-manager-create" onSubmit={(event) => { event.preventDefault(); void submitNew(); }}>
        <label htmlFor={id + '-new'}>新{meta.unit}名称</label>
        <div><input id={id + '-new'} autoFocus value={names[kind]} maxLength={40} disabled={disabled} className={salesInputClass} placeholder={meta.example}
          onChange={(event) => setNames((previous) => ({ ...previous, [kind]: event.target.value }))} />
          <button type="submit" disabled={disabled || !names[kind].trim() || duplicate(names[kind])} className={salesPrimaryButtonClass}><Check size={13} aria-hidden />添加</button>
          <button type="button" disabled={disabled} className={salesGhostButtonClass} onClick={() => setCreating(false)}>取消</button></div>
        {duplicate(names[kind]) && <p role="alert">已存在同名{meta.unit}，请使用其他名称。</p>}
      </form>}
      <div className="sales-taxonomy-manager-list">
        {loading ? <p className="sales-taxonomy-loading" role="status"><Loader2 size={15} className="animate-spin" aria-hidden />正在读取{meta.title}…</p>
          : !visibleRows.length ? creating ? null : <div className="sales-taxonomy-manager-empty"><Icon size={26} aria-hidden /><strong>{query ? '没有匹配的' + meta.unit : '还没有' + meta.unit}</strong>
            <p>{query ? '试试其他关键词，或清除搜索查看全部。' : meta.example}</p>
            <button type="button" disabled={disabled} className={salesGhostButtonClass} onClick={() => query ? setQueries((previous) => ({ ...previous, [kind]: '' })) : setCreating(true)}>{query ? '清除搜索' : '新建第一个' + meta.unit}</button></div>
            : <ul aria-label={meta.title + '列表'}>{visibleRows.map((item) => <li key={item.id} className={'sales-taxonomy-manager-row' + (editingId === item.id || removingId === item.id ? ' is-editing' : '')}
              data-prompt-library-context onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (!disabled) setRowMenu({ item, x: event.clientX, y: event.clientY }); }}>
              {editingId === item.id ? <form className="sales-taxonomy-manager-edit" onSubmit={(event) => { event.preventDefault(); void rename(item); }}>
                <input autoFocus value={editName} maxLength={40} disabled={disabled} aria-label={'重命名 ' + item.name} className={salesInputClass}
                  onChange={(event) => setEditName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditingId(''); } }} />
                <button type="submit" disabled={disabled || !editName.trim() || duplicate(editName, item.id)} className={salesPrimaryButtonClass}>保存</button>
                <button type="button" disabled={disabled} className={salesGhostButtonClass} onClick={() => setEditingId('')}>取消</button>
                {duplicate(editName, item.id) && <p role="alert">已存在同名{meta.unit}。</p>}
              </form> : <>
                <span className="sales-taxonomy-manager-name" onDoubleClick={() => startEdit(item)} title={item.name}><Icon size={15} aria-hidden /><span>{item.name}</span></span>
                <span className="sales-taxonomy-manager-usage">{usageLoading ? '统计中…' : '已关联 ' + (usageCounts[item.id] || 0) + ' 组'}</span>
                <div className="sales-taxonomy-manager-actions">
                  <button type="button" aria-label={'重命名' + meta.unit + ' ' + item.name} title="重命名" disabled={disabled} className={salesFocusClass} onClick={() => startEdit(item)}>重命名</button>
                  <button type="button" aria-label={'移除' + meta.unit + ' ' + item.name} disabled={disabled} className={salesFocusClass} onClick={() => startRemove(item)}>移除</button>
                </div>
              </>}
              {removingId === item.id && <div className="sales-taxonomy-manager-remove">
                <div><strong>移除「{item.name}」？</strong><p>{kind === 'category' ? '仅解除此分类的归属，素材、分镜和其他分类保留。' : '仅清除脚本的此项风格标记，素材与分镜保留。'}</p></div>
                <div><button type="button" disabled={disabled} className={'sales-taxonomy-danger ' + salesFocusClass} onClick={() => { void mutate(() => onRemove(item)).then((ok) => { if (ok) { setRemovingId(''); setNotice('已移除「' + item.name + '」'); } }); }}>确认移除</button><button type="button" disabled={disabled} className={salesGhostButtonClass} onClick={() => setRemovingId('')}>取消</button></div>
              </div>}
            </li>)}</ul>}
      </div>
      {!loading && query && <p className="sales-taxonomy-manager-results" role="status">找到 {visibleRows.length} 个{meta.unit}，共 {rows.length} 个</p>}
    </section>
    <footer className="sales-taxonomy-manager-footer"><span role="status">{saving ? <><Loader2 size={13} className="animate-spin" aria-hidden />正在保存…</> : notice}</span><button type="button" disabled={saving} onClick={onClose} className={salesGhostButtonClass}>关闭</button></footer>
    {rowMenu && <div ref={menuRef} role="menu" aria-label={rowMenu.item.name + ' 操作菜单'} className="sales-taxonomy-manager-menu" data-prompt-library-context style={{ left: menuX, top: menuY }}>
      <button type="button" role="menuitem" disabled={disabled} onClick={() => startEdit(rowMenu.item)}><Pencil size={14} aria-hidden />重命名</button>
      <button type="button" role="menuitem" disabled={disabled} className="is-danger" onClick={() => startRemove(rowMenu.item)}><Trash2 size={14} aria-hidden />移除{KIND_META[rowMenu.item.kind].unit}</button>
    </div>}
  </dialog>;
}
