import type { RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { densityComposerPill } from '@/shared/ui/layoutClasses';
import { renderRatioMiniIcon } from '../../../utils/modelDisplayHelpers';
import { PromptBarVideoParamsPanel } from './PromptBarVideoControls';
import PromptBarImageControls from './PromptBarImageControls';
import type { QuickGenMode } from '@beike/shared/depthVideo';

interface PromptBarAspectPickerProps {
  isUp: boolean;
  quickGenMode: QuickGenMode;
  isOpen: boolean;
  onToggle: () => void;
  aspectMenuRef: RefObject<HTMLDivElement | null>;
  activeVideoRatioObj: { iconType: string; label: string };
  quickVideoResolution: string;
  quickVideoCount: number;
  activeImageRatioObj: { id: string; iconType: string; label: string };
  quickQuality: string;
  quickCount: number;
  quickVideoAspectId: string;
  setQuickVideoAspectId: (id: string) => void;
  setQuickVideoResolution: (res: any) => void;
  setQuickVideoCount: (count: number) => void;
  quickAspectId: string;
  setQuickAspectId: (id: string) => void;
  setQuickQuality: (q: any) => void;
  setQuickCount: (c: number) => void;
  currentW: number;
  currentH: number;
  quickModel: string;
}

export default function PromptBarAspectPicker({
  isUp,
  quickGenMode,
  isOpen,
  onToggle,
  aspectMenuRef,
  activeVideoRatioObj,
  quickVideoResolution,
  quickVideoCount,
  activeImageRatioObj,
  quickQuality,
  quickCount,
  quickVideoAspectId,
  setQuickVideoAspectId,
  setQuickVideoResolution,
  setQuickVideoCount,
  quickAspectId,
  setQuickAspectId,
  setQuickQuality,
  setQuickCount,
  currentW,
  currentH,
  quickModel,
}: PromptBarAspectPickerProps) {
  return (
    <div className="relative" ref={aspectMenuRef}>
      <button
        type="button"
        onClick={onToggle}
        className={`${densityComposerPill} rounded-2xl font-semibold flex items-center gap-1 xl:gap-2 border-0 transition-all cursor-pointer shrink-0 ${
          isOpen
            ? 'bg-slate-100 text-slate-950 shadow-none'
            : 'bg-transparent hover:bg-slate-50 text-slate-800 shadow-none'
        }`}
      >
        {quickGenMode === 'video' ? (
          <>
            {renderRatioMiniIcon(
              activeVideoRatioObj.iconType,
              'w-4 h-4 opacity-80 shrink-0'
            )}
            <span className="font-mono hidden sm:inline">
              {activeVideoRatioObj.label}
            </span>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="font-mono flex items-center gap-0.5 text-cyan-600 font-bold">
              {quickVideoResolution}
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-mono">{quickVideoCount}</span>
          </>
        ) : (
          <>
            {renderRatioMiniIcon(
              activeImageRatioObj.iconType,
              'w-4 h-4 opacity-80 shrink-0'
            )}
            <span className="font-mono hidden sm:inline">
              {activeImageRatioObj.id === 'smart'
                ? '智能'
                : activeImageRatioObj.label}
            </span>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="font-bold text-cyan-600 font-mono">
              {quickQuality === 'low'
                ? '1K'
                : quickQuality === 'medium'
                ? '2K'
                : '4K'}
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-mono">{quickCount}</span>
          </>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 ${
            isUp
              ? 'bottom-full mb-2 sm:mb-3 origin-bottom'
              : 'top-full mt-2 origin-top'
          } w-[min(480px,calc(100vw-2rem))] max-h-[min(28rem,calc(100dvh-180px))] overflow-y-auto rounded-2xl sm:rounded-[28px] xl:rounded-[32px] bg-white border border-slate-200/90 shadow-2xl p-3.5 sm:p-5 xl:p-6 z-50 animate-fade-in space-y-3 sm:space-y-4 xl:space-y-5 text-left`}
        >
          {quickGenMode === 'video' ? (
            <PromptBarVideoParamsPanel
              quickVideoAspectId={quickVideoAspectId}
              setQuickVideoAspectId={setQuickVideoAspectId}
              quickVideoResolution={quickVideoResolution as '480P' | '720P' | '1080P' | '4K'}
              setQuickVideoResolution={setQuickVideoResolution}
              quickVideoCount={quickVideoCount}
              setQuickVideoCount={setQuickVideoCount}
            />
          ) : (
            <PromptBarImageControls
              quickAspectId={quickAspectId}
              setQuickAspectId={setQuickAspectId}
              quickQuality={quickQuality as 'high' | 'medium' | 'low'}
              setQuickQuality={setQuickQuality}
              quickCount={quickCount}
              setQuickCount={setQuickCount}
              currentW={currentW}
              currentH={currentH}
              imageModelId={quickModel}
            />
          )}
        </div>
      )}
    </div>
  );
}
