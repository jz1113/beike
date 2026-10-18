import type { RefObject } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { densityComposerPill } from '@client/shared/ui/layoutClasses';
import { useI18n } from '@client/shared/i18n';
import type { QuickGenMode } from '@shared/domain/media/depthVideo';

interface PromptBarModeSelectorProps {
  isUp: boolean;
  quickGenMode: QuickGenMode;
  isDepthMode: boolean;
  isOpen: boolean;
  onToggle: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  modeButtonClass: string;
  onSelectMode: (mode: QuickGenMode) => void;
}

export default function PromptBarModeSelector({
  isUp,
  quickGenMode,
  isDepthMode,
  isOpen,
  onToggle,
  menuRef,
  modeButtonClass,
  onSelectMode,
}: PromptBarModeSelectorProps) {
  const { t } = useI18n();

  const currentModeLabel = (() => {
    if (quickGenMode === 'agent') return t('promptBar.modes.agent');
    if (quickGenMode === 'video') return t('promptBar.modes.video');
    if (quickGenMode === 'audio') return '音频生成';
    if (isDepthMode) {
      return quickGenMode === 'depth-image' ? '深度图片' : '深度视频';
    }
    return t('promptBar.modes.image');
  })();

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        className={`${densityComposerPill} rounded-full flex items-center gap-1.5 transition-all cursor-pointer border-0 shrink-0 ${modeButtonClass}`}
      >
        <span className="text-xs sm:text-[13px]">{currentModeLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 opacity-60 ml-0.5 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* 模式切换菜单 */}
      {isOpen && (
        <div
          className={`absolute left-0 ${
            isUp ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
          } w-44 rounded-2xl bg-white dark:bg-[#18191c]/95 dark:backdrop-blur-xl border border-slate-200/90 dark:border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-1.5 z-50 animate-fade-in text-left space-y-0.5 select-none text-slate-900 dark:text-slate-100`}
        >
          {/* 1. Agent 模式 */}
          <button
            type="button"
            onClick={() => onSelectMode('agent')}
            className={`w-full px-3 py-2 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group ${
              quickGenMode === 'agent'
                ? 'bg-slate-100/90 dark:bg-white/15 text-slate-950 dark:text-white font-semibold'
                : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10'
            }`}
          >
            <span className="text-[13.5px] font-medium text-slate-900 dark:text-white">Agent模式</span>
            {quickGenMode === 'agent' && (
              <Check className="w-4 h-4 text-slate-900 dark:text-white stroke-[2.2]" />
            )}
          </button>

          {/* 2. 视频生成 */}
          <button
            type="button"
            onClick={() => onSelectMode('video')}
            className={`w-full px-3 py-2 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group ${
              quickGenMode === 'video'
                ? 'bg-slate-100/90 dark:bg-white/15 text-slate-950 dark:text-white font-semibold'
                : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10'
            }`}
          >
            <span className="text-[13.5px] font-medium text-slate-900 dark:text-white">视频生成</span>
            {quickGenMode === 'video' && (
              <Check className="w-4 h-4 text-slate-900 dark:text-white stroke-[2.2]" />
            )}
          </button>

          {/* 3. 图片生成 */}
          <button
            type="button"
            onClick={() => onSelectMode('image')}
            className={`w-full px-3 py-2 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group ${
              quickGenMode === 'image'
                ? 'bg-slate-100/90 dark:bg-white/15 text-slate-950 dark:text-white font-semibold'
                : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10'
            }`}
          >
            <span className="text-[13.5px] font-medium text-slate-900 dark:text-white">图片生成</span>
            {quickGenMode === 'image' && (
              <Check className="w-4 h-4 text-slate-900 dark:text-white stroke-[2.2]" />
            )}
          </button>

          {/* 4. 音频生成 */}
          <button
            type="button"
            onClick={() => onSelectMode('audio')}
            className={`w-full px-3 py-2 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group ${
              quickGenMode === 'audio'
                ? 'bg-slate-100/90 dark:bg-white/15 text-slate-950 dark:text-white font-semibold'
                : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10'
            }`}
          >
            <span className="text-[13.5px] font-medium text-slate-900 dark:text-white">音频生成</span>
            {quickGenMode === 'audio' && (
              <Check className="w-4 h-4 text-slate-900 dark:text-white stroke-[2.2]" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
