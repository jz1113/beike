import { Check, Pencil, Sparkles } from 'lucide-react';
import { useState } from 'react';
import MarkdownCodeBlock from '@client/shared/ui/markdown/MarkdownCodeBlock';
import { eligibleSalesImages, salesActualReferences, type SalesActualReference, type VideoSalesScript } from '@shared/domain/sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { SalesPromptReferences } from './SalesPromptReferences';
import { SalesAlert, SalesIndeterminateBar, salesGhostButtonClass, salesInputClass, salesSectionTitleClass } from './salesChrome';

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
    <div className="space-y-4 p-4 sm:p-5">
      {!assetsReady && <SalesAlert>请先在“素材补齐”完成生成并确认图片，视频提示词和视频参数届时开放。</SalesAlert>}
      {assetsReady && videoError && <SalesAlert>{videoError}</SalesAlert>}
      <section aria-label="最终完整视频提示词" className="min-w-0 space-y-3">
        <h3 className={salesSectionTitleClass}>最终完整视频提示词</h3>
        {finalizing ? <div role="status" className="space-y-2.5 py-4">
          <SalesIndeterminateBar label="正在合成完整视频提示词" />
          {[92, 100, 84, 96, 70].map((width, index) => <div key={index} className="h-3 animate-pulse rounded bg-slate-200/80 dark:bg-white/10" style={{ width: `${width}%` }} />)}
        </div> : hasPrompt ? <SalesFinalPrompt prompt={script.fullPrompt || ''} references={references} disabled={disabled || !assetsReady} onChange={onEditPrompt} /> : <div className="flex min-h-64 flex-col items-center justify-center gap-2 py-10 text-center">
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

function SalesFinalPrompt({ prompt, references, disabled, onChange }: { prompt: string; references: SalesActualReference[]; disabled: boolean; onChange: (prompt: string) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <div>
      {editing ? (
        <div className="space-y-2">
          <textarea aria-label="最终完整视频提示词" value={prompt} rows={12} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${salesInputClass} mt-0 resize-y text-sm leading-7`} />
          <div className="flex justify-end"><button type="button" onClick={() => setEditing(false)} className={`h-8 ${salesGhostButtonClass}`}><Check className="h-3.5 w-3.5" />完成</button></div>
        </div>
      ) : (
        <MarkdownCodeBlock code={prompt} renderedCode={<SalesPromptReferences prompt={prompt} references={references} />} action={<button type="button" disabled={disabled} onClick={() => setEditing(true)} className={`mr-1 h-7 disabled:opacity-40 ${salesGhostButtonClass}`}><Pencil className="h-3 w-3" />编辑</button>} />
      )}
    </div>
  );
}
