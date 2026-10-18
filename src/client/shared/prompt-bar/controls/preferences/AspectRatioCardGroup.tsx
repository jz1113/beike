import { Scan } from 'lucide-react';

export interface AspectRatioOptionItem {
  id: string;
  label: string;
  disabled?: boolean;
}

interface AspectRatioCardGroupProps {
  value: string;
  onChange: (aspect: string) => void;
  options: AspectRatioOptionItem[];
}

function RatioIcon({ id, isSelected }: { id: string; isSelected: boolean }) {
  const borderClass = isSelected
    ? 'border-slate-900 dark:border-white'
    : 'border-slate-400 dark:border-white/40 group-hover:border-slate-600 dark:group-hover:border-white/70';

  switch (id) {
    case 'adaptive':
    case 'smart':
      return (
        <Scan
          className={`w-4 h-4 transition-colors ${
            isSelected
              ? 'text-slate-900 dark:text-white'
              : 'text-slate-400 dark:text-white/40 group-hover:text-slate-600'
          }`}
          strokeWidth={2}
        />
      );
    case '21:9':
      return <div className={`w-[20px] h-[9px] border-[1.5px] rounded-[2px] transition-colors ${borderClass}`} />;
    case '16:9':
      return <div className={`w-[18px] h-[10px] border-[1.5px] rounded-[2px] transition-colors ${borderClass}`} />;
    case '3:2':
      return <div className={`w-[16px] h-[11px] border-[1.5px] rounded-[2px] transition-colors ${borderClass}`} />;
    case '4:3':
      return <div className={`w-[16px] h-[12px] border-[1.5px] rounded-[2px] transition-colors ${borderClass}`} />;
    case '1:1':
      return <div className={`w-[13px] h-[13px] border-[1.5px] rounded-[2px] transition-colors ${borderClass}`} />;
    case '3:4':
      return <div className={`w-[12px] h-[16px] border-[1.5px] rounded-[2px] transition-colors ${borderClass}`} />;
    case '2:3':
      return <div className={`w-[11px] h-[16px] border-[1.5px] rounded-[2px] transition-colors ${borderClass}`} />;
    case '9:16':
      return <div className={`w-[10px] h-[18px] border-[1.5px] rounded-[2px] transition-colors ${borderClass}`} />;
    default:
      return <div className={`w-[16px] h-[12px] border-[1.5px] rounded-[2px] transition-colors ${borderClass}`} />;
  }
}

export function AspectRatioCardGroup({ value, onChange, options }: AspectRatioCardGroupProps) {
  return (
    <div className="relative flex items-center p-1 bg-slate-100/80 dark:bg-white/5 rounded-2xl group/ratio">
      <div
        className="grid w-full gap-1 py-0.5 px-0.5 select-none"
        style={{ gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => {
          const isSelected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={opt.disabled}
              title={opt.disabled ? '当前模型不支持' : opt.label}
              onClick={() => { if (!opt.disabled) onChange(opt.id); }}
              className={`group min-w-0 py-1.5 px-0.5 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-all ${
                opt.disabled
                  ? 'cursor-not-allowed text-slate-300 opacity-45 dark:text-slate-600'
                  : isSelected
                  ? 'cursor-pointer bg-white dark:bg-[#20252F] text-slate-950 dark:text-white shadow-xs'
                  : 'cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/[0.04]'
              }`}
            >
              <div className="h-6 flex items-center justify-center">
                <RatioIcon id={opt.id} isSelected={isSelected} />
              </div>
              <span className="text-[11px] font-medium leading-none tracking-tight truncate max-w-full">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
