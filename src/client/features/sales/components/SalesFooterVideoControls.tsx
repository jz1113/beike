import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { SalesModelPicker } from './SalesModelPicker';
import { SalesVideoParams } from './SalesVideoParams';

export function SalesFooterVideoControls({ state, modelId, disabled, onChange }: {
  state: VideoSalesStudioState;
  modelId: string;
  disabled: boolean;
  onChange: (patch: Partial<VideoSalesStudioState>) => void;
}) {
  const { ready, multimodalModels, videoModels } = usePreferenceModels();
  return <div aria-label="视频设置" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
    <div role="group" aria-label="视频提示词模型" className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0">提示词</span>
      <div className="w-40"><SalesModelPicker modality="chat" value={state.selectedChatModel || ''} models={multimodalModels} ready={ready} disabled={disabled} onChange={(selectedChatModel) => onChange({ selectedChatModel })} /></div>
    </div>
    <div role="group" aria-label="视频模型" className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0">视频模型</span>
      <div className="w-40"><SalesModelPicker modality="video" value={state.selectedVideoModel || ''} models={videoModels} ready={ready} disabled={disabled} onChange={(selectedVideoModel) => onChange({ selectedVideoModel })} /></div>
    </div>
    <div role="group" aria-label="视频能力与参数" className="flex min-w-0 items-center gap-1.5 border-l border-slate-200 pl-3 dark:border-white/10">
      <span className="shrink-0">参数</span>
      <div className="w-56 max-w-full"><SalesVideoParams modelId={modelId} refMode={state.videoRefMode} aspectRatio={state.aspectRatio} resolution={state.videoResolution} targetDuration={state.targetDuration} disabled={disabled} onChange={onChange} /></div>
    </div>
  </div>;
}
