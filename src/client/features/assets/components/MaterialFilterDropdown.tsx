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
        className="flex items-center gap-1.5 pl-3 pr-2.5 py-1 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-700 dark:text-[#EDEDED] border border-transparent dark:border-white/10 text-xs font-medium cursor-pointer h-8 transition-colors select-none"
      >
        <span>{label}</span>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-500 dark:text-[#8E8E93]" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-[#8E8E93]" />
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'left' ? 'left-0' : 'right-0'
          } top-full mt-1.5 z-40 ${minWidth} rounded-2xl bg-white dark:bg-[#1B1B1E] p-1.5 shadow-xl dark:shadow-[0_16px_36px_rgba(0,0,0,0.6)] border border-slate-100 dark:border-white/10 animate-in fade-in zoom-in-95 duration-100 select-none`}
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
                    ? 'font-semibold text-slate-900 dark:text-white bg-slate-50 dark:bg-white/10'
                    : 'text-slate-600 dark:text-[#C7C7CC] hover:text-slate-900 dark:hover:text-white hover:bg-slate-50/80 dark:hover:bg-white/[0.06] font-normal'
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-slate-900 dark:text-white stroke-[2.5]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MaterialFilterDropdown;
