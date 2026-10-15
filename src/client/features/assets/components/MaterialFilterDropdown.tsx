import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';

export interface DropdownOption<T extends string> {
  id: T;
  label: string;
}

export interface MaterialFilterDropdownProps<T extends string> {
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (val: T) => void;
  minWidth?: string;
  align?: 'left' | 'right';
}

export function MaterialFilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  minWidth = 'w-36',
  align = 'right',
}: MaterialFilterDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-flex items-center" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 pl-3 pr-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/60 text-slate-700 text-xs font-medium cursor-pointer h-8 transition-colors select-none"
      >
        <span>{label}</span>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'left' ? 'left-0' : 'right-0'
          } top-full mt-1.5 z-40 ${minWidth} rounded-2xl bg-white p-1.5 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100 select-none`}
        >
          {options.map((opt) => {
            const isSelected = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left cursor-pointer transition-colors ${
                  isSelected
                    ? 'font-semibold text-slate-900 bg-slate-50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/80 font-normal'
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-slate-900 stroke-[2.5]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MaterialFilterDropdown;
