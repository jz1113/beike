import { RefObject } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  DEPTH_QUALITY_LABELS,
  DEPTH_QUALITY_TIERS,
  type DepthQuality,
} from '@beike/domain/depthVideo';
import { densityComposerPill } from '@/shared/ui/layoutClasses';

interface Props {
  isUp: boolean;
  quickDepthQuality: DepthQuality;
  setQuickDepthQuality: (quality: DepthQuality) => void;
  showQualityDropdown: boolean;
  setShowQualityDropdown: (open: boolean) => void;
  qualityDropdownRef: RefObject<HTMLDivElement | null>;
}

export default function PromptBarDepthQualityPill({
  isUp,
  quickDepthQuality,
  setQuickDepthQuality,
  showQualityDropdown,
  setShowQualityDropdown,
  qualityDropdownRef,
}: Props) {
  return (
    <div className="relative" ref={qualityDropdownRef}>
      <button
        type="button"
        onClick={() => setShowQualityDropdown(!showQualityDropdown)}
        className={`${densityComposerPill} rounded-2xl font-semibold flex items-center gap-1 xl:gap-2 transition-all cursor-pointer border-0 shrink-0 ${
          showQualityDropdown
            ? 'bg-violet-50/70 text-violet-800 shadow-none'
            : 'bg-transparent hover:bg-slate-50 text-violet-600 shadow-none'
        }`}
      >
        <span className="hidden sm:inline">{DEPTH_QUALITY_LABELS[quickDepthQuality]}</span>
        <span className="sm:hidden">清晰</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5" />
      </button>

      {showQualityDropdown && (
        <div
          className={`absolute left-0 ${
            isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
          } w-44 sm:w-48 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-1 sm:p-1.5 z-50 animate-fade-in text-left space-y-0.5`}
        >
          {DEPTH_QUALITY_TIERS.map((quality) => (
            <button
              key={quality}
              type="button"
              onClick={() => {
                setQuickDepthQuality(quality);
                setShowQualityDropdown(false);
              }}
              className={`w-full px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                quickDepthQuality === quality
                  ? 'bg-slate-100/90 text-slate-950 font-bold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="text-xs sm:text-[13.5px] font-medium text-slate-900">
                {DEPTH_QUALITY_LABELS[quality]}
              </span>
              {quickDepthQuality === quality && (
                <Check className="w-3.5 h-3.5 text-slate-900 stroke-[2.5] flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
