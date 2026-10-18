import React from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { densityComposerSendBtn } from '@client/shared/ui/layoutClasses';
import type { QuickGenMode } from '@shared/domain/media/depthVideo';

interface PromptBarSendActionsProps {
  isAgentMode: boolean;
  canSend: boolean;
  isSubmitting: boolean;
  handleSendPrompt: () => void;
  quickGenMode: QuickGenMode;
}

export const PromptBarSendActions = React.memo(function PromptBarSendActions({
  isAgentMode,
  canSend,
  isSubmitting,
  handleSendPrompt,
  quickGenMode,
}: PromptBarSendActionsProps) {
  return (
    <div className="flex items-center ml-auto shrink-0">
      <button
        type="button"
        onClick={handleSendPrompt}
        disabled={!canSend}
        className={`${densityComposerSendBtn} rounded-full flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 shrink-0 ${
          canSend
            ? 'bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
            : 'bg-[#E5E7EB] dark:bg-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed'
        }`}
        title={
          isAgentMode
            ? '发送给 Agent 助手'
            : quickGenMode === 'depth-image'
              ? '生成深度图片'
              : quickGenMode === 'depth-video'
                ? '生成深度动作捕捉'
                : quickGenMode === 'video'
                  ? '开始生成视频'
                  : quickGenMode === 'audio'
                    ? '开始生成音频'
                    : '立即生成图片'
        }
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin text-white" />
        ) : (
          <ArrowUp className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.5]" />
        )}
      </button>
    </div>
  );
});
