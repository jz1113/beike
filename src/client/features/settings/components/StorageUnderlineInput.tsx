import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface StorageUnderlineInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  hint?: string;
  isSecret?: boolean;
  secretVisible?: boolean;
  onToggleSecret?: () => void;
}

export function StorageUnderlineInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  isSecret = false,
  secretVisible = false,
  onToggleSecret,
}: StorageUnderlineInputProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-bold text-slate-900 select-none">
        {label}
      </label>
      <div className="relative flex items-center border-b border-slate-200/90 focus-within:border-slate-800 transition-colors">
        <input
          id={id}
          type={isSecret && !secretVisible ? 'password' : 'text'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="storage-underline-input w-full bg-transparent border-0 px-0 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 leading-relaxed"
        />
        {isSecret && onToggleSecret && (
          <button
            type="button"
            tabIndex={-1}
            onClick={onToggleSecret}
            className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            aria-label={secretVisible ? '隐藏密文' : '显示密文'}
          >
            {secretVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-slate-400 pt-0.5 leading-relaxed">{hint}</p>}
    </div>
  );
}
