import { useState } from 'react';
import { usePreferenceModels } from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import type { VideoSalesStudioState } from '../model/salesStudioDraft';
import { salesVideoPreflightError } from '../model/salesStageRules';
import { SalesModelPicker } from './SalesModelPicker';

export function SalesVideoPreflight({ state, disabled, onChange }: { state: VideoSalesStudioState; disabled: boolean; onChange: (patch: Partial<VideoSalesStudioState>) => void }) {
  const [open, setOpen] = useState(false);
  const { ready, videoModels } = usePreferenceModels();
  const issue = salesVideoPreflightError(state);
  return <div className="space-y-2 text-xs">
    {issue && <p role="status" className="leading-6 text-amber-700 dark:text-amber-300">{issue}</p>}
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-slate-500">提前检查成片模型（可选）</summary>
      {open && <div className="mt-3 space-y-2"><SalesModelPicker modality="video" value={state.selectedVideoModel || ''} models={videoModels} ready={ready} disabled={disabled} onChange={(selectedVideoModel) => onChange({ selectedVideoModel })} /><p className="leading-6 text-slate-500">可先核对时长、画幅和声音能力，减少做完素材后返工。也可到视频阶段再选择。</p></div>}
    </details>
  </div>;
}
