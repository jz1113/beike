import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
import type { StoredSalesScript } from '../api/salesScripts';
import { SalesScriptTaxonomyFields } from './SalesScriptTaxonomyFields';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

interface Props {
  item: StoredSalesScript;
  items: readonly ScriptTaxonomyItem[];
  loading: boolean;
  onManage: (kind: ScriptTaxonomyKind) => void;
  onCreateTaxonomy?: (kind: ScriptTaxonomyKind, name: string) => Promise<ScriptTaxonomyItem | null>;
  onSave: (item: StoredSalesScript, categoryId: string, styleId: string) => Promise<boolean>;
  onClose: () => void;
}

export function SalesScriptQuickClassify({ item, items, loading, onManage, onCreateTaxonomy, onSave, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [value, setValue] = useState(item.script.taxonomy);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdItems, setCreatedItems] = useState<ScriptTaxonomyItem[]>([]);
  const [error, setError] = useState('');
  const options = [...createdItems.filter((row) => !items.some((item) => item.id === row.id)), ...items];
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  useEffect(() => { setCreatedItems((rows) => rows.filter((row) => !items.some((item) => item.id === row.id))); }, [items]);
  const close = () => { if (!busyRef.current) onClose(); };
  const persist = async () => {
    if (busyRef.current || loading) return;
    busyRef.current = true; setSaving(true); setError('');
    // A missing catalog entry may be a load failure; only an explicit selection clears an ID.
    const { categoryId = '', styleId = '' } = value;
    try {
      if (await onSave(item, categoryId, styleId)) onClose();
      else setError('归类未保存，请重试。');
    } catch (err) { setError(err instanceof Error ? err.message : '保存归类失败，请重试。'); }
    finally { busyRef.current = false; setSaving(false); }
  };

  return <dialog ref={dialogRef} className="sales-taxonomy-dialog sales-classify-dialog" aria-label={`调整 ${item.title} 分类与风格`}
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <header><h2>调整分类与风格</h2><button type="button" disabled={saving || creating} onClick={close} aria-label="关闭归类窗口" className={`sales-modal-close ${salesFocusClass}`}><X size={18} /></button></header>
    <p className="sales-classify-name" title={item.title}>{item.title}</p>
    <SalesScriptTaxonomyFields value={value} items={options} disabled={loading || saving} onManage={onManage}
      onCreate={onCreateTaxonomy ? async (kind, name) => {
        if (busyRef.current) return null;
        busyRef.current = true; setCreating(true); setError('');
        try {
          const created = await onCreateTaxonomy(kind, name);
          if (created) {
            setCreatedItems((rows) => [...rows.filter((row) => row.id !== created.id), created]);
            setValue((current) => ({ ...current, [kind === 'category' ? 'categoryId' : 'styleId']: created.id }));
          } else setError('未能创建，请重试或在分类与风格管理中查看原因。');
          return created;
        } catch (err) { setError(err instanceof Error ? err.message : '创建失败，请重试。'); return null; }
        finally { busyRef.current = false; setCreating(false); }
      } : undefined}
      onChange={(patch) => setValue((current) => ({ ...current, ...patch }))} />
    {error && <p role="alert" className="sales-taxonomy-error">{error}</p>}
    <div className="sales-classify-actions"><button type="button" disabled={saving || creating} onClick={close} className={salesGhostButtonClass}>取消</button>
      <button type="button" disabled={loading || saving || creating} className={`sales-collect-primary ${salesFocusClass}`} onClick={() => { void persist(); }}>
        {saving && <Loader2 size={14} className="animate-spin" />}{saving ? '正在保存…' : '保存归类'}
      </button></div>
  </dialog>;
}
