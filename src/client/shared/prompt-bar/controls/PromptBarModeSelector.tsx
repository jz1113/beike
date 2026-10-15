import type { RefObject } from 'react';
import { ChevronDown, Check, Sparkles, Music } from 'lucide-react';
import { densityComposerPill } from '@client/shared/ui/layoutClasses';
import { useI18n } from '@client/shared/i18n';
import {
  DepthImageModeIcon,
  DepthVideoModeIcon,
  ImageGenModeIcon,
  VideoGenModeIcon,
} from '@client/shared/icons';
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        className={`${densityComposerPill} rounded-2xl font-semibold flex items-center gap-1 xl:gap-2 transition-all cursor-pointer border-0 shrink-0 ${modeButtonClass}`}
      >
        {quickGenMode === 'agent' ? (
          <>
            <Sparkles className="w-4 h-4 text-slate-800" />
            <span className="hidden sm:inline">{t('promptBar.modes.agent')}</span>
            <span className="sm:hidden">Agent</span>
          </>
        ) : quickGenMode === 'video' ? (
          <>
            <VideoGenModeIcon className="w-4 h-4 text-cyan-600" />
            <span className="hidden sm:inline">{t('promptBar.modes.video')}</span>
            <span className="sm:hidden">{t('common.confirm') ? 'Video' : '视频'}</span>
          </>
        ) : quickGenMode === 'audio' ? (
          <>
            <Music className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">音频生成</span>
            <span className="sm:hidden">音频</span>
          </>
        ) : isDepthMode ? (
          <>
            {quickGenMode === 'depth-image' ? (
              <DepthImageModeIcon />
            ) : (
              <DepthVideoModeIcon />
            )}
            <span className="hidden sm:inline">
              {quickGenMode === 'depth-image' ? '深度图片' : '深度视频'}
            </span>
            <span className="sm:hidden">深度</span>
          </>
        ) : (
          <>
            <ImageGenModeIcon className="w-4 h-4 text-sky-600" />
            <span className="hidden sm:inline">{t('promptBar.modes.image')}</span>
            <span className="sm:hidden">图片</span>
          </>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5" />
      </button>

      {/* 🌟 1:1 还原图 4 模式切换菜单 */}
      {isOpen && (
        <div
          className={`absolute left-0 ${
            isUp ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
          } w-72 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-2 z-50 animate-fade-in text-left space-y-1 select-none`}
        >
          {/* 1. Agent 模式 */}
          <button
            type="button"
            onClick={() => onSelectMode('agent')}
            className={`w-full p-2.5 rounded-xl text-left transition-colors cursor-pointer group ${
              quickGenMode === 'agent'
                ? 'bg-slate-100/90 text-slate-950'
                : 'text-slate-800 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-slate-900">Agent模式</span>
                <span className="px-1.5 py-0.5 text-[10.5px] rounded-md bg-slate-200/80 text-slate-700 font-medium">
                  分钟级成片
                </span>
              </div>
              {quickGenMode === 'agent' && (
                <Check className="w-4 h-4 text-slate-900 stroke-[2.5]" />
              )}
            </div>
            <p className="text-[11.5px] text-slate-500 mt-1 leading-normal">
              描述你的想法，Agent 帮你完善创意并自动调用合适的模型
            </p>
          </button>

          {/* 2. 视频生成 */}
          <button
            type="button"
            onClick={() => onSelectMode('video')}
            className={`w-full px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group ${
              quickGenMode === 'video'
                ? 'bg-slate-100/90 text-slate-950 font-semibold'
                : 'text-slate-800 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-medium text-slate-900">视频生成</span>
              <span className="px-1.5 py-0.5 text-[10.5px] rounded-md bg-slate-200/80 text-slate-700 font-medium">
                沉浸式短片
              </span>
            </div>
            {quickGenMode === 'video' && (
              <Check className="w-4 h-4 text-slate-900 stroke-[2.5]" />
            )}
          </button>

          {/* 3. 图片生成 */}
          <button
            type="button"
            onClick={() => onSelectMode('image')}
            className={`w-full px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group ${
              quickGenMode === 'image'
                ? 'bg-slate-100/90 text-slate-950 font-semibold'
                : 'text-slate-800 hover:bg-slate-50'
            }`}
          >
            <span className="text-[13.5px] font-medium text-slate-900">图片生成</span>
            {quickGenMode === 'image' && (
              <Check className="w-4 h-4 text-slate-900 stroke-[2.5]" />
            )}
          </button>

          {/* 4. 音频生成 (NEW) */}
          <button
            type="button"
            onClick={() => onSelectMode('audio')}
            className={`w-full px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group ${
              quickGenMode === 'audio'
                ? 'bg-slate-100/90 text-slate-950 font-semibold'
                : 'text-slate-800 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-medium text-slate-900">音频生成</span>
              <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-slate-950 text-white font-bold tracking-tight">
                NEW
              </span>
            </div>
            {quickGenMode === 'audio' && (
              <Check className="w-4 h-4 text-slate-900 stroke-[2.5]" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
