import { useEffect, RefObject } from 'react';
import { Check, ChevronDown, UserRound } from 'lucide-react';
import {
  DEPTH_STYLE_LABELS,
  DEPTH_VIDEO_STYLES,
  type DepthVideoStyle,
} from '@beike/domain/depthVideo';
import { densityComposerPill } from '@/shared/ui/layoutClasses';

interface Props {
  isUp: boolean;
  quickDepthStyle: DepthVideoStyle;
  setQuickDepthStyle: (style: DepthVideoStyle) => void;
  showStyleDropdown: boolean;
  setShowStyleDropdown: (open: boolean) => void;
  styleDropdownRef: RefObject<HTMLDivElement | null>;
}

export default function PromptBarDepthStylePill({
  isUp,
  quickDepthStyle,
  setQuickDepthStyle,
  showStyleDropdown,
  setShowStyleDropdown,
  styleDropdownRef,
}: Props) {
  useEffect(() => {
    if (quickDepthStyle !== 'mocap') {
      setQuickDepthStyle('mocap');
    }
  }, [quickDepthStyle, setQuickDepthStyle]);
  return (
    <div className="relative" ref={styleDropdownRef}>
      <button
        type="button"
        onClick={() => setShowStyleDropdown(!showStyleDropdown)}
        className={`${densityComposerPill} rounded-2xl font-semibold flex items-center gap-1 xl:gap-2 transition-all cursor-pointer border-0 shrink-0 ${
          showStyleDropdown
            ? 'bg-violet-50/70 text-violet-800 shadow-none'
            : 'bg-transparent hover:bg-slate-50 text-violet-600 shadow-none'
        }`}
      >
        <UserRound className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline">{DEPTH_STYLE_LABELS[quickDepthStyle]}</span>
        <span className="sm:hidden">风格</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5" />
      </button>

      {showStyleDropdown && (
        <div
          className={`absolute left-0 ${
            isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
          } w-44 sm:w-48 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-1 sm:p-1.5 z-50 animate-fade-in text-left space-y-0.5`}
        >
          {DEPTH_VIDEO_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => {
                setQuickDepthStyle(style);
                setShowStyleDropdown(false);
              }}
              className={`w-full px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                quickDepthStyle === style
                  ? 'bg-slate-100/90 text-slate-950 font-bold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="text-xs sm:text-[13.5px] font-medium text-slate-900">
                {DEPTH_STYLE_LABELS[style]}
              </span>
              {quickDepthStyle === style && (
                <Check className="w-3.5 h-3.5 text-slate-900 stroke-[2.5] flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
