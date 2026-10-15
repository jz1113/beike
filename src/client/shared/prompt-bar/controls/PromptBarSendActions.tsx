import React from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { densityComposerSendBtn } from '@client/shared/ui/layoutClasses';
import { useI18n } from '@client/shared/i18n';
import type { QuickGenMode } from '@shared/domain/media/depthVideo';

interface PromptBarSendActionsProps {
  isAgentMode: boolean;
  canvasEnabled: boolean;
  setCanvasEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  canSend: boolean;
  isSubmitting: boolean;
  handleSendPrompt: () => void;
  quickGenMode: QuickGenMode;
}

export const PromptBarSendActions = React.memo(function PromptBarSendActions({
  isAgentMode,
  canvasEnabled,
  setCanvasEnabled,
  canSend,
  isSubmitting,
  handleSendPrompt,
  quickGenMode,
}: PromptBarSendActionsProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-center ml-auto shrink-0 gap-2 sm:gap-2.5">
      {/* 画布开关 (图2: [开关] 画布) */}
      {isAgentMode && (
        <button
          type="button"
          role="switch"
          aria-checked={canvasEnabled}
          onClick={() => setCanvasEnabled((v) => !v)}
          className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 hover:text-slate-900 select-none mr-1"
          title={t('promptBar.canvasLinkTitle')}
        >
          <span
            className={`w-7 h-4 flex items-center rounded-full p-0.5 transition-colors ${
              canvasEnabled ? 'bg-slate-900' : 'bg-slate-200'
            }`}
          >
            <span
              className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${
                canvasEnabled ? 'translate-x-3' : 'translate-x-0'
              }`}
            />
          </span>
          <span className="font-medium text-[12px]">{t('promptBar.canvasLink')}</span>
        </button>
      )}

      {/* 算力/耗时提示 (图2: ✦ 20/秒) */}
      {isAgentMode && (
        <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 text-[11px] font-medium text-slate-500 border border-slate-200/60 select-none">
          <span className="text-violet-600 font-semibold">✦ 20/秒</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleSendPrompt}
        disabled={!canSend}
        className={`${densityComposerSendBtn} rounded-full flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 shrink-0 ${
          canSend
            ? 'bg-slate-900 hover:bg-black text-white'
            : 'bg-[#E3E5EB] text-slate-400 cursor-not-allowed'
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
