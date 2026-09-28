import { audienceLabel } from '@shared/domain/assets/appearanceAudience';
import type { ReactNode } from 'react';

export interface WorkshopAssetLockOption {
  id: string;
  title?: string;
  name?: string;
  code?: string;
  dimensions?: string | null;
  appearanceAudience?: string;
}

export function WorkshopAssetLockRow({
  label,
  value,
  onChange,
  options,
  prefix,
  autoLabel = '智能轮循',
  rotationLabel,
  specialOptions,
  optionSuffix,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: WorkshopAssetLockOption[];
  prefix: string;
  autoLabel?: string;
  rotationLabel?: string;
  specialOptions?: Array<{ id: string; label: string }>;
  optionSuffix?: (option: WorkshopAssetLockOption) => string;
}): ReactNode {
  const builtInOptions = specialOptions || [{ id: 'auto', label: autoLabel }, ...(rotationLabel ? [{ id: 'rotate', label: rotationLabel }] : [])];
  return (
    <label className="flex items-center justify-between gap-2 py-2 sm:py-0">
      <span className="shrink-0 text-xs font-bold text-slate-700">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
      >
        {builtInOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        {!builtInOptions.some(option => option.id === value) && !options.some(option => option.id === value) && <option value={value} disabled>原选择已失效，请重新选择</option>}
        {options.map((option, idx) => (
          <option key={option.id} value={option.id}>
            {option.code ? `[#${option.code.replace(/^#/, '')}]` : `[#${prefix}-${String(idx + 1).padStart(2, '0')}]`}{' '}
            {option.name || option.title}{(prefix === 'P' || prefix === 'O') ? ` · ${audienceLabel({ ...option }, prefix === 'O')}` : ''}{optionSuffix?.(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
