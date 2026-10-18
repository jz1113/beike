import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  snapStudioNumber,
  STUDIO_FIELD_GROUPS,
  studioValueEquals,
  type StudioField,
  type StudioFieldGroup,
  type StudioValues,
} from '@client/shared/media/backgrounds/studio';

const ROW = 'relative flex h-9 items-center gap-2 overflow-hidden rounded-lg bg-slate-100/90 px-3 dark:bg-[#1C1C20]';
const LABEL = 'truncate text-xs text-slate-700 dark:text-[#d4d4d8]';
const VALUE = 'studio-control-input bg-transparent text-right font-mono text-[11px] tabular-nums text-slate-500 outline-none dark:text-[#a1a1aa]';

function formatStudioNumber(value: number, step: number) {
  if (step >= 1) return String(Math.round(value));
  const digits = step >= 0.1 ? 1 : 2;
  return String(Number(value.toFixed(digits)));
}

function DirtyDot() {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />;
}

function StudioSlider({
  field,
  value,
  defaultValue,
  onChange,
}: {
  field: Extract<StudioField, { type: 'slider' }>;
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => formatStudioNumber(value, field.step));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(formatStudioNumber(value, field.step));
  }, [editing, field.step, value]);

  const span = field.max - field.min || 1;
  const percent = Math.min(100, Math.max(0, ((value - field.min) / span) * 100));
  const dirty = !studioValueEquals(value, defaultValue);

  const commitRaw = (raw: string) => {
    setEditing(false);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(formatStudioNumber(value, field.step));
      return;
    }
    onChange(snapStudioNumber(parsed, field.min, field.max, field.step));
  };

  return (
    <div data-studio-row className={ROW}>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-slate-200/90 dark:bg-white/[0.07]"
        style={{ width: `${percent}%` }}
      />
      <div
        className="pointer-events-none absolute top-1/2 z-[1] h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700 dark:bg-white/80"
        style={{ left: `${percent}%` }}
      />
      <div className="pointer-events-none relative z-[1] flex min-w-0 items-center gap-1.5">
        {dirty ? <DirtyDot /> : null}
        <span className={LABEL}>{field.label}</span>
      </div>
      <input
        aria-label={`${field.label}数值`}
        inputMode="decimal"
        value={draft}
        title="双击恢复默认"
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commitRaw(event.currentTarget.value)}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            const restored = formatStudioNumber(value, field.step);
            setDraft(restored);
            event.currentTarget.value = restored;
            event.currentTarget.blur();
          }
        }}
        className={`relative z-[3] ml-auto w-12 ${VALUE}`}
      />
      <input
        aria-label={field.label}
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="absolute inset-y-0 left-0 z-[2] w-[calc(100%-3.25rem)] cursor-pointer opacity-0"
      />
    </div>
  );
}

function StudioColor({
  label,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = !studioValueEquals(value, defaultValue);
  const commit = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(draft)) onChange(draft.toLowerCase());
    else setDraft(value);
  };
  return (
    <div data-studio-row className={ROW}>
      {dirty ? <DirtyDot /> : null}
      <span className={LABEL}>{label}</span>
      <input
        aria-label={`${label}色值`}
        value={draft}
        maxLength={7}
        title="双击恢复默认"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className={`ml-auto w-16 uppercase ${VALUE}`}
      />
      <label className="relative h-4 w-4 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/10 dark:border-white/15">
        <input
          aria-label={label}
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <span className="block h-full w-full" style={{ background: value }} />
      </label>
    </div>
  );
}

function StudioSelect({
  field,
  value,
  onChange,
}: {
  field: Extract<StudioField, { type: 'select' }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const current = field.options.find((option) => option.id === value)?.label ?? value;
  return (
    <label data-studio-row className={`${ROW} cursor-pointer`}>
      <span className={LABEL}>{field.label}</span>
      <span className="ml-auto truncate text-xs text-slate-500 dark:text-[#a1a1aa]">{current}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <select
        aria-label={field.label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="studio-control-input absolute inset-0 cursor-pointer opacity-0"
      >
        {field.options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function StudioSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div data-studio-row className={ROW}>
      <span className={LABEL}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative ml-auto h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
          checked ? 'bg-violet-600' : 'bg-slate-300 dark:bg-[#3A3A40]'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function renderField(
  field: StudioField,
  values: StudioValues,
  defaults: StudioValues,
  onChange: (patch: Partial<StudioValues>) => void,
): ReactNode {
  if (field.type === 'slider') {
    const value = values[field.key];
    const fallback = defaults[field.key];
    return (
      <StudioSlider
        key={field.key}
        field={field}
        value={typeof value === 'number' ? value : field.min}
        defaultValue={typeof fallback === 'number' ? fallback : field.min}
        onChange={(next) => onChange({ [field.key]: next })}
      />
    );
  }
  if (field.type === 'color') {
    const value = values[field.key];
    const fallback = defaults[field.key];
    return (
      <StudioColor
        key={field.key}
        label={field.label}
        value={typeof value === 'string' ? value : '#000000'}
        defaultValue={typeof fallback === 'string' ? fallback : '#000000'}
        onChange={(next) => onChange({ [field.key]: next })}
      />
    );
  }
  if (field.type === 'select') {
    const value = values[field.key];
    return (
      <StudioSelect
        key={field.key}
        field={field}
        value={typeof value === 'string' ? value : field.options[0]?.id ?? ''}
        onChange={(next) => onChange({ [field.key]: next })}
      />
    );
  }
  return (
    <StudioSwitch
      key={field.key}
      label={field.label}
      checked={values[field.key] === true}
      onChange={(next) => onChange({ [field.key]: next })}
    />
  );
}

function fieldsInGroup(fields: StudioField[], group: StudioFieldGroup) {
  return fields.filter((field) => field.group === group);
}

function countHiddenRows(root: HTMLElement) {
  const edge = root.getBoundingClientRect().bottom - 4;
  let hidden = 0;
  root.querySelectorAll<HTMLElement>('[data-studio-row]').forEach((row) => {
    if (row.getBoundingClientRect().top >= edge) hidden += 1;
  });
  return hidden;
}

export function StudioFieldGrid({
  fields,
  values,
  defaults,
  onChange,
}: {
  fields: StudioField[];
  values: StudioValues;
  defaults: StudioValues;
  onChange: (patch: Partial<StudioValues>) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return undefined;
    const measure = () => setRemaining(countHiddenRows(root));
    measure();
    root.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root);
    return () => {
      root.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [advancedOpen, fields]);

  const revealMore = () => {
    const root = scrollRef.current;
    if (!root) return;
    root.scrollBy({ top: Math.max(160, Math.round(root.clientHeight * 0.85)), behavior: 'smooth' });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2">
        {STUDIO_FIELD_GROUPS.map((group) => {
          const groupedFields = fieldsInGroup(fields, group.id);
          if (groupedFields.length === 0) return null;
          const dirty = groupedFields.filter((field) => !studioValueEquals(values[field.key], defaults[field.key])).length;
          const collapsed = group.collapsible && !advancedOpen;
          return (
            <section key={group.id} className="space-y-1.5">
              <div className="flex items-center gap-2 px-0.5">
                {group.collapsible ? (
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    onClick={() => setAdvancedOpen((open) => !open)}
                    className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-[#8E8E93]"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                    {group.label}
                  </button>
                ) : (
                  <h4 className="text-[11px] font-medium text-slate-500 dark:text-[#8E8E93]">{group.label}</h4>
                )}
                {dirty > 0 ? (
                  <span className="text-[10px] font-medium text-violet-600 dark:text-violet-300">{dirty}</span>
                ) : null}
                {dirty > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const patch: Partial<StudioValues> = {};
                      for (const field of groupedFields) patch[field.key] = defaults[field.key];
                      onChange(patch);
                    }}
                    className="ml-auto cursor-pointer text-[11px] text-slate-500 hover:text-slate-900 dark:text-[#8E8E93] dark:hover:text-white"
                  >
                    恢复本组
                  </button>
                ) : null}
              </div>
              {collapsed ? null : (
                <div className="space-y-1.5">
                  {groupedFields.map((field) => renderField(field, values, defaults, onChange))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {remaining > 0 ? (
        <div className="flex shrink-0 justify-center px-4 pb-3 pt-2">
          <button
            type="button"
            onClick={revealMore}
            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-slate-200/90 bg-white px-3 text-[11px] text-slate-600 shadow-sm dark:border-white/10 dark:bg-[#2A2A30] dark:text-[#C7C7CC]"
          >
            还有 {remaining} 个
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="h-3 shrink-0" />
      )}
    </div>
  );
}
