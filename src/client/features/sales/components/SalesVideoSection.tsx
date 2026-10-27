import { Sparkles } from 'lucide-react';
import { eligibleSalesImages, salesActualReferences, type SalesActualReference, type VideoSalesScript } from '@shared/domain/sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { SalesPromptEditor } from './SalesPromptEditor';
import { SalesAlert, SalesIndeterminateBar, salesSectionTitleClass } from './salesChrome';

interface Props {
  state: VideoSalesStudioState;
  script: VideoSalesScript;
  disabled: boolean;
  assetsReady: boolean;
  finalizing?: boolean;
  videoError?: string | null;
  submitError?: string | null;
  onEditPrompt: (prompt: string) => void;
}

export function SalesVideoSection({ state, script, disabled, assetsReady, finalizing, videoError, submitError, onEditPrompt }: Props) {
  const references = finalReferences(state, script);
  const hasPrompt = Boolean(script.fullPrompt?.trim());
  return (
    <div className="sales-video-workspace flex h-full min-h-0 flex-col gap-4 p-4 sm:p-5">
      {!assetsReady && <SalesAlert>请先在“素材补齐”完成生成并确认图片，视频提示词和视频参数届时开放。</SalesAlert>}
      {assetsReady && videoError && <SalesAlert>{videoError}</SalesAlert>}
      <section aria-label="最终完整视频提示词" className="sales-final-prompt-section flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {(!hasPrompt || finalizing) && <h3 className={salesSectionTitleClass}>最终完整视频提示词</h3>}
        {finalizing ? <div role="status" className="space-y-2.5 py-4">
          <SalesIndeterminateBar label="正在合成完整视频提示词" />
          {[92, 100, 84, 96, 70].map((width, index) => <div key={index} className="h-3 animate-pulse rounded bg-slate-200/80 dark:bg-white/10" style={{ width: `${width}%` }} />)}
        </div> : hasPrompt ? <SalesPromptEditor prompt={script.fullPrompt || ''} references={references} disabled={disabled || !assetsReady} onChange={onEditPrompt} /> : <div className="flex min-h-64 flex-col items-center justify-center gap-2 py-10 text-center">
          <Sparkles className="h-5 w-5 text-slate-400" aria-hidden />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">完整提示词将在这里生成</p>
        </div>}
        {assetsReady && submitError && submitError !== videoError && <SalesAlert>{submitError}</SalesAlert>}
      </section>
    </div>
  );
}

function finalReferences(state: VideoSalesStudioState, script: VideoSalesScript): SalesActualReference[] {
  try {
    return salesActualReferences(script, eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata));
  } catch {
    return [];
  }
}
