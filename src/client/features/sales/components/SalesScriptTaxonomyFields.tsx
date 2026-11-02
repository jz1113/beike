import { useId, useState } from 'react';
import { Check, Plus, Settings2, X } from 'lucide-react';
import type { SalesScriptTaxonomy } from '@shared/domain/sales';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';

interface Props {
  value: SalesScriptTaxonomy;
  items: readonly ScriptTaxonomyItem[];
  onChange: (patch: { categoryId?: string; styleId?: string }) => void;
  onManage: (kind: ScriptTaxonomyKind) => void;
  onCreate?: (kind: ScriptTaxonomyKind, name: string) => Promise<ScriptTaxonomyItem | null>;
  disabled?: boolean;
}

export function SalesScriptTaxonomyFields({ value, items, onChange, onManage, onCreate, disabled }: Props) {
  const fieldId = useId();
  const [creatingKind, setCreatingKind] = useState<ScriptTaxonomyKind | null>(null);
  const [draftName, setDraftName] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);

  const submitCreate = (kind: ScriptTaxonomyKind) => {
    const trimmed = draftName.trim();
    if (!trimmed || creatingBusy || disabled || !onCreate) return;
    setCreatingBusy(true);
    void onCreate(kind, trimmed).then((created) => {
      if (created) {
        const key = kind === 'category' ? 'categoryId' : 'styleId';
        onChange({ [key]: created.id });
        setCreatingKind(null);
        setDraftName('');
      }
    }).finally(() => setCreatingBusy(false));
  };

  return <div className="sales-taxonomy-fields">
    {(['category', 'style'] as const).map((kind) => {
      const options = items.filter((item) => item.kind === kind);
      const key = kind === 'category' ? 'categoryId' : 'styleId';
      const selected = value[key] || '';
      const missingSelection = selected && !options.some((item) => item.id === selected);
      const label = kind === 'category' ? '素材分类' : '拍摄风格';
      const unit = kind === 'category' ? '分类' : '风格';

      return <div key={kind} className="sales-taxonomy-field">
        <div className="sales-taxonomy-field-head">
          <label htmlFor={`${fieldId}-${kind}`} className="sales-beat-field-label">{label}</label>
          <div className="sales-taxonomy-field-actions">
            {onCreate && (
              <button
                type="button"
                disabled={disabled || creatingBusy}
                onClick={() => {
                  setCreatingKind(creatingKind === kind ? null : kind);
                  setDraftName('');
                }}
                className={`sales-taxonomy-link-btn ${salesFocusClass}`}
              >
                <Plus size={11} aria-hidden />新建
              </button>
            )}
            <button
              type="button"
              disabled={disabled || creatingBusy}
              onClick={() => onManage(kind)}
              title={`管理${label}`}
              className={`sales-taxonomy-link-btn ${salesFocusClass}`}
            >
              <Settings2 size={11} aria-hidden />管理
            </button>
          </div>
        </div>

        {creatingKind === kind && onCreate ? (
          <div className="sales-taxonomy-inline-form">
            <input
              autoFocus
              value={draftName}
              maxLength={40}
              disabled={disabled || creatingBusy}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitCreate(kind); }
                if (e.key === 'Escape') { setCreatingKind(null); setDraftName(''); }
              }}
              placeholder={`输入新${unit}名称…`}
              aria-label={`新${unit}名称`}
              className={salesInputClass}
            />
            <button type="button" disabled={!draftName.trim() || disabled || creatingBusy} onClick={() => submitCreate(kind)} aria-label={`确认新建${unit}`} className={salesGhostButtonClass}>
              <Check size={12} aria-hidden />
            </button>
            <button type="button" disabled={creatingBusy} onClick={() => { setCreatingKind(null); setDraftName(''); }} aria-label="取消" className={salesGhostButtonClass}>
              <X size={12} aria-hidden />
            </button>
          </div>
        ) : (
          <SalesLibrarySelect id={`${fieldId}-${kind}`} label={label} value={selected}
            disabled={disabled || creatingBusy} searchable
            onChange={(next) => onChange({ [key]: next })}
            options={[{ value: '', label: kind === 'category' ? '未分类' : '未设风格' },
              ...(missingSelection ? [{ value: selected, label: `原${unit}（未读取）` }] : []),
              ...options.map((item) => ({ value: item.id, label: item.name }))]} />
        )}
      </div>;
    })}
  </div>;
}
