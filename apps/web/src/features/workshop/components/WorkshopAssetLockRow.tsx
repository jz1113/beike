import type { ReactNode } from 'react';

export interface WorkshopAssetLockOption {
  id: string;
  title?: string;
  name?: string;
  code?: string;
}

export function WorkshopAssetLockRow({
  label,
  value,
  onChange,
  options,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: WorkshopAssetLockOption[];
  prefix: string;
}): ReactNode {
  return (
    <label className="flex items-center justify-between gap-2 py-2 sm:py-0">
      <span className="shrink-0 text-xs font-bold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
      >
        <option value="auto">智能轮循</option>
        {options.map((option, idx) => (
          <option key={option.id} value={option.id}>
            {option.code ? `[#${option.code.replace(/^#/, '')}]` : `[#${prefix}-${String(idx + 1).padStart(2, '0')}]`}{' '}
            {option.name || option.title}
          </option>
        ))}
      </select>
    </label>
  );
}
