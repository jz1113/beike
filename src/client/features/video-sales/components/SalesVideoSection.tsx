import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import type { VideoSalesScript } from '@shared/domain/video-sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { SalesModelPicker } from './SalesModelPicker';
import { SalesPromptDetails } from './SalesPromptDetails';
import { SalesVideoParams } from './SalesVideoParams';
import { salesCardClass } from './salesSurface';

interface Props {
  state: VideoSalesStudioState;
  script: VideoSalesScript;
  modelId: string;
  disabled: boolean;
  assetsReady: boolean;
  finalized?: boolean;
  videoError?: string | null;
  submitError?: string | null;
  onChange: (patch: Partial<VideoSalesStudioState>) => void;
  onEditPrompt: (prompt: string) => void;
}

export function SalesVideoSection({ state, script, modelId, disabled, assetsReady, finalized, videoError, submitError, onChange, onEditPrompt }: Props) {
  const { ready, videoModels } = usePreferenceModels();
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <section className={`${salesCardClass} space-y-4 p-4 sm:p-5`}>
        <h2 className="text-base font-semibold">视频定稿</h2>
        <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">选择视频模型，根据已完成的真实素材定稿一条完整提示词。定稿不会自动提交视频。</p>
        {!assetsReady ? <p role="status" className="rounded-xl bg-amber-500/[0.07] p-3 text-xs leading-6 text-amber-700 dark:text-amber-200">请先在“素材图片”完成生成与校验，视频模型和参数届时开放。</p> : <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-1.5"><span className="text-xs text-slate-500">视频模型</span><SalesModelPicker modality="video" value={state.selectedVideoModel || ''} models={videoModels} ready={ready} disabled={disabled} onChange={(selectedVideoModel) => onChange({ selectedVideoModel })} /></div>
          <div className="space-y-1.5"><span className="text-xs text-slate-500">视频能力与参数</span><SalesVideoParams modelId={modelId} refMode={state.videoRefMode} aspectRatio={state.aspectRatio} resolution={state.videoResolution} targetDuration={state.targetDuration} disabled={disabled} onChange={onChange} /></div>
        </div>}
        {assetsReady && videoError && <p role="status" className="rounded-xl bg-amber-500/[0.07] p-3 text-xs leading-6 text-amber-700 dark:text-amber-200">{videoError}</p>}
      </section>
      <section className={`${salesCardClass} space-y-3 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">最终完整视频提示词</h3><span className={`text-[11px] ${finalized ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}>{finalized ? '已定稿，可单独确认生成' : script.fullPrompt?.trim() ? '需要重新定稿' : '待定稿'}</span></div>
        {script.fullPrompt?.trim() ? <SalesPromptDetails title="最终完整视频提示词" value={script.fullPrompt} disabled={disabled || !assetsReady} onChange={onEditPrompt} rows={10} copyable note="整条视频一次提交。更换模型、参数、商品或素材后，请重新定稿。" /> : <p className="py-6 text-sm leading-7 text-slate-500 dark:text-slate-400">脚本阶段无需完整视频提示词。完成素材后，点击“定稿视频提示词”生成。</p>}
        {assetsReady && submitError && submitError !== videoError && <p role="status" className="text-xs leading-6 text-amber-700 dark:text-amber-200">{submitError}</p>}
      </section>
    </div>
  );
}
